# CodeSentinel

**AI Code Review & Vulnerability Detection Agent**
HackForge × Microsoft, PS1 | Team: 4 members | Stack: FastAPI + XGBoost + Groq + Next.js

---

## What it does

> "Static analyzers find real bugs but can't explain them well. LLMs explain well but hallucinate
> vulnerabilities that aren't there. CodeSentinel splits the job three ways: a deterministic scanner
> finds it, a trained risk model prioritizes it, and the LLM only explains and fixes what the first
> two already confirmed exists."

Three-agent pipeline:
1. **Detection Agent** — Semgrep + Bandit + Radon (deterministic, zero hallucination)
2. **ML Risk-Scoring Agent** — XGBoost/LightGBM trained on real vulnerability data (VUDENC)
3. **LLM Explanation Agent** — Groq with fallback chain, JSON-schema constrained

---

## Project Structure

```
codesentinel/
├── docs/               # PRD, API contract, role files, demo script, datasets guide
├── backend/            # FastAPI app (Member 2)
├── ml/                 # ML pipeline: detection wrappers, feature extraction, training (Member 1)
├── frontend/           # Next.js UI (Member 3)
├── broken-app/         # Deliberately vulnerable Flask app + file-watcher (Member 4)
├── scripts/            # setup.sh, run_dev.sh, seed_demo_cache.py
└── pitch/              # Slides + demo recording fallback
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Semgrep, Bandit installed globally (`pip install semgrep bandit`)
- Groq API key (or the mock fallback will kick in automatically)

### 1. Clone and set up environment

```bash
git clone https://github.com/dasarisiddhu/CodeSentinel.git
cd CodeSentinel
cp .env.example .env
# Fill in GROQ_API_KEY, GITHUB_TOKEN (optional), GITHUB_REPO (optional)
```

### 2. Install dependencies (one-shot)

```bash
bash scripts/setup.sh
```

Or manually:

```bash
# Backend
python -m venv backend/.venv
backend/.venv/Scripts/activate   # Windows
pip install -r backend/requirements.txt

# ML
python -m venv ml/.venv
ml/.venv/Scripts/activate
pip install -r ml/requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### 3. Train the ML model (one-time, ~2–5 min on CPU)

```bash
# First, download and process the VUDENC dataset — see docs/datasets.md
# Then:
python -m ml.src.train
```

This writes:
- `ml/models/risk_model.json` — trained model
- `ml/models/feature_importance.json` — for frontend chart
- `ml/eval/metrics.json` — precision/recall/F1
- `ml/eval/confusion_matrix.png`

### 4. Run everything for development

```bash
bash scripts/run_dev.sh
```

Or individually:

```bash
# Backend (from repo root)
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend && npm run dev

# Broken app file-watcher (new terminal)
cd broken-app && python shipper/file_watcher.py
```

### 5. Seed the demo cache (before the pitch)

```bash
python scripts/seed_demo_cache.py
```

Runs 2–3 fixture vulnerable snippets through the full pipeline and caches the results.
Use the frontend's Demo Mode toggle to serve these instantly if live calls fail.

---

## API

See [`docs/api_contract.md`](docs/api_contract.md) for the full contract. Key endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/analyze` | Submit code for review |
| GET | `/review/{id}` | Poll for results |
| POST | `/ingest/webhook` | File-watcher ingestion |
| POST | `/pr/{id}` | Open GitHub PR with fix |
| GET | `/demo/{n}` | Serve cached demo run |
| GET | `/health` | Backend + model health |

---

## ML Model

- **Architecture:** XGBoost/LightGBM gradient-boosted classifier
- **Features:** ~20 engineered features (finding counts, cyclomatic complexity, dangerous sinks, etc.)
- **Training data:** VUDENC — 1,009+ real vulnerability-fixing Python commits from GitHub
- **Evaluation:** precision/recall/F1 per severity class + confusion matrix (see `ml/eval/`)
- **Inference time:** <100ms (loaded once at process start, no retraining at runtime)

See [`docs/datasets.md`](docs/datasets.md) for full dataset details and label mapping.

---

## Team

| Member | Role | Owns |
|---|---|---|
| Member 1 | ML & Risk-Scoring Lead | `ml/` |
| Member 2 | Backend & Orchestration Lead | `backend/` |
| Member 3 | Frontend & Demo Lead | `frontend/` |
| Member 4 | Broken App & Shipper Lead | `broken-app/` |

See `docs/roles/` for each member's hour-by-hour execution plan.

---

## Environment Variables

See [`.env.example`](.env.example). **Never commit `.env`.**

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes (or use mock) | Groq API key for LLM calls |
| `GITHUB_TOKEN` | No | GitHub PAT for real PR creation |
| `GITHUB_REPO` | No | `owner/repo` to open PRs against |
| `DATABASE_URL` | No | Defaults to SQLite `./codesentinel.db` |
