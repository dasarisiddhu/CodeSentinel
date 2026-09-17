"""
Evaluation script — runs the trained model on the held-out test set and prints
a full classification report. Run this separately from train.py to get an
independent evaluation (train.py evaluates on its own 20% split; this reads
the separate test.csv produced at dataset-build time).

Usage:
    python -m ml.src.evaluate
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix

try:
    import xgboost as xgb
    _MODEL_TYPE = "xgboost"
except ImportError:
    try:
        import lightgbm as lgb
        _MODEL_TYPE = "lightgbm"
    except ImportError:
        print("ERROR: neither xgboost nor lightgbm is installed.")
        sys.exit(1)

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns
    PLOTTING_AVAILABLE = True
except ImportError:
    PLOTTING_AVAILABLE = False

from ml.src.feature_extraction import feature_names

ROOT = Path(__file__).resolve().parents[2]
TEST_CSV = ROOT / "data" / "processed" / "test.csv"
MODEL_PATH = ROOT / "models" / "risk_model.json"
MODEL_META_PATH = ROOT / "models" / "model_meta.json"
EVAL_DIR = ROOT / "eval"

LABEL_ORDER = ["low", "medium", "high", "critical"]


def main() -> None:
    # Load model meta (label classes, feature names)
    if not MODEL_META_PATH.exists():
        print(f"ERROR: model meta not found at {MODEL_META_PATH}. Run train.py first.")
        sys.exit(1)

    with open(MODEL_META_PATH) as f:
        meta = json.load(f)

    label_classes = meta["label_classes"]
    features = meta["feature_names"]

    # Load model
    if _MODEL_TYPE == "xgboost":
        model = xgb.XGBClassifier()
        model.load_model(str(MODEL_PATH))
    else:
        model = lgb.Booster(model_file=str(MODEL_PATH))

    # Load test set
    if not TEST_CSV.exists():
        print(f"ERROR: {TEST_CSV} not found.")
        sys.exit(1)

    df = pd.read_csv(TEST_CSV)
    df = df.dropna(subset=features + ["label"])
    df = df[df["label"].isin(label_classes)]

    le = LabelEncoder()
    le.classes_ = np.array(label_classes)
    y_true = le.transform(df["label"])
    X = df[features].values.astype(np.float32)

    # Predict
    if _MODEL_TYPE == "xgboost":
        y_pred = model.predict(X)
    else:
        raw = model.predict(X)
        y_pred = np.argmax(raw, axis=1) if raw.ndim > 1 else raw.astype(int)

    # Report
    report = classification_report(y_true, y_pred, target_names=label_classes, digits=4)
    print("=== CodeSentinel Risk Model — Test Set Evaluation ===")
    print(report)

    cm = confusion_matrix(y_true, y_pred)
    print("Confusion Matrix:")
    cm_df = pd.DataFrame(cm, index=label_classes, columns=label_classes)
    print(cm_df.to_string())

    # Save updated eval artifacts
    report_dict = classification_report(y_true, y_pred, target_names=label_classes, output_dict=True)
    eval_output = {
        "test_set_size": int(len(y_true)),
        "per_class": {
            label: {
                "precision": round(report_dict[label]["precision"], 4),
                "recall": round(report_dict[label]["recall"], 4),
                "f1": round(report_dict[label]["f1-score"], 4),
                "support": int(report_dict[label]["support"]),
            }
            for label in label_classes if label in report_dict
        },
        "macro_avg": {
            "precision": round(report_dict["macro avg"]["precision"], 4),
            "recall": round(report_dict["macro avg"]["recall"], 4),
            "f1": round(report_dict["macro avg"]["f1-score"], 4),
        },
        "confusion_matrix": cm.tolist(),
    }

    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    metrics_path = EVAL_DIR / "metrics.json"
    with open(metrics_path, "w") as fh:
        json.dump(eval_output, fh, indent=2)
    print(f"\n[eval] Saved to {metrics_path}")

    if PLOTTING_AVAILABLE:
        fig, ax = plt.subplots(figsize=(6, 5))
        sns.heatmap(cm, annot=True, fmt="d", xticklabels=label_classes,
                    yticklabels=label_classes, cmap="Blues", ax=ax)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title(f"Test Set Confusion Matrix\nMacro F1: {eval_output['macro_avg']['f1']:.4f}")
        fig.tight_layout()
        cm_path = EVAL_DIR / "confusion_matrix.png"
        fig.savefig(cm_path, dpi=150)
        plt.close(fig)
        print(f"[eval] Confusion matrix saved to {cm_path}")


if __name__ == "__main__":
    main()
