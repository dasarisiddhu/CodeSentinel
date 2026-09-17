"""
Detection Agent — Bandit wrapper.
Runs bandit -f json against submitted Python code and normalizes output into the shared Finding schema.
"""

import json
import os
import subprocess
import tempfile
import uuid
from typing import Any


def run_bandit(code: str, filename: str = "code.py") -> list[dict[str, Any]]:
    """
    Run bandit against the provided Python source code.

    Args:
        code: Raw source code string.
        filename: Filename hint (affects some bandit rule detection).

    Returns:
        List of normalized Finding dicts.
    """
    findings = []

    with tempfile.TemporaryDirectory() as tmpdir:
        code_path = os.path.join(tmpdir, filename)
        os.makedirs(os.path.dirname(code_path), exist_ok=True)
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(code)

        cmd = [
            "bandit",
            "-f", "json",
            "-q",            # quiet — only report issues, not progress
            "-ll",           # report LOW and above (captures everything)
            code_path,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            # bandit exits with code 1 when issues are found — don't treat that as an error
            raw = json.loads(result.stdout) if result.stdout.strip() else {}
        except subprocess.TimeoutExpired:
            return []
        except (json.JSONDecodeError, FileNotFoundError):
            return []

        for issue in raw.get("results", []):
            findings.append(_normalize_bandit_finding(issue))

    return findings


def _normalize_bandit_finding(issue: dict[str, Any]) -> dict[str, Any]:
    """Map a raw bandit result entry to the shared Finding schema."""
    # Bandit has both severity and confidence; we use severity for tool_severity
    raw_severity = issue.get("issue_severity", "MEDIUM").upper()
    severity_map = {
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }
    tool_severity = severity_map.get(raw_severity, "medium")

    # All bandit findings are security-related (it's a security-focused linter)
    # B105/B106/B107 are hardcoded password bugs — categorize as security
    test_id = issue.get("test_id", "")
    if test_id.startswith("B1"):
        category = "bug"
    else:
        category = "security"

    line_start = issue.get("line_number", 0)
    col_offset = issue.get("col_offset", 0)

    return {
        "id": str(uuid.uuid4()),
        "file": issue.get("filename", ""),
        "line_start": line_start,
        "line_end": issue.get("line_range", [line_start, line_start])[-1],
        "rule_id": f"bandit.{test_id}",
        "category": category,
        "tool_severity": tool_severity,
        "message": issue.get("issue_text", ""),
        "code_snippet": issue.get("code", ""),
        "source": "bandit",
    }
