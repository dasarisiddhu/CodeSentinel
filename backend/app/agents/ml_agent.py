"""
CodeSentinel — ML Risk-Scoring Agent interface stub.

╔══════════════════════════════════════════════════════════════════════════════╗
║  TEAM MEMBER 1 — REPLACE THE BODY OF `score_findings()` WITH YOUR MODEL    ║
║  Signature and return type MUST stay exactly the same.                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

This agent re-ranks Detection Agent findings using an XGBoost/LightGBM model
trained on the Juliet Test Suite.

Contract:
    score_findings(findings, code, language) -> List[RiskScore]

One RiskScore per Finding, ordered to match findings order.
The model only scores findings the Detection Agent already produced —
it NEVER runs on raw code with no prior findings.

PRD Section 3.2 for full feature list (~15-20 engineered features).
"""
from __future__ import annotations

from app.schemas.finding import Finding
from app.schemas.risk_score import FeatureWeight, RiskScore

# Severity escalation map used by the stub
_SEVERITY_MAP = {
    "high": ("critical", 0.87),
    "medium": ("high", 0.62),
    "low": ("medium", 0.35),
}


async def score_findings(
    findings: list[Finding],
    code: str,
    language: str,
) -> list[RiskScore]:
    """
    Score each finding using the trained gradient-boosted classifier.

    Args:
        findings:  List of Finding objects from the Detection Agent.
        code:      Full source code (needed to extract holistic features).
        language:  Language tag.

    Returns:
        List of RiskScore objects, one per finding, same order as `findings`.

    ──────────────────────────────────────────────────────────────────────────
    STUB IMPLEMENTATION — applies a simple heuristic based on tool_severity.
    Replace this body entirely with your trained model inference.
    ──────────────────────────────────────────────────────────────────────────
    """
    scores: list[RiskScore] = []

    for finding in findings:
        predicted_severity, risk_prob = _SEVERITY_MAP.get(
            finding.tool_severity, ("medium", 0.5)
        )

        # Heuristic: security findings are riskier than code smells
        category_boost = 0.1 if finding.category == "security" else 0.0
        risk_prob = min(1.0, risk_prob + category_boost)

        scores.append(
            RiskScore(
                finding_id=finding.id,
                risk_probability=round(risk_prob, 3),
                predicted_severity=predicted_severity,  # type: ignore[arg-type]
                top_contributing_features=[
                    FeatureWeight(feature="tool_severity", weight=0.55),
                    FeatureWeight(feature="category_security", weight=0.25),
                    FeatureWeight(feature="dangerous_sink_count", weight=0.20),
                ],
            )
        )

    return scores
