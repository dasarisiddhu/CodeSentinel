"""
POST /analyze
Accepts raw source code, kicks off the analysis pipeline as a background task,
and returns a review_id immediately (202 Accepted).

The frontend polls GET /review/{review_id} until status == "done" | "failed".
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import AnalyzeRequest, AnalyzeResponse
from app.services.orchestrator import run_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["analysis"],
    summary="Submit code for analysis",
)
async def analyze(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> AnalyzeResponse:
    """
    Submit source code for the full pipeline:
    Detection → ML Scoring → LLM Explanation → Diff Verification.

    Returns a review_id immediately. Poll GET /review/{review_id} for results.
    """
    # Run synchronously so review_id is stable before we return.
    # The pipeline is fast enough for a hackathon demo (<30s end-to-end).
    # For production, move to a task queue (Celery/ARQ).
    review_id, _ = await run_pipeline(
        db=db,
        code=request.code,
        language=request.language,
        filename=request.filename,
        source="api",
    )

    logger.info("analyze_submitted", extra={"review_id": review_id, "file_name": request.filename})
    return AnalyzeResponse(review_id=review_id)
