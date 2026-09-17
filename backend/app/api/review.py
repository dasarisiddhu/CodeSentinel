"""
GET /review/{review_id}
Returns the full pipeline results for a completed (or pending/failed) review.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import ReviewResponse
from app.services.orchestrator import get_review_by_id

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/review/{review_id}",
    response_model=ReviewResponse,
    tags=["analysis"],
    summary="Get review results",
)
async def get_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReviewResponse:
    """
    Retrieve the analysis results for a given review_id.

    Status values:
    - `pending`: pipeline still running
    - `done`:    complete — findings, risk_scores, explanations all populated
    - `failed`:  pipeline error — `error` field contains the reason
    """
    review = await get_review_by_id(db, review_id)
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id!r} not found",
        )
    return review
