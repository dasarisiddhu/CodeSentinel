"""
CodeSentinel — Request / Response schemas for all API endpoints.
These are the types Member 3 (frontend) and Member 4 (shipper) build against.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explanation import Explanation
from app.schemas.finding import Finding
from app.schemas.risk_score import RiskScore


# ── POST /analyze ─────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Raw source code to analyse")
    language: str = Field(default="python", description="Source language tag")
    filename: str = Field(default="untitled.py")


class AnalyzeResponse(BaseModel):
    review_id: str


# ── GET /review/{review_id} ───────────────────────────────────────────────────

class ReviewResponse(BaseModel):
    review_id: str
    status: Literal["pending", "done", "failed"]
    filename: str
    language: str
    findings: list[Finding] = Field(default_factory=list)
    risk_scores: list[RiskScore] = Field(default_factory=list)
    explanations: list[Explanation] = Field(default_factory=list)
    overall_risk: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Aggregate risk probability (0.0 to 1.0) for the review",
    )
    created_at: datetime
    completed_at: datetime | None = None
    error: str | None = None


# ── POST /ingest/webhook ──────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    filename: str
    code: str = Field(..., min_length=1)
    source: Literal["watcher", "github"] = "watcher"
    language: str = "python"


class IngestResponse(BaseModel):
    review_id: str


class LiveFeedEvent(BaseModel):
    filename: str
    source: str = "watcher"
    timestamp: datetime
    review_id: str | None = None


# ── POST /pr/{review_id} ──────────────────────────────────────────────────────

class PRResponse(BaseModel):
    pr_number: int
    pr_url: str
    branch: str
    mocked: bool = False


# ── GET /health ───────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    status: Literal["ok", "degraded"] = "ok"
    groq_reachable: bool = False
    model_loaded: bool = False
    database_ok: bool = False


# ── GET /demo/{n} ─────────────────────────────────────────────────────────────

class DemoListResponse(BaseModel):
    reviews: list[ReviewResponse]
    total: int
