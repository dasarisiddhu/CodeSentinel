# Team Member 2 — Backend & Orchestration Lead
**CodeSentinel | Owns: FastAPI backend, Orchestrator, LLM service, PR/Delivery agent**

Read `docs/PRD.md` Sections 3.3, 3.4, 3.5, and 7 first.

---

## Your job

Build the FastAPI backend that:
1. Receives code via `POST /analyze` or `POST /ingest/webhook`
2. Runs the full pipeline: Detection Agent → ML Risk-Scoring → LLM Explanation → Verification
3. Stores results in SQLite and serves them via `GET /review/{id}`
4. Optionally opens a GitHub PR with verified fix diffs

## Files you own

```
backend/
├── app/
│   ├── main.py                     <- FastAPI entrypoint, mounts all routers
│   ├── core/
│   │   ├── config.py               <- pydantic-settings, reads .env
│   │   ├── database.py             <- async SQLAlchemy engine/session
│   │   └── logging_config.py       <- structured logging
│   ├── api/
│   │   ├── analyze.py              <- POST /analyze
│   │   ├── review.py               <- GET /review/{id}
│   │   ├── ingest.py               <- POST /ingest/webhook
│   │   ├── pr.py                   <- POST /pr/{id}
│   │   ├── demo.py                 <- GET /demo/{n}
│   │   └── health.py               <- GET /health
│   ├── models/                     <- SQLAlchemy ORM
│   ├── schemas/                    <- Pydantic schemas (mirrors docs/api_contract.md)
│   └── services/
│       ├── orchestrator.py         <- run_pipeline()
│       ├── llm_service.py          <- LLM with fallback chain
│       ├── verification_service.py <- diff --dry-run check
│       ├── github_service.py       <- real/mock PR creation
│       └── cache_service.py        <- content-hash keyed demo cache
```

## Critical integration points with Member 1

- Import `ml.src.risk_model.score_findings` directly (not a network call)
- Import `ml.src.detection.normalize.run_all_detectors` for the Detection Agent
- Call `ml.src.risk_model.health()` in `GET /health` for `model_loaded` field

## LLM Fallback Chain

```
Groq Llama 3.3 70B (primary)
  -> Groq Llama 3.1 8B (fallback if primary fails/rate-limits)
  -> Mock deterministic response (same schema, no LLM call)
```

Every call has an explicit timeout (10s). Never block the pipeline on an LLM call.

## Resilience rules
- Every external call has timeout + fallback — no exceptions
- Demo fallback cache (content-hash keyed) must be live by hour 4
- Structured logging on every stage transition: finding count, model latency, LLM latency
