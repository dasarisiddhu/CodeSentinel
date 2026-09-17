"""
POST /ingest/webhook
Entry point for Team Member 4's file-watcher (and optionally GitHub webhooks).
Accepts {filename, code, source} and runs the SAME pipeline as /analyze.
Not a separate code path — just a different HTTP entry point.

Team Member 4 should POST to this endpoint with:
  {
    "filename": "app/routes/user.py",
    "code": "<file contents>",
    "source": "watcher"        // or "github"
  }
"""
from __future__ import annotations

import logging

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import IngestRequest, IngestResponse, LiveFeedEvent
from app.services.orchestrator import run_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory buffer of recent ingestion events for the live feed indicator
_recent_events: list[LiveFeedEvent] = []
_MAX_RECENT_EVENTS = 30


def record_event(filename: str, source: str = "watcher", review_id: str | None = None) -> LiveFeedEvent:
    """Record an ingestion event so the frontend live feed indicator detects it."""
    event = LiveFeedEvent(
        filename=filename,
        source=source,
        timestamp=datetime.now(timezone.utc),
        review_id=review_id,
    )
    _recent_events.append(event)
    if len(_recent_events) > _MAX_RECENT_EVENTS:
        _recent_events.pop(0)
    return event


@router.post(
    "/ingest/webhook",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["ingestion"],
    summary="Ingest code from file-watcher or GitHub webhook",
)
async def ingest_webhook(
    request: IngestRequest,
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    """
    Ingest a source file from the broken-app file-watcher or a GitHub push webhook.
    Runs the identical pipeline as POST /analyze.
    """
    review_id, _ = await run_pipeline(
        db=db,
        code=request.code,
        language=request.language,
        filename=request.filename,
        source=request.source,
    )

    record_event(request.filename, request.source, review_id)

    logger.info(
        "ingest_received",
        extra={"review_id": review_id, "file_name": request.filename, "source": request.source},
    )
    return IngestResponse(review_id=review_id)


@router.get(
    "/ingest/events",
    response_model=list[LiveFeedEvent],
    tags=["ingestion"],
    summary="Poll recent live ingestion events",
)
async def get_ingest_events() -> list[LiveFeedEvent]:
    """Return recent file-watcher / webhook events to illuminate the frontend live indicator."""
    return list(_recent_events)
