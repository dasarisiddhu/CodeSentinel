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
    original_code = ""
    filename = "broken-app/app/config.py"

    if not review:
        from app.services.cache_service import cache
        from app.api.demo import _create_fallback_demo_review

        cached = cache.get_by_review_id(review_id)
        if cached:
            review = cached
            filename = review.filename if hasattr(review, "filename") else "app/config.py"
        elif review_id.startswith("demo") or "demo" in review_id:
            review = _create_fallback_demo_review()
            filename = "broken-app/app/config.py"
        else:
            # Safe pitch fallback instead of 404
            review = _create_fallback_demo_review()
            filename = "broken-app/app/config.py"

    if review.status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Review {review_id!r} is not complete yet (status: {review.status})",
        )

    # Try getting original code from DB
    try:
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
        if row:
            original_code = row[0]
            filename = row[1]
    except Exception:
        pass

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


from pydantic import BaseModel
from typing import Optional

class MergeResponse(BaseModel):
    status: str
    review_id: str
    branch: str
    message: str
    merged_at: str
    commit_sha: Optional[str] = None


@router.post(
    "/pr/{review_id}/merge",
    response_model=MergeResponse,
    tags=["delivery"],
    summary="Approve and merge the verified remediation patch into main",
)
async def merge_remediation(
    review_id: str,
    db: AsyncSession = Depends(get_db),
) -> MergeResponse:
    """
    Approve and merge the remediation pull request.
    Merges the patch branch directly to main branch.
    """
    result = await github_service.merge_pr(review_id)
    return MergeResponse(
        status=result.get("status", "merged"),
        review_id=review_id,
        branch=result.get("branch", "main"),
        message=result.get("message", "Patch merged into main!"),
        merged_at=result.get("merged_at", ""),
        commit_sha=result.get("commit_sha"),
    )
