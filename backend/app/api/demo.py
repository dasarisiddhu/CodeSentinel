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

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.explanation import Explanation
from app.schemas.finding import Finding
from app.schemas.review import DemoListResponse, ReviewResponse
from app.schemas.risk_score import FeatureWeight, RiskScore
from app.services.cache_service import cache

router = APIRouter()
logger = logging.getLogger(__name__)


def _create_fallback_demo_review() -> ReviewResponse:
    """Fallback review matching broken-app config.py for instant demo."""
    f1 = Finding(
        id="f-demo-001",
        file="config.py",
        line_start=14,
        line_end=14,
        rule_id="bandit.B105.hardcoded_password_string",
        category="security",
        tool_severity="high",
        message="Possible hardcoded password or secret key assigned in source code.",
        code_snippet='SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"',
    )
    f2 = Finding(
        id="f-demo-002",
        file="config.py",
        line_start=17,
        line_end=17,
        rule_id="bandit.B105.hardcoded_password_string",
        category="security",
        tool_severity="high",
        message="Hardcoded API key detected in source code.",
        code_snippet='PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"',
    )
    r1 = RiskScore(
        finding_id="f-demo-001",
        risk_probability=0.91,
        predicted_severity="critical",
        top_contributing_features=[
            FeatureWeight(feature="dangerous_sink_count", weight=0.42),
            FeatureWeight(feature="tool_severity", weight=0.38),
            FeatureWeight(feature="category_security", weight=0.20),
        ],
    )
    r2 = RiskScore(
        finding_id="f-demo-002",
        risk_probability=0.87,
        predicted_severity="high",
        top_contributing_features=[
            FeatureWeight(feature="dangerous_sink_count", weight=0.40),
            FeatureWeight(feature="tool_severity", weight=0.35),
            FeatureWeight(feature="category_security", weight=0.25),
        ],
    )
    e1 = Explanation(
        finding_id="f-demo-001",
        plain_english_explanation="A secret key is hardcoded directly in the configuration file, which leaks credentials into version control.",
        severity_rationale="Anyone with repository read access can forge session cookies and authenticate as any user.",
        fix_suggestion="Load SECRET_KEY from the environment and raise an error if it is not set in production.",
        fix_diff="--- config.py\n+++ config.py\n@@ -13,3 +13,4 @@\n-SECRET_KEY = \"super-secret-dev-key-do-not-use-in-prod-1234\"\n+SECRET_KEY = os.environ.get(\"SECRET_KEY\")\n+if not SECRET_KEY:\n+    raise ValueError(\"SECRET_KEY must be set\")",
        confidence=0.94,
        verified=True,
        is_mock=False,
    )
    e2 = Explanation(
        finding_id="f-demo-002",
        plain_english_explanation="A live third-party payment API key is hardcoded into source code.",
        severity_rationale="Live payment credentials in code allows unauthorized payment gateway operations and financial loss.",
        fix_suggestion="Move payment credentials to environment variables or a secure secret manager.",
        fix_diff="--- config.py\n+++ config.py\n@@ -16,2 +16,2 @@\n-PAYMENT_API_KEY = \"pk_live_abc123xyz_hardcoded_payment_key\"\n+PAYMENT_API_KEY = os.environ.get(\"PAYMENT_API_KEY\", \"\")",
        confidence=0.91,
        verified=True,
        is_mock=False,
    )
    return ReviewResponse(
        review_id="demo-review-001",
        status="done",
        filename="config.py",
        language="python",
        findings=[f1, f2],
        risk_scores=[r1, r2],
        explanations=[e1, e2],
        overall_risk=0.91,
        created_at=datetime.now(timezone.utc),
    )


@router.get(
    "/demo/review",
    response_model=ReviewResponse,
    tags=["demo"],
    summary="Get single demo review for frontend demo mode",
)
async def get_demo_review_single() -> ReviewResponse:
    """Return the latest cached demo review or a pre-built fallback review."""
    reviews = cache.get_demo_reviews(1)
    if reviews:
        return reviews[0]
    return _create_fallback_demo_review()


@router.get(
    "/demo/reviews",
    response_model=DemoListResponse,
    tags=["demo"],
    summary="Serve all cached reviews for demo fallback",
)
async def get_demo_reviews_all() -> DemoListResponse:
    """Return all cached demo reviews."""
    reviews = cache.get_demo_reviews(10)
    if not reviews:
        reviews = [_create_fallback_demo_review()]
    return DemoListResponse(reviews=reviews, total=len(reviews))


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
