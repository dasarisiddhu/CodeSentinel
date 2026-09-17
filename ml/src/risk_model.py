"""
ML Risk-Scoring Agent — public interface for the backend orchestrator.

The backend imports ONLY this module. It loads the trained model once at
process start and exposes two functions:
    score_findings(code, findings) -> list[RiskScore]
    health()                       -> dict

Never call train.py or evaluate.py at runtime. The model file must already
exist at ml/models/risk_model.json (produced by running train.py once,
pre-demo).
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

try:
    import xgboost as xgb
    _BACKEND = "xgboost"
except ImportError:
    try:
        import lightgbm as lgb
        _BACKEND = "lightgbm"
    except ImportError:
        _BACKEND = "none"

from ml.src.feature_extraction import extract_features, feature_names
from ml.src.detection.radon_wrapper import compute_complexity_metrics

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths — resolved relative to this file so the backend can import it from any cwd
# ---------------------------------------------------------------------------
_ML_ROOT = Path(__file__).resolve().parents[1]
_MODEL_PATH = _ML_ROOT / "models" / "risk_model.json"
_META_PATH = _ML_ROOT / "models" / "model_meta.json"
_FI_PATH = _ML_ROOT / "models" / "feature_importance.json"

# Severity labels in ordinal order (index matches model's label encoding)
_LABEL_ORDER = ["low", "medium", "high", "critical"]

# ---------------------------------------------------------------------------
# Singleton model loading
# ---------------------------------------------------------------------------
_model = None
_meta: dict[str, Any] = {}
_feature_importance: list[dict[str, Any]] = []
_model_loaded = False


def _load_model() -> None:
    global _model, _meta, _feature_importance, _model_loaded

    if not _MODEL_PATH.exists():
        logger.warning(
            "Risk model not found at %s. "
            "Run `python -m ml.src.train` to train the model. "
            "Scoring will return fallback values.",
            _MODEL_PATH,
        )
        _model_loaded = False
        return

    try:
        if _BACKEND == "xgboost":
            _model = xgb.XGBClassifier()
            _model.load_model(str(_MODEL_PATH))
        elif _BACKEND == "lightgbm":
            _model = lgb.Booster(model_file=str(_MODEL_PATH))
        else:
            logger.error("No ML backend available (xgboost/lightgbm not installed).")
            return

        if _META_PATH.exists():
            with open(_META_PATH) as f:
                _meta = json.load(f)

        if _FI_PATH.exists():
            with open(_FI_PATH) as f:
                _feature_importance = json.load(f)

        _model_loaded = True
        logger.info("Risk model loaded from %s (backend: %s)", _MODEL_PATH, _BACKEND)
    except Exception as exc:
        logger.error("Failed to load risk model: %s", exc)
        _model_loaded = False


# Load on import (process start)
_load_model()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_findings(
    code: str,
    findings: list[dict[str, Any]],
    filename: str | None = None,
) -> list[dict[str, Any]]:
    """
    Score a list of findings from the Detection Agent.

    Args:
        code: Raw source code that produced these findings.
        findings: List of normalized Finding dicts (from normalize.run_all_detectors()).
        filename: Optional — used for the test-file proxy feature.

    Returns:
        List of RiskScore dicts, one per input finding:
        {
          "finding_id": str,
          "risk_probability": float,          # probability of the predicted class
          "predicted_severity": str,           # critical | high | medium | low
          "top_contributing_features": [       # top 3 features driving this prediction
            {"feature": str, "weight": float}
          ]
        }

    If the model is not loaded, falls back to tool-severity passthrough with
    a risk_probability of 0.5 and an empty feature list.
    """
    if not findings:
        return []

    results = []
    for finding in findings:
        result = _score_single_finding(code, finding, findings, filename)
        results.append(result)
    return results


def health() -> dict[str, Any]:
    """Return model health status for GET /health."""
    return {
        "model_loaded": _model_loaded,
        "model_backend": _BACKEND,
        "model_path": str(_MODEL_PATH),
        "feature_count": len(feature_names()),
    }


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _score_single_finding(
    code: str,
    finding: dict[str, Any],
    all_findings: list[dict[str, Any]],
    filename: str | None,
) -> dict[str, Any]:
    """Score a single finding, using all findings as context for aggregate features."""
    finding_id = finding.get("id", "")

    if not _model_loaded or _model is None:
        return _fallback_score(finding_id, finding.get("tool_severity", "medium"))

    try:
        # Compute complexity metrics once (same code for all findings)
        complexity = compute_complexity_metrics(code)

        # Extract features using this finding's context + all findings for aggregate counts
        feat_dict = extract_features(
            code=code,
            findings=all_findings,
            complexity_metrics=complexity,
            filename=filename,
        )

        feat_names = feature_names()
        X = np.array([[feat_dict[f] for f in feat_names]], dtype=np.float32)

        # Predict
        if _BACKEND == "xgboost":
            proba = _model.predict_proba(X)[0]
            pred_idx = int(np.argmax(proba))
            risk_prob = float(proba[pred_idx])
        else:
            # lightgbm
            raw = _model.predict(X)
            if isinstance(raw, np.ndarray) and raw.ndim > 1:
                proba = raw[0]
                pred_idx = int(np.argmax(proba))
                risk_prob = float(proba[pred_idx])
            else:
                pred_idx = int(raw[0])
                risk_prob = 0.5

        label_classes = _meta.get("label_classes", _LABEL_ORDER)
        predicted_severity = label_classes[pred_idx] if pred_idx < len(label_classes) else "medium"

        # Top 3 contributing features from global feature importance
        top_features = _feature_importance[:3] if _feature_importance else []

        return {
            "finding_id": finding_id,
            "risk_probability": round(risk_prob, 4),
            "predicted_severity": predicted_severity,
            "top_contributing_features": top_features,
        }

    except Exception as exc:
        logger.warning("Scoring failed for finding %s: %s. Using fallback.", finding_id, exc)
        return _fallback_score(finding_id, finding.get("tool_severity", "medium"))


def _fallback_score(finding_id: str, tool_severity: str) -> dict[str, Any]:
    """
    Passthrough fallback when the model is unavailable or scoring fails.
    Uses the tool's own severity label and a neutral risk probability.
    """
    severity_map = {"high": "high", "medium": "medium", "low": "low"}
    return {
        "finding_id": finding_id,
        "risk_probability": 0.5,
        "predicted_severity": severity_map.get(tool_severity, "medium"),
        "top_contributing_features": [],
    }


def get_feature_importance() -> list[dict[str, Any]]:
    """Return the full feature importance list (for the frontend chart endpoint)."""
    return _feature_importance
