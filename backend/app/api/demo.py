"""
GET /demo/{n}
Returns the last N completed reviews from the in-memory cache.
Zero network calls — purely from memory.

This is the "demo fallback" endpoint:
- By T+4:30 the team should have run 2-3 real analyses and cached them.
- If the live Groq/GitHub path fails mid-pitch, the frontend's "Demo Mode"
  toggle hits this endpoint and serves instant results.
- Test by disconnecting the network and hitting GET /demo/3.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.review import DemoListResponse, ReviewResponse
from app.services.cache_service import cache

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/demo/{n}",
    response_model=DemoListResponse,
    tags=["demo"],
    summary="Serve cached reviews for demo fallback",
)
async def get_demo_reviews(
    n: int,
) -> DemoListResponse:
    """
    Return the last `n` completed reviews from the in-memory LRU cache.

    Used by the frontend Demo Mode toggle — requires zero network calls.
    Returns an empty list (not an error) if the cache is empty.
    """
    if n < 1 or n > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="n must be between 1 and 20",
        )

    reviews: list[ReviewResponse] = cache.get_demo_reviews(n)
    logger.info("demo_served", extra={"requested": n, "returned": len(reviews)})

    return DemoListResponse(reviews=reviews, total=len(reviews))
