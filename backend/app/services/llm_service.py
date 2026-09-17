"""
CodeSentinel — LLM Explanation & Fix Agent.

Implements the three-tier fallback chain from the PRD:
  1. Primary model  (llama-3.3-70b-versatile via Groq)
  2. Fallback model (llama-3.1-8b-instant via Groq)
  3. Deterministic mock (same schema, `is_mock=True`, clearly labeled)

Key design decisions:
- System prompt forces JSON-only output. Temperature = 0.2 for consistency.
- All findings are batched into one LLM call to save tokens and latency.
- Strip markdown code fences before json.loads (real gotcha — keep this).
- The prompt ONLY includes findings the Detection Agent already produced.
  It NEVER asks the LLM to find new bugs in raw code.
- Any exception at any tier is caught, logged, and falls to the next tier.
  A swallowed exception is a demo that fails mysteriously — log explicitly.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.explanation import Explanation
from app.schemas.finding import Finding

logger = logging.getLogger(__name__)

# ── Prompt templates ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are a senior security-focused code reviewer. "
    "You MUST respond with valid JSON only. "
    "No markdown, no code fences, no explanations outside the JSON. "
    "Your response must be a JSON array — one object per finding."
)

_USER_PROMPT_TEMPLATE = """\
The static analysis tool found the following issues in the code below.
For EACH finding, provide a JSON object with these exact keys:
  "finding_id"               - copy from the finding (string)
  "plain_english_explanation"- clear explanation for a junior developer (string)
  "severity_rationale"       - why this severity level was assigned (string)
  "fix_suggestion"           - a prose description of the fix (string)
  "fix_diff"                 - a valid unified diff (--- / +++ headers, @@ hunks) fixing the issue (string)
  "confidence"               - your confidence score between 0.0 and 1.0 (float)

FINDINGS:
{findings_json}

SOURCE CODE ({filename}):
```
{code}
```

Respond with a JSON array only. No other text.
"""

# ── Main entry point ──────────────────────────────────────────────────────────

async def explain_findings(
    findings: list[Finding],
    code: str,
    filename: str,
) -> list[Explanation]:
    """
    Generate plain-English explanations and unified-diff fixes for each finding.

    Tries primary model → fallback model → deterministic mock.
    Never raises — always returns a list with one Explanation per Finding.
    """
    if not findings:
        return []

    prompt_user = _build_user_prompt(findings, code, filename)

    # ── Tier 1: Primary model ─────────────────────────────────────────────────
    if settings.groq_configured:
        try:
            raw = await _call_groq(settings.groq_model_primary, prompt_user)
            return _parse_response(raw, findings)
        except Exception as exc:
            logger.warning(
                "llm_primary_failed",
                extra={"model": settings.groq_model_primary, "error": str(exc)},
            )

        # ── Tier 2: Fallback model ────────────────────────────────────────────
        try:
            raw = await _call_groq(settings.groq_model_fallback, prompt_user)
            return _parse_response(raw, findings)
        except Exception as exc:
            logger.warning(
                "llm_fallback_failed",
                extra={"model": settings.groq_model_fallback, "error": str(exc)},
            )
    else:
        logger.info("groq_not_configured — using mock response")

    # ── Tier 3: Deterministic mock ────────────────────────────────────────────
    logger.info("llm_using_mock_response")
    return _mock_explanations(findings)


# ── Groq API call ─────────────────────────────────────────────────────────────

async def _call_groq(model: str, user_prompt: str) -> str:
    """
    Call Groq Chat Completions API.
    Raises httpx.HTTPError or json.JSONDecodeError on failure.
    """
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=settings.llm_timeout) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ── Response parsing ──────────────────────────────────────────────────────────

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", re.DOTALL)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences if the LLM ignored the system prompt."""
    match = _FENCE_RE.match(text.strip())
    return match.group(1) if match else text.strip()


def _parse_response(raw: str, findings: list[Finding]) -> list[Explanation]:
    """Parse the LLM JSON response into Explanation objects."""
    clean = _strip_fences(raw)

    try:
        data = json.loads(clean)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc

    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array, got {type(data).__name__}")

    # Build a lookup so we can fill in any missing finding_ids
    finding_ids = {f.id for f in findings}
    explanations: list[Explanation] = []

    for item in data:
        if not isinstance(item, dict):
            continue
        fid = item.get("finding_id", "")
        if fid not in finding_ids:
            logger.warning("llm_unknown_finding_id", extra={"finding_id": fid})
            continue

        try:
            exp = Explanation(
                finding_id=fid,
                plain_english_explanation=str(item.get("plain_english_explanation", "")),
                severity_rationale=str(item.get("severity_rationale", "")),
                fix_suggestion=str(item.get("fix_suggestion", "")),
                fix_diff=str(item.get("fix_diff", "")),
                confidence=float(item.get("confidence", 0.5)),
            )
            explanations.append(exp)
        except Exception as exc:
            logger.warning("llm_item_parse_error", extra={"error": str(exc), "item": str(item)[:200]})

    # If LLM returned fewer items than findings, fill gaps
    explained_ids = {e.finding_id for e in explanations}
    for finding in findings:
        if finding.id not in explained_ids:
            logger.warning("llm_missing_finding", extra={"finding_id": finding.id})
            explanations.append(_mock_one(finding))

    return explanations


# ── Deterministic mock ────────────────────────────────────────────────────────

def _mock_explanations(findings: list[Finding]) -> list[Explanation]:
    """Return a realistic but clearly-labeled mock response for every finding."""
    return [_mock_one(f) for f in findings]


def _mock_one(finding: Finding) -> Explanation:
    """Generate a single mock Explanation for one Finding."""
    return Explanation(
        finding_id=finding.id,
        plain_english_explanation=(
            f"[MOCK — LLM unavailable] "
            f"The rule '{finding.rule_id}' flagged a potential {finding.category} issue "
            f"at line {finding.line_start}. {finding.message}"
        ),
        severity_rationale=(
            f"[MOCK] Tool-reported severity is {finding.tool_severity}. "
            "Manual review required — LLM explanation unavailable."
        ),
        fix_suggestion=(
            "[MOCK] Review the flagged code and apply the principle of least privilege "
            "/ input validation as appropriate for this finding type."
        ),
        fix_diff="",  # Empty diff — will be marked unverified by VerificationService
        confidence=0.0,
        is_mock=True,
    )


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_user_prompt(findings: list[Finding], code: str, filename: str) -> str:
    findings_data = [
        {
            "finding_id": f.id,
            "rule_id": f.rule_id,
            "category": f.category,
            "tool_severity": f.tool_severity,
            "line_start": f.line_start,
            "line_end": f.line_end,
            "message": f.message,
            "code_snippet": f.code_snippet,
        }
        for f in findings
    ]
    return _USER_PROMPT_TEMPLATE.format(
        findings_json=json.dumps(findings_data, indent=2),
        filename=filename,
        code=code,
    )


# ── Health check helper (used by /health endpoint) ────────────────────────────

async def check_groq_reachable() -> bool:
    """Quick liveness check against Groq API. Returns False on any error."""
    if not settings.groq_configured:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            )
            return resp.status_code == 200
    except Exception:
        return False
