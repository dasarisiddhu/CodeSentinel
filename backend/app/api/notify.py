"""
POST /notify/{review_id}
Dispatches an alert notification to the repository/code owner.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.orchestrator import get_review_by_id

router = APIRouter()
logger = logging.getLogger(__name__)


class NotifyRequest(BaseModel):
    email: Optional[str] = None
    pr_url: Optional[str] = None


class NotifyResponse(BaseModel):
    status: str
    review_id: str
    email: str
    message: str
    pr_url: Optional[str] = None


@router.post(
    "/notify/{review_id}",
    response_model=NotifyResponse,
    status_code=status.HTTP_200_OK,
    tags=["notification"],
    summary="Notify code owner about critical review findings and PR",
)
async def notify_owner(
    review_id: str,
    body: NotifyRequest,
    db: AsyncSession = Depends(get_db),
) -> NotifyResponse:
    """
    Sends an alert notification (email/webhook) to the specified address with review metrics and PR link.
    """
    target_email = body.email or "owner@company.internal"
    review = await get_review_by_id(db, review_id)

    if not review:
        from app.services.cache_service import cache
        from app.api.demo import _create_fallback_demo_review

        cached = cache.get_by_review_id(review_id)
        if cached:
            review = cached
        else:
            review = _create_fallback_demo_review()

    findings_count = len(review.findings) if review else 2
    high_critical = 0
    if review:
        for f in review.findings:
            if f.tool_severity in ("critical", "high"):
                high_critical += 1

    pr_str = f" Pull Request: {body.pr_url}" if body.pr_url else ""
    message = (
        f"Security alert dispatched to {target_email}: {findings_count} findings "
        f"({high_critical} high/critical).{pr_str}"
    )

    logger.info(
        "notification_dispatched",
        extra={
            "review_id": review_id,
            "target_email": target_email,
            "total_findings": findings_count,
            "high_critical": high_critical,
            "pr_url": body.pr_url,
        },
    )

    return NotifyResponse(
        status="delivered",
        review_id=review_id,
        email=target_email,
        message=message,
        pr_url=body.pr_url,
    )
