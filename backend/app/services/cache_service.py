"""
CodeSentinel — In-memory LRU cache for completed Review objects.

Purpose:
  1. Demo-fallback: GET /demo/{n} serves cached reviews with zero network calls.
  2. Deduplication: submitting identical code returns the cached review_id instantly
     instead of re-running the entire pipeline.

Thread/async safety: Python's GIL + OrderedDict operations are atomic for our
use-case (no awaits inside the lock section). Good enough for a hackathon;
replace with Redis for production.
"""
from __future__ import annotations

import logging
from collections import OrderedDict

from app.core.config import settings
from app.schemas.review import ReviewResponse

logger = logging.getLogger(__name__)


class CacheService:
    """LRU cache keyed by content_hash -> (review_id, ReviewResponse)."""

    def __init__(self, max_size: int | None = None) -> None:
        self._max_size = max_size or settings.cache_max_size
        # OrderedDict preserves insertion order; we use move_to_end for LRU.
        self._store: OrderedDict[str, tuple[str, ReviewResponse]] = OrderedDict()

    # ── Public API ────────────────────────────────────────────────────────────

    def get_by_hash(self, content_hash: str) -> tuple[str, ReviewResponse] | None:
        """Return (review_id, ReviewResponse) if this exact code was seen before."""
        if content_hash in self._store:
            self._store.move_to_end(content_hash)  # refresh LRU position
            review_id, review = self._store[content_hash]
            logger.debug("cache_hit", extra={"content_hash": content_hash[:8]})
            return review_id, review
        return None

    def put(self, content_hash: str, review_id: str, review: ReviewResponse) -> None:
        """Store a completed review. Evicts oldest entry when max_size is reached."""
        if content_hash in self._store:
            self._store.move_to_end(content_hash)
        self._store[content_hash] = (review_id, review)
        if len(self._store) > self._max_size:
            evicted_hash, _ = self._store.popitem(last=False)
            logger.debug("cache_evict", extra={"evicted_hash": evicted_hash[:8]})

    def get_demo_reviews(self, n: int = 3) -> list[ReviewResponse]:
        """
        Return up to n most-recently-cached reviews for the /demo endpoint.
        Ordered newest-first. Zero network calls — purely in-memory.
        """
        items = list(self._store.values())  # oldest → newest
        reviews = [review for _, review in reversed(items)]
        return reviews[:n]

    def get_by_review_id(self, review_id: str) -> ReviewResponse | None:
        """Lookup review by review_id in memory."""
        for r_id, review in self._store.values():
            if r_id == review_id or review.review_id == review_id:
                return review
        return None

    def size(self) -> int:
        return len(self._store)

    def clear(self) -> None:
        self._store.clear()


# Module-level singleton shared across the application lifetime
cache = CacheService()
