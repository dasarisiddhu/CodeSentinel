"""
Detection Agent — Normalize.
Merges findings from Semgrep, Bandit, and Radon into a single deduplicated Finding list.
The orchestrator calls this to get one canonical Finding[] from all three tools.
"""

from typing import Any

from ml.src.detection.semgrep_wrapper import run_semgrep
from ml.src.detection.bandit_wrapper import run_bandit
from ml.src.detection.radon_wrapper import compute_complexity_metrics


def run_all_detectors(
    code: str,
    language: str = "python",
    filename: str = "code.py",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Run Semgrep + Bandit + Radon and return:
      - findings: list of normalized Finding dicts (deduplicated)
      - complexity_metrics: dict from compute_complexity_metrics()

    The complexity_metrics dict is NOT part of the Finding schema — it's passed
    directly to extract_features() in the ML Risk-Scoring Agent.

    Returns:
        (findings, complexity_metrics)
    """
    findings: list[dict[str, Any]] = []

    # Run Semgrep (multi-language, multi-rule)
    semgrep_findings = run_semgrep(code, language=language, filename=filename)
    findings.extend(semgrep_findings)

    # Run Bandit (Python-specific security)
    if language.lower() == "python":
        bandit_findings = run_bandit(code, filename=filename)
        findings.extend(bandit_findings)

    # Deduplicate by (line_start, rule_id) — some rules overlap between tools
    findings = _deduplicate(findings)

    # Compute complexity metrics (used by ML, not stored as findings)
    complexity_metrics = compute_complexity_metrics(code)

    return findings, complexity_metrics


def _deduplicate(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Remove duplicate findings at the same line with the same rule category.
    Keeps the finding with the higher severity.
    """
    seen: dict[tuple, dict[str, Any]] = {}
    severity_rank = {"high": 3, "medium": 2, "low": 1}

    for finding in findings:
        key = (finding.get("line_start"), finding.get("category"), finding.get("file"))
        if key not in seen:
            seen[key] = finding
        else:
            existing_rank = severity_rank.get(seen[key].get("tool_severity", "low"), 1)
            new_rank = severity_rank.get(finding.get("tool_severity", "low"), 1)
            if new_rank > existing_rank:
                seen[key] = finding

    return list(seen.values())


def findings_summary(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Return a count summary of findings — used as features by the ML model.

    Returns:
        {
          "total": int,
          "by_category": {"bug": int, "security": int, "code_smell": int},
          "by_severity": {"high": int, "medium": int, "low": int},
          "by_source": {"semgrep": int, "bandit": int},
        }
    """
    summary: dict[str, Any] = {
        "total": len(findings),
        "by_category": {"bug": 0, "security": 0, "code_smell": 0},
        "by_severity": {"high": 0, "medium": 0, "low": 0},
        "by_source": {"semgrep": 0, "bandit": 0},
    }

    for f in findings:
        cat = f.get("category", "code_smell")
        sev = f.get("tool_severity", "low")
        src = f.get("source", "semgrep")

        if cat in summary["by_category"]:
            summary["by_category"][cat] += 1
        if sev in summary["by_severity"]:
            summary["by_severity"][sev] += 1
        if src in summary["by_source"]:
            summary["by_source"][src] += 1

    return summary
