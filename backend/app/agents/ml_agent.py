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
import logging
import sys
from pathlib import Path

from app.schemas.finding import Finding
from app.schemas.risk_score import FeatureWeight, RiskScore

logger = logging.getLogger(__name__)

# Ensure repo root is on sys.path so ml package can be imported from backend/
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Try importing Member 1's ML risk model
_risk_model_module = None
try:
    from ml.src import risk_model as _rm
    _risk_model_module = _rm
    MODEL_LOADED = bool(_rm.health().get("model_loaded", False))
except Exception as _exc:
    logger.info("ML risk model not yet loaded or initialized: %s", _exc)
    MODEL_LOADED = False

# Severity escalation map used by the heuristic fallback
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
    Falls back cleanly to heuristic scoring if the trained model is unavailable.
    """
    if not findings:
        return []

    # ── Attempt Real ML Inference ─────────────────────────────────────────────
    if _risk_model_module is not None:
        try:
            finding_dicts = [f.model_dump() for f in findings]
            raw_scores = _risk_model_module.score_findings(code=code, findings=finding_dicts)

            results: list[RiskScore] = []
            for item in raw_scores:
                top_features = [
                    FeatureWeight(
                        feature=fw.get("feature", "unknown"),
                        weight=float(fw.get("weight", 0.0)),
                    )
                    for fw in item.get("top_contributing_features", [])
                ]
                results.append(
                    RiskScore(
                        finding_id=item.get("finding_id", ""),
                        risk_probability=float(item.get("risk_probability", 0.5)),
                        predicted_severity=item.get("predicted_severity", "medium"),  # type: ignore[arg-type]
                        top_contributing_features=top_features,
                    )
                )
            if len(results) == len(findings):
                return results
        except Exception as exc:
            logger.warning("ML inference failed, falling back to heuristics: %s", exc)

    # ── Fallback Heuristic Implementation ─────────────────────────────────────
    scores: list[RiskScore] = []
    for finding in findings:
        predicted_severity, risk_prob = _SEVERITY_MAP.get(
            finding.tool_severity, ("medium", 0.5)
        )

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
