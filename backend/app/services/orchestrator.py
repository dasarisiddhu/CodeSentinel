"""
CodeSentinel — Orchestrator.

Sequences the five-stage pipeline:
  Detection → ML Scoring → LLM Explanation → Diff Verification → Persist & Cache

Rules:
- If Detection returns no findings, short-circuit immediately (no LLM call).
- Every external call is wrapped in try/except + explicit logging — no silent swallows.
- Each stage is timed and logged via `log_stage` context manager.
- Result is persisted to the DB and written to the in-memory cache.
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import detection_agent, ml_agent
from app.core.logging_config import log_stage
from app.models.review import Review
from app.models.submission import Submission
from app.schemas.explanation import Explanation
from app.schemas.finding import Finding
from app.schemas.review import ReviewResponse
from app.schemas.risk_score import RiskScore
from app.services import llm_service, verification_service
from app.services.cache_service import cache

logger = logging.getLogger(__name__)


def content_hash(code: str) -> str:
    """SHA-256 of the submitted code — used as the cache key."""
    return hashlib.sha256(code.encode()).hexdigest()


async def run_pipeline(
    db: AsyncSession,
    code: str,
    language: str,
    filename: str,
    source: str = "api",
) -> tuple[str, ReviewResponse]:
    """
    Execute the full multi-agent pipeline for one code submission.

    Args:
        db:        Async DB session.
        code:      Raw source code string.
        language:  Language tag (e.g. "python").
        filename:  Source filename.
        source:    Ingestion source label ("api" | "watcher" | "github").

    Returns:
        (review_id, ReviewResponse)
    """
    chash = content_hash(code)

    # ── Cache hit: identical code already reviewed ────────────────────────────
    cached = cache.get_by_hash(chash)
    if cached:
        cached_review_id, cached_review = cached
        logger.info("cache_hit_short_circuit", extra={"review_id": cached_review_id})
        return cached_review_id, cached_review

    # ── Create DB records ─────────────────────────────────────────────────────
    submission_id = str(uuid.uuid4())
    review_id = str(uuid.uuid4())

    submission = Submission(
        id=submission_id,
        code=code,
        filename=filename,
        language=language,
        content_hash=chash,
        source=source,
    )
    db.add(submission)

    review = Review(
        id=review_id,
        submission_id=submission_id,
        status="pending",
    )
    db.add(review)
    await db.flush()  # write to DB without committing yet

    findings: list[Finding] = []
    risk_scores: list[RiskScore] = []
    explanations: list[Explanation] = []
    error_msg: str | None = None

    try:
        # ── Stage 1: Detection ────────────────────────────────────────────────
        with log_stage("detection", review_id=review_id) as ctx:
            findings = await detection_agent.analyze(code, language, filename)
            ctx["finding_count"] = len(findings)

        # ── Short-circuit if nothing found ───────────────────────────────────
        if not findings:
            logger.info("no_findings_short_circuit", extra={"review_id": review_id})
            review.status = "done"
            review.findings_json = "[]"
            review.risk_scores_json = "[]"
            review.explanations_json = "[]"
            review.completed_at = datetime.now(timezone.utc)
            await db.flush()

            response = _build_response(
                review_id, "done", filename, language,
                [], [], [], review.created_at, review.completed_at,
            )
            cache.put(chash, review_id, response)
            return review_id, response

        # ── Stage 2: ML Risk Scoring ──────────────────────────────────────────
        with log_stage("ml_scoring", review_id=review_id) as ctx:
            risk_scores = await ml_agent.score_findings(findings, code, language)
            ctx["finding_count"] = len(risk_scores)

        # ── Stage 3: LLM Explanation & Fix ───────────────────────────────────
        with log_stage("llm_explanation", review_id=review_id) as ctx:
            explanations = await llm_service.explain_findings(findings, code, filename)
            ctx["finding_count"] = len(explanations)
            ctx["mock_count"] = sum(1 for e in explanations if e.is_mock)

        # ── Stage 4: Diff Verification ────────────────────────────────────────
        with log_stage("diff_verification", review_id=review_id) as ctx:
            explanations = await verification_service.verify_diffs(explanations, code)
            ctx["verified_count"] = sum(1 for e in explanations if e.verified)
            ctx["unverified_count"] = sum(1 for e in explanations if not e.verified)

        # ── Stage 5: Persist ──────────────────────────────────────────────────
        review.status = "done"
        review.findings_json = json.dumps([f.model_dump() for f in findings])
        review.risk_scores_json = json.dumps([r.model_dump() for r in risk_scores])
        review.explanations_json = json.dumps([e.model_dump() for e in explanations])
        review.completed_at = datetime.now(timezone.utc)

    except Exception as exc:
        logger.error(
            "pipeline_failed",
            extra={"review_id": review_id, "error": str(exc)},
            exc_info=True,
        )
        error_msg = str(exc)
        review.status = "failed"
        review.error = error_msg
        review.completed_at = datetime.now(timezone.utc)

    await db.flush()

    response = _build_response(
        review_id,
        review.status,  # type: ignore[arg-type]
        filename,
        language,
        findings,
        risk_scores,
        explanations,
        review.created_at,
        review.completed_at,
        error_msg,
    )

    if review.status == "done":
        cache.put(chash, review_id, response)

    return review_id, response


async def get_review_by_id(db: AsyncSession, review_id: str) -> ReviewResponse | None:
    """Load a review from the DB and reconstruct a ReviewResponse."""
    from sqlalchemy import select

    # Join Review + Submission to get filename/language
    stmt = (
        select(Review, Submission)
        .join(Submission, Review.submission_id == Submission.id)
        .where(Review.id == review_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return None

    review, submission = row

    findings = _load_json(review.findings_json, Finding)
    risk_scores = _load_json(review.risk_scores_json, RiskScore)
    explanations = _load_json(review.explanations_json, Explanation)

    return _build_response(
        review_id,
        review.status,  # type: ignore[arg-type]
        submission.filename,
        submission.language,
        findings,
        risk_scores,
        explanations,
        review.created_at,
        review.completed_at,
        review.error,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_response(
    review_id: str,
    status: str,
    filename: str,
    language: str,
    findings: list[Finding],
    risk_scores: list[RiskScore],
    explanations: list[Explanation],
    created_at: datetime,
    completed_at: datetime | None,
    error: str | None = None,
) -> ReviewResponse:
    return ReviewResponse(
        review_id=review_id,
        status=status,  # type: ignore[arg-type]
        filename=filename,
        language=language,
        findings=findings,
        risk_scores=risk_scores,
        explanations=explanations,
        created_at=created_at,
        completed_at=completed_at,
        error=error,
    )


def _load_json(raw: str | None, model_class: type) -> list:
    if not raw:
        return []
    try:
        items = json.loads(raw)
        return [model_class(**item) for item in items]
    except Exception:
        return []
