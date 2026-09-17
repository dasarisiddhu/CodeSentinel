"""
CodeSentinel — Structured logging configuration.

Every pipeline stage emits a structured JSON log entry with:
  - stage: str         (e.g. "detection", "ml_scoring", "llm_explanation", "verification")
  - duration_ms: float
  - success: bool
  - finding_count: int | None
  - review_id: str | None
  - error: str | None  (only on failure)
"""
from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from typing import Any, Generator

from app.core.config import settings


class _JSONFormatter(logging.Formatter):
    """Emit every log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        _STANDARD_ATTRS = {
            "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
            "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "created", "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "message", "taskName",
        }
        for key, val in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                payload[key] = val
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging() -> None:
    """Call once at application startup."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    if root.handlers:
        root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    root.addHandler(handler)

    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


# ── Stage-level structured logger ────────────────────────────────────────────

_pipeline_logger = logging.getLogger("codesentinel.pipeline")


@contextmanager
def log_stage(
    stage: str,
    review_id: str | None = None,
    **extra: Any,
) -> Generator[dict[str, Any], None, None]:
    """
    Context manager that times a pipeline stage and emits a structured log.

    Usage::

        with log_stage("detection", review_id=rid) as ctx:
            findings = await detection_agent.analyze(...)
            ctx["finding_count"] = len(findings)
    """
    ctx: dict[str, Any] = {}
    t0 = time.perf_counter()
    try:
        yield ctx
        duration_ms = (time.perf_counter() - t0) * 1000
        _pipeline_logger.info(
            f"stage={stage} completed",
            extra={
                "stage": stage,
                "duration_ms": round(duration_ms, 2),
                "success": True,
                "review_id": review_id,
                **ctx,
                **extra,
            },
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        _pipeline_logger.error(
            f"stage={stage} failed: {exc}",
            extra={
                "stage": stage,
                "duration_ms": round(duration_ms, 2),
                "success": False,
                "review_id": review_id,
                "error": str(exc),
                **ctx,
                **extra,
            },
        )
        raise
