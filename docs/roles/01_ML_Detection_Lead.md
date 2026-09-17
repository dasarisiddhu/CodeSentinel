# Team Member 1 — ML & Risk-Scoring Lead
**CodeSentinel | Owns: the "hard core ML" component**

Read `docs/PRD.md` Sections 3.2 and 5 first — this file is your execution plan, that file is your spec.

---

## Your one job

Build a **real, trained, evaluated** classifier that takes findings the Detection Agent already produced (plus code-level features) and outputs a risk score + severity prediction + feature importances. You are **not** building a bug detector — Semgrep/Bandit already do that. You are building the layer that makes severity classification more than "whatever the tool's default tag says."

**Say this to yourself before you touch a deep learning library:** a gradient-boosted tree on ~20 engineered features trains in minutes on a CPU and is explainable. A fine-tuned transformer needs a GPU, an hour-plus, and gives you a worse demo story. Do not deviate unless the whole team is materially ahead of schedule at T+3:00.

---

## Files you own

```
ml/
├── src/
│   ├── detection/
│   │   ├── semgrep_wrapper.py      <- Detection Agent wrapper
│   │   ├── bandit_wrapper.py       <- Detection Agent wrapper
│   │   ├── radon_wrapper.py        <- Complexity metrics
│   │   └── normalize.py            <- Merge all tool outputs into Finding[]
│   ├── feature_extraction.py       <- extract_features(code, findings) -> dict
│   ├── train.py                    <- Train XGBoost/LightGBM, save model + metrics
│   ├── evaluate.py                 <- Precision/recall/F1, confusion matrix
│   └── risk_model.py               <- score_findings(code, findings) -> RiskScore[]
├── data/
│   ├── raw/                        <- Gitignored; downloaded datasets live here
│   └── processed/
│       ├── features.csv
│       ├── train.csv
│       ├── test.csv
│       └── label_mapping.md        <- Document your severity bucket mapping here
├── models/
│   ├── risk_model.json             <- Exported XGBoost model
│   └── feature_importance.json     <- For frontend chart (Member 3 consumes this)
└── eval/
    ├── metrics.json                <- precision/recall/F1/confusion matrix
    └── confusion_matrix.png
```

---

## Pre-event checklist (confirm dataset download is allowed under the rules)

- [ ] Lock target language with the team: **Python.** Everything below assumes Python.
- [ ] Download VUDENC from Zenodo record `3559841` — pick **SQL injection** and **command injection** categories.
- [ ] Install: `xgboost` or `lightgbm`, `scikit-learn`, `radon`, `semgrep`, `bandit`, `pandas`.
- [ ] Optionally download Juliet Test Suite C/C++ 1.3 from `samate.nist.gov/SARD/test-suites/112`.
- [ ] Read `docs/datasets.md` for the full feature-label mapping instructions.

---

## Hour-by-hour plan

### T+0:00–0:20 — All-hands
- Confirm `Finding` and `RiskScore` JSON schemas from the PRD are frozen.
- Confirm with Member 2 that `score_findings()` will be called via **direct Python import** into the orchestrator (not a separate microservice).

### T+0:20–1:00 — Feature extraction pipeline
Build `extract_features(code: str, findings: list[dict]) -> dict` computing:
- Semgrep/Bandit finding counts by category (bug/security/smell) and by tool-native severity
- Cyclomatic complexity (via `radon.complexity`)
- Function length (lines), max nesting depth
- Count of dangerous-sink calls: `eval(`, `exec(`, `subprocess(...shell=True)`, raw SQL string formatting
- Regex hit count for hardcoded-secret-like patterns (`API_KEY\s*=\s*["']`, etc.)
- Import-risk flag (imports: `pickle`, `yaml.load` without `SafeLoader`, `os.system`)
- Boolean: does a matching test file exist (proxy for test coverage)
- Duplicated-code ratio (simple token-overlap heuristic — don't over-engineer)

### T+1:00–1:45 — Train + evaluate
- Split VUDENC data 80/20 train/test.
- Train XGBoost/LightGBM: target = severity bucket (critical/high/medium/low).
- Compute precision/recall/F1 per class + confusion matrix.
- **Save these numbers** — they go directly into the pitch deck.
- Export the model (no retraining live, ever).

### T+1:45–2:15 — Detection Agent wrappers
- Subprocess wrapper: run `semgrep --json` and `bandit -f json`, parse both into shared `Finding` schema.
- Confirm Semgrep catches things by running against a known-vulnerable snippet first.

### T+2:15–3:00 — Wire the scorer
- `score_findings(code, findings) -> RiskScore[]`:
  - Loads exported model once at process start.
  - Runs `extract_features` per finding.
  - Returns risk probability + predicted severity + top 3 contributing features.
- **Test against your own hand-crafted fixtures first**, not Member 4's broken app.

### T+3:00 — Triage checkpoint
If behind: drop duplicated-code and test-coverage features first (weakest signal, most effort). **Do not drop the evaluation step.**

### T+3:00–4:00 — Integrate with Orchestrator (Member 2)
- Hand off `score_findings()`, confirm schema round-trips correctly.
- Test against Member 4's broken app the moment it exists.
- Compare model output against `manifest.md` — this is your regression check.

### T+4:00–5:00 — Polish + buffer
- Export `feature_importance.json` in format Member 3 can plot: `[{"feature": "...", "weight": 0.0}, ...]`
- Write a 2-sentence "how the model works" explanation for the pitch deck.
- Buffer time for whatever broke during integration.

### T+5:00–6:00 — Rehearsal
Be ready to answer without notes: "what dataset, how many samples, what's your F1 score, what happens if the model is wrong."

---

## Deliverables checklist

- [ ] Trained model file, loads in <1s (`ml/models/risk_model.json`)
- [ ] Evaluation report: precision/recall/F1 per class + confusion matrix (`ml/eval/`)
- [ ] `extract_features()` and `score_findings()` functions, tested against real fixtures
- [ ] Detection Agent wrappers (Semgrep + Bandit → normalized `Finding[]`)
- [ ] Feature-importance export for the frontend (`ml/models/feature_importance.json`)
- [ ] One paragraph, memorized, on how the model works and how it was evaluated

---

## What NOT to do

- Don't fine-tune a transformer live.
- Don't let the ML model make a vulnerability exist that Semgrep/Bandit didn't already flag.
- Don't skip the eval to save time — an unevaluated model is a liability in Q&A.
- Don't wait for the "perfect" dataset — VUDENC alone is enough.
