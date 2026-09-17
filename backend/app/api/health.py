"""
GET /health
Returns backend liveness: Groq reachability and DB status.
Used by the frontend health indicator and by judges checking system state.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.review import HealthResponse
from app.services import llm_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Liveness check — reports Groq API reachability and DB connectivity."""
    # Check DB
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        logger.error("health_db_check_failed", extra={"error": str(exc)})

    # Check Groq (non-blocking — returns False if unreachable)
    groq_ok = await llm_service.check_groq_reachable()

    # model_loaded: True when Member 1's ML model is loaded into memory.
    # The ml_agent stub exports a flag they can set; default False until replaced.
    model_loaded = _check_model_loaded()

    status = "ok" if (db_ok and groq_ok) else "degraded"

    return HealthResponse(
        status=status,  # type: ignore[arg-type]
        groq_reachable=groq_ok,
        model_loaded=model_loaded,
        database_ok=db_ok,
    )


def _check_model_loaded() -> bool:
    """Check if the ML agent reports its model is loaded."""
    try:
        from app.agents import ml_agent
        return getattr(ml_agent, "MODEL_LOADED", False)
    except Exception:
        return False
