"""
Detection Agent — Semgrep wrapper.
Runs semgrep --json against submitted code and normalizes output into the shared Finding schema.
"""

import json
import os
import subprocess
import tempfile
import uuid
from typing import Any


def run_semgrep(code: str, language: str = "python", filename: str = "code.py") -> list[dict[str, Any]]:
    """
    Run semgrep against the provided source code.

    Args:
        code: Raw source code string.
        language: Language tag (e.g. "python").
        filename: Filename hint for semgrep (affects rule matching).

    Returns:
        List of normalized Finding dicts.
    """
    findings = []

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write code to a temp file
        code_path = os.path.join(tmpdir, filename)
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Build semgrep command — use auto rules for language-appropriate security + bug rules
        cmd = [
            "semgrep",
            "--json",
            "--config", "auto",
            "--quiet",
            code_path,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
            )
            raw = json.loads(result.stdout) if result.stdout.strip() else {}
        except subprocess.TimeoutExpired:
            return []
        except (json.JSONDecodeError, FileNotFoundError):
            return []

        for match in raw.get("results", []):
            findings.append(_normalize_semgrep_finding(match))

    return findings


def _normalize_semgrep_finding(match: dict[str, Any]) -> dict[str, Any]:
    """Map a raw semgrep result entry to the shared Finding schema."""
    extra = match.get("extra", {})
    metadata = extra.get("metadata", {})

    # Map semgrep severity to our schema
    raw_severity = extra.get("severity", "WARNING").upper()
    severity_map = {
        "ERROR": "high",
        "WARNING": "medium",
        "INFO": "low",
    }
    tool_severity = severity_map.get(raw_severity, "medium")

    # Map semgrep category metadata to our category enum
    category_tags = metadata.get("category", "")
    if "security" in str(category_tags).lower():
        category = "security"
    elif "correctness" in str(category_tags).lower() or "bug" in str(category_tags).lower():
        category = "bug"
    else:
        category = "code_smell"

    return {
        "id": str(uuid.uuid4()),
        "file": match.get("path", ""),
        "line_start": match.get("start", {}).get("line", 0),
        "line_end": match.get("end", {}).get("line", 0),
        "rule_id": match.get("check_id", ""),
        "category": category,
        "tool_severity": tool_severity,
        "message": extra.get("message", ""),
        "code_snippet": extra.get("lines", ""),
        "source": "semgrep",
    }
