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

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import IngestRequest, IngestResponse
from app.services.orchestrator import run_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)


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

    logger.info(
        "ingest_received",
        extra={"review_id": review_id, "file_name": request.filename, "source": request.source},
    )
    return IngestResponse(review_id=review_id)
