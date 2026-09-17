"""
POST /pr/{review_id}
Open a GitHub PR with the first verified fix diff for this review.
Falls back to a mock PR if GitHub is not configured or any API call fails.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import PRResponse
from app.services import github_service
from app.services.orchestrator import get_review_by_id

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/pr/{review_id}",
    response_model=PRResponse,
    tags=["delivery"],
    summary="Open a GitHub PR with the verified fix",
)
async def create_pr(
    review_id: str,
    db: AsyncSession = Depends(get_db),
) -> PRResponse:
    """
    Open a GitHub PR for the review's first verified fix diff.

    - If GITHUB_TOKEN + GITHUB_REPO are configured: opens a real PR.
    - Otherwise: returns a mock PR response with identical shape (mocked=true).
    - Any GitHub API error falls back to mock — the demo never fails on this route.
    """
    review = await get_review_by_id(db, review_id)
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id!r} not found",
        )

    if review.status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Review {review_id!r} is not complete yet (status: {review.status})",
        )

    # Get original code from DB to reconstruct the fix target
    from sqlalchemy import select
    from app.models.review import Review as ReviewModel
    from app.models.submission import Submission

    stmt = (
        select(Submission.code, Submission.filename)
        .join(ReviewModel, ReviewModel.submission_id == Submission.id)
        .where(ReviewModel.id == review_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    original_code = row[0] if row else ""
    filename = row[1] if row else review.filename

    pr_response = await github_service.open_pr(
        review_id=review_id,
        explanations=review.explanations,
        original_code=original_code,
        filename=filename,
    )

    logger.info(
        "pr_created",
        extra={
            "review_id": review_id,
            "pr_url": pr_response.pr_url,
            "mocked": pr_response.mocked,
        },
    )
    return pr_response
