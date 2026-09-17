"""
CodeSentinel — Explanation schema.
PRD Section 3.3 fields + verification annotations added by our verification pass.
Produced by the LLM Explanation & Fix Agent, then annotated by VerificationService.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class Explanation(BaseModel):
    finding_id: str = Field(..., description="Matches Finding.id")
    plain_english_explanation: str
    severity_rationale: str
    fix_suggestion: str = Field(..., description="Prose description of the fix")
    fix_diff: str = Field(..., description="Unified diff string")
    confidence: float = Field(..., ge=0.0, le=1.0)

    # ── Set by VerificationService — never by the LLM ─────────────────────
    verified: bool = Field(
        default=False,
        description="True if fix_diff applies cleanly against the submitted source",
    )
    verified_error: str | None = Field(
        default=None,
        description="Patch error message when verified=False; None when verified=True",
    )
    is_mock: bool = Field(
        default=False,
        description="True when the LLM fallback chain reached the deterministic mock",
    )
