"""
Training script — trains the XGBoost/LightGBM risk-scoring classifier.

Usage:
    python -m ml.src.train

Reads:  ml/data/processed/train.csv  (produced by data prep notebook or build_dataset.py)
Writes: ml/models/risk_model.json
        ml/models/feature_importance.json
        ml/eval/metrics.json
        ml/eval/confusion_matrix.png

The CSV must have all columns from feature_extraction.feature_names() plus a 'label' column
with values in: critical, high, medium, low
"""

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

try:
    import xgboost as xgb
    _MODEL_TYPE = "xgboost"
except ImportError:
    try:
        import lightgbm as lgb
        _MODEL_TYPE = "lightgbm"
    except ImportError:
        print("ERROR: neither xgboost nor lightgbm is installed. Run: pip install xgboost")
        sys.exit(1)

try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend for CI/headless
    import matplotlib.pyplot as plt
    import seaborn as sns
    PLOTTING_AVAILABLE = True
except ImportError:
    PLOTTING_AVAILABLE = False

from ml.src.feature_extraction import feature_names

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
TRAIN_CSV = ROOT / "data" / "processed" / "train.csv"
MODEL_DIR = ROOT / "models"
EVAL_DIR = ROOT / "eval"

MODEL_DIR.mkdir(parents=True, exist_ok=True)
EVAL_DIR.mkdir(parents=True, exist_ok=True)

# Label order for consistent encoding
LABEL_ORDER = ["low", "medium", "high", "critical"]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"[train] Using model backend: {_MODEL_TYPE}")

    # Load training data
    if not TRAIN_CSV.exists():
        print(f"ERROR: {TRAIN_CSV} not found. Run the data prep notebook first.")
        sys.exit(1)

    df = pd.read_csv(TRAIN_CSV)
    print(f"[train] Loaded {len(df)} rows from {TRAIN_CSV}")

    # Validate columns
    features = feature_names()
    missing = [c for c in features if c not in df.columns]
    if missing:
        print(f"ERROR: Missing feature columns in CSV: {missing}")
        sys.exit(1)
    if "label" not in df.columns:
        print("ERROR: 'label' column not found in CSV.")
        sys.exit(1)

    # Drop rows with any NaN in feature columns
    before = len(df)
    df = df.dropna(subset=features + ["label"])
    after = len(df)
    if before != after:
        print(f"[train] Dropped {before - after} rows with NaN values.")

    # Encode labels
    le = LabelEncoder()
    le.classes_ = np.array(LABEL_ORDER)
    # Filter to known labels only
    df = df[df["label"].isin(LABEL_ORDER)]
    y = le.transform(df["label"])
    X = df[features].values.astype(np.float32)

    print(f"[train] Label distribution:\n{pd.Series(df['label']).value_counts().to_string()}")

    # Train/val split (20% held out for evaluation, matching test.csv split)
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"[train] Train: {len(X_train)} | Val: {len(X_val)}")

    # Train model
    t0 = time.time()
    model = _train_model(X_train, y_train, num_classes=len(LABEL_ORDER))
    elapsed = time.time() - t0
    print(f"[train] Training complete in {elapsed:.1f}s")

    # Evaluate
    y_pred = _predict(model, X_val)
    _evaluate_and_save(model, X_val, y_val, y_pred, le, features, elapsed)

    # Save model
    _save_model(model, features, le)

    print("[train] Done. Model and evaluation artifacts saved.")


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

def _train_model(X_train: np.ndarray, y_train: np.ndarray, num_classes: int):
    if _MODEL_TYPE == "xgboost":
        params = {
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "use_label_encoder": False,
            "eval_metric": "mlogloss",
            "random_state": 42,
            "n_jobs": -1,
        }
        if num_classes > 2:
            params["objective"] = "multi:softprob"
            params["num_class"] = num_classes
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train)
        return model
    else:
        # lightgbm
        params = {
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "random_state": 42,
            "n_jobs": -1,
            "verbose": -1,
        }
        if num_classes > 2:
            params["objective"] = "multiclass"
            params["num_class"] = num_classes
        model = lgb.LGBMClassifier(**params)
        model.fit(X_train, y_train)
        return model


def _predict(model, X_val: np.ndarray) -> np.ndarray:
    return model.predict(X_val)


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def _evaluate_and_save(
    model,
    X_val: np.ndarray,
    y_val: np.ndarray,
    y_pred: np.ndarray,
    le: LabelEncoder,
    features: list[str],
    training_time_s: float,
) -> None:
    label_names = list(le.classes_)
    report = classification_report(y_val, y_pred, target_names=label_names, output_dict=True)
    cm = confusion_matrix(y_val, y_pred)

    metrics = {
        "model_type": _MODEL_TYPE,
        "training_time_seconds": round(training_time_s, 2),
        "label_order": LABEL_ORDER,
        "per_class": {
            label: {
                "precision": round(report[label]["precision"], 4),
                "recall": round(report[label]["recall"], 4),
                "f1": round(report[label]["f1-score"], 4),
                "support": int(report[label]["support"]),
            }
            for label in label_names if label in report
        },
        "macro_avg": {
            "precision": round(report["macro avg"]["precision"], 4),
            "recall": round(report["macro avg"]["recall"], 4),
            "f1": round(report["macro avg"]["f1-score"], 4),
        },
        "weighted_avg": {
            "precision": round(report["weighted avg"]["precision"], 4),
            "recall": round(report["weighted avg"]["recall"], 4),
            "f1": round(report["weighted avg"]["f1-score"], 4),
        },
        "confusion_matrix": cm.tolist(),
    }

    metrics_path = EVAL_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[eval] Metrics saved to {metrics_path}")
    print(f"[eval] Macro F1: {metrics['macro_avg']['f1']:.4f}")

    # Confusion matrix plot
    if PLOTTING_AVAILABLE:
        fig, ax = plt.subplots(figsize=(6, 5))
        sns.heatmap(
            cm,
            annot=True,
            fmt="d",
            xticklabels=label_names,
            yticklabels=label_names,
            cmap="Blues",
            ax=ax,
        )
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title(f"CodeSentinel Risk Model — Confusion Matrix\nMacro F1: {metrics['macro_avg']['f1']:.4f}")
        fig.tight_layout()
        cm_path = EVAL_DIR / "confusion_matrix.png"
        fig.savefig(cm_path, dpi=150)
        plt.close(fig)
        print(f"[eval] Confusion matrix saved to {cm_path}")


# ---------------------------------------------------------------------------
# Model + feature importance export
# ---------------------------------------------------------------------------

def _save_model(model, features: list[str], le: LabelEncoder) -> None:
    # Save model in native format (loads in <1s)
    model_path = MODEL_DIR / "risk_model.json"
    if _MODEL_TYPE == "xgboost":
        model.save_model(str(model_path))
    else:
        model.booster_.save_model(str(model_path))
    print(f"[model] Saved to {model_path}")

    # Export feature importances for frontend chart
    if _MODEL_TYPE == "xgboost":
        importances = model.feature_importances_.tolist()
    else:
        importances = model.feature_importances_.tolist()

    fi = sorted(
        [{"feature": f, "weight": round(float(w), 6)} for f, w in zip(features, importances)],
        key=lambda x: x["weight"],
        reverse=True,
    )
    fi_path = MODEL_DIR / "feature_importance.json"
    with open(fi_path, "w") as fh:
        json.dump(fi, fh, indent=2)
    print(f"[model] Feature importances saved to {fi_path}")
    print("[model] Top 5 features:")
    for item in fi[:5]:
        print(f"         {item['feature']}: {item['weight']:.4f}")

    # Save label encoder classes alongside the model
    meta = {
        "label_classes": list(le.classes_),
        "feature_names": features,
        "model_type": _MODEL_TYPE,
    }
    meta_path = MODEL_DIR / "model_meta.json"
    with open(meta_path, "w") as fh:
        json.dump(meta, fh, indent=2)
    print(f"[model] Metadata saved to {meta_path}")


if __name__ == "__main__":
    main()
