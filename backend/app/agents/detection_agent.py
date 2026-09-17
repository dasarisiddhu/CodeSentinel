"""
CodeSentinel — Detection Agent interface stub.

╔══════════════════════════════════════════════════════════════════════════════╗
║  TEAM MEMBER 1 — REPLACE THE BODY OF `analyze()` WITH YOUR IMPLEMENTATION  ║
║  Signature and return type MUST stay exactly the same.                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

This agent wraps Semgrep + Bandit + Radon.
It must NEVER use an LLM — all findings are deterministic tool output.

Contract:
    analyze(code, language, filename) -> List[Finding]

If Semgrep/Bandit produce no findings, return an empty list [].
The orchestrator short-circuits at that point — no LLM call is made.
"""
from __future__ import annotations

import uuid

from app.schemas.finding import Finding


async def analyze(
    code: str,
    language: str,
    filename: str,
) -> list[Finding]:
    """
    Run Semgrep + Bandit + Radon on the supplied source code.

    Args:
        code:      Raw source code string.
        language:  Language tag (e.g. "python").
        filename:  Original filename (used for Semgrep file-type inference).

    Returns:
        List of Finding objects. Return [] if no issues found.

    ──────────────────────────────────────────────────────────────────────────
    STUB IMPLEMENTATION — returns two hard-coded sample findings so the
    orchestrator end-to-end path works before Member 1's code lands.
    Replace this body entirely with your Semgrep/Bandit/Radon integration.
    ──────────────────────────────────────────────────────────────────────────
    """
    # ── STUB: detect obvious dangerous patterns to make the pipeline demoable ─
    stub_findings: list[Finding] = []

    if "eval(" in code or "exec(" in code:
        stub_findings.append(
            Finding(
                id=str(uuid.uuid4()),
                file=filename,
                line_start=_find_line(code, "eval(") or _find_line(code, "exec(") or 1,
                line_end=_find_line(code, "eval(") or _find_line(code, "exec(") or 1,
                rule_id="python.lang.security.audit.eval-injection.eval-injection",
                category="security",
                tool_severity="high",
                message=(
                    "Use of eval() with unsanitized input is a remote code execution risk. "
                    "An attacker who controls the input can execute arbitrary Python."
                ),
                code_snippet=_extract_snippet(code, _find_line(code, "eval(") or 1),
            )
        )

    if "shell=True" in code:
        stub_findings.append(
            Finding(
                id=str(uuid.uuid4()),
                file=filename,
                line_start=_find_line(code, "shell=True") or 1,
                line_end=_find_line(code, "shell=True") or 1,
                rule_id="python.lang.security.audit.subprocess-shell-true",
                category="security",
                tool_severity="high",
                message=(
                    "subprocess called with shell=True expands shell metacharacters. "
                    "If any argument comes from user input this is a shell injection."
                ),
                code_snippet=_extract_snippet(code, _find_line(code, "shell=True") or 1),
            )
        )

    return stub_findings


# ── helpers used only by the stub ─────────────────────────────────────────────

def _find_line(code: str, token: str) -> int | None:
    for i, line in enumerate(code.splitlines(), start=1):
        if token in line:
            return i
    return None


def _extract_snippet(code: str, line_number: int, context: int = 2) -> str:
    lines = code.splitlines()
    start = max(0, line_number - context - 1)
    end = min(len(lines), line_number + context)
    return "\n".join(lines[start:end])
