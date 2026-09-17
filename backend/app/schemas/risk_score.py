"""
CodeSentinel — RiskScore schema.
Exact field names from PRD Section 3.2.
Produced by the ML Risk-Scoring Agent (XGBoost/LightGBM).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FeatureWeight(BaseModel):
    feature: str
    weight: float


class RiskScore(BaseModel):
    finding_id: str = Field(..., description="Matches Finding.id")
    risk_probability: float = Field(..., ge=0.0, le=1.0)
    predicted_severity: Literal["critical", "high", "medium", "low"]
    top_contributing_features: list[FeatureWeight] = Field(
        default_factory=list,
        description="Top features driving this risk score (for UI and pitch)",
    )
