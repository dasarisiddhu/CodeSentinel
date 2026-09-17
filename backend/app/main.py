"""
CodeSentinel — FastAPI application entry point.

Run locally:
    cd backend
    uvicorn app.main:app --reload --port 8000

All configuration is via environment variables (see .env.example).
"""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.logging_config import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle events."""
    # ── Startup ───────────────────────────────────────────────────────────────
    setup_logging()
    await init_db()

    import logging
    logger = logging.getLogger("codesentinel.startup")
    logger.info(
        "codesentinel_started",
        extra={
            "stage": "startup",
            "groq_configured": settings.groq_configured,
            "github_configured": settings.github_configured,
            "database_url": settings.database_url,
        },
    )
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("codesentinel_shutdown", extra={"stage": "shutdown"})


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="CodeSentinel",
    description=(
        "AI Code Review & Vulnerability Detection Agent. "
        "Deterministic scanner → ML risk scorer → LLM explainer → verified fix → GitHub PR."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

from app.api import analyze, demo, health, ingest, pr, review  # noqa: E402

app.include_router(analyze.router)
app.include_router(review.router)
app.include_router(ingest.router)
app.include_router(pr.router)
app.include_router(health.router)
app.include_router(demo.router)
