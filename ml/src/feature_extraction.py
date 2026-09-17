"""
Feature extraction pipeline.
extract_features(code, findings) -> dict

This is the single most important function the ML team owns.
Every row in the training dataset and every live submission goes through here.
Keep it deterministic, stateless, and fast (no network calls, no subprocess overhead
beyond what the Detection Agent already ran).

Feature list (~20 features, per PRD Section 3.2):
  1.  finding_count_total
  2.  finding_count_bug
  3.  finding_count_security
  4.  finding_count_code_smell
  5.  finding_count_high_severity
  6.  finding_count_medium_severity
  7.  finding_count_low_severity
  8.  cyclomatic_complexity_max
  9.  cyclomatic_complexity_avg
  10. maintainability_index
  11. function_length_max
  12. function_length_avg
  13. nesting_depth_max
  14. sloc
  15. dangerous_sink_count  (eval, exec, subprocess shell=True, raw SQL)
  16. hardcoded_secret_count  (API_KEY=, password=, etc.)
  17. import_risk_flag  (pickle, yaml.load, os.system, etc.)
  18. has_test_file  (proxy for test coverage)
  19. bandit_finding_count  (bandit-specific, security-focused)
  20. semgrep_finding_count
"""

import ast
import re
from typing import Any


# ---------------------------------------------------------------------------
# Dangerous sink patterns
# ---------------------------------------------------------------------------

_DANGEROUS_SINK_PATTERNS = [
    # eval / exec
    re.compile(r"\beval\s*\("),
    re.compile(r"\bexec\s*\("),
    # subprocess with shell=True
    re.compile(r"subprocess\.[a-zA-Z_]+\s*\([^)]*shell\s*=\s*True"),
    # raw SQL string formatting (% formatting or f-strings inside .execute())
    re.compile(r"\.execute\s*\(\s*[\"'].*%"),
    re.compile(r"\.execute\s*\(\s*f[\"']"),
    # os.system
    re.compile(r"\bos\.system\s*\("),
    # open() with user-controlled path (simplistic signal)
    re.compile(r"\bopen\s*\(\s*(?:request|input|args|kwargs|params)"),
]

_HARDCODED_SECRET_PATTERNS = [
    re.compile(r'(?:API_KEY|SECRET_KEY|PASSWORD|TOKEN|AUTH)\s*=\s*["\'][^"\']{4,}["\']', re.IGNORECASE),
    re.compile(r'(?:api_key|secret|password|token)\s*=\s*["\'][^"\']{4,}["\']', re.IGNORECASE),
]

_RISKY_IMPORTS = {
    "pickle",
    "os.system",
    "subprocess",
    "yaml",       # yaml.load without SafeLoader — detected below
    "shelve",
    "marshal",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_features(
    code: str,
    findings: list[dict[str, Any]],
    complexity_metrics: dict[str, Any] | None = None,
    filename: str | None = None,
) -> dict[str, float | int]:
    """
    Extract the full ~20-feature vector from a code submission.

    Args:
        code: Raw source code string.
        findings: List of normalized Finding dicts from the Detection Agent.
        complexity_metrics: Optional dict from radon_wrapper.compute_complexity_metrics().
                            If None, computes a lightweight version internally.
        filename: Optional filename, used to check for a matching test file.

    Returns:
        Feature dict with all numeric values (int or float).
    """
    features: dict[str, float | int] = {}

    # --- Finding count features ---
    features["finding_count_total"] = len(findings)
    features["finding_count_bug"] = _count_by(findings, "category", "bug")
    features["finding_count_security"] = _count_by(findings, "category", "security")
    features["finding_count_code_smell"] = _count_by(findings, "category", "code_smell")
    features["finding_count_high_severity"] = _count_by(findings, "tool_severity", "high")
    features["finding_count_medium_severity"] = _count_by(findings, "tool_severity", "medium")
    features["finding_count_low_severity"] = _count_by(findings, "tool_severity", "low")
    features["bandit_finding_count"] = _count_by(findings, "source", "bandit")
    features["semgrep_finding_count"] = _count_by(findings, "source", "semgrep")

    # --- Complexity metrics ---
    if complexity_metrics is None:
        complexity_metrics = _lightweight_complexity(code)

    features["cyclomatic_complexity_max"] = float(complexity_metrics.get("max_cyclomatic_complexity", 0))
    features["cyclomatic_complexity_avg"] = float(complexity_metrics.get("avg_cyclomatic_complexity", 0.0))
    features["maintainability_index"] = float(complexity_metrics.get("maintainability_index", 0.0))
    features["nesting_depth_max"] = int(complexity_metrics.get("max_nesting_depth", 0))
    features["sloc"] = int(complexity_metrics.get("sloc", 0))

    fn_lengths = complexity_metrics.get("function_lengths", [])
    features["function_length_max"] = max(fn_lengths) if fn_lengths else 0
    features["function_length_avg"] = (sum(fn_lengths) / len(fn_lengths)) if fn_lengths else 0.0

    # --- Dangerous sink counts ---
    features["dangerous_sink_count"] = _count_dangerous_sinks(code)

    # --- Hardcoded secret count ---
    features["hardcoded_secret_count"] = _count_hardcoded_secrets(code)

    # --- Import risk flag ---
    features["import_risk_flag"] = int(_has_risky_import(code))

    # --- Test file proxy ---
    features["has_test_file"] = int(_has_test_file(filename)) if filename else 0

    return features


def feature_names() -> list[str]:
    """Return the ordered list of feature names (matches column order in features.csv)."""
    return [
        "finding_count_total",
        "finding_count_bug",
        "finding_count_security",
        "finding_count_code_smell",
        "finding_count_high_severity",
        "finding_count_medium_severity",
        "finding_count_low_severity",
        "bandit_finding_count",
        "semgrep_finding_count",
        "cyclomatic_complexity_max",
        "cyclomatic_complexity_avg",
        "maintainability_index",
        "nesting_depth_max",
        "sloc",
        "function_length_max",
        "function_length_avg",
        "dangerous_sink_count",
        "hardcoded_secret_count",
        "import_risk_flag",
        "has_test_file",
    ]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _count_by(findings: list[dict], key: str, value: str) -> int:
    return sum(1 for f in findings if f.get(key) == value)


def _count_dangerous_sinks(code: str) -> int:
    total = 0
    for pattern in _DANGEROUS_SINK_PATTERNS:
        total += len(pattern.findall(code))
    return total


def _count_hardcoded_secrets(code: str) -> int:
    total = 0
    for pattern in _HARDCODED_SECRET_PATTERNS:
        total += len(pattern.findall(code))
    return total


def _has_risky_import(code: str) -> bool:
    """Check if the code imports from the risky import list."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        # Fall back to regex if AST parse fails
        for name in _RISKY_IMPORTS:
            if re.search(rf"\bimport\s+{re.escape(name)}\b", code):
                return True
        return False

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            else:
                names = [node.module or ""]
            for name in names:
                module_root = name.split(".")[0] if name else ""
                if module_root in _RISKY_IMPORTS:
                    return True

    # Special check: yaml.load without SafeLoader
    if re.search(r"yaml\.load\s*\([^)]+\)", code):
        if not re.search(r"yaml\.load\s*\([^)]*Loader\s*=\s*yaml\.SafeLoader", code):
            return True

    return False


def _has_test_file(filename: str) -> bool:
    """
    Proxy for test coverage: return True if there appears to be a test file
    corresponding to this filename (e.g. 'auth.py' → 'test_auth.py' exists).
    """
    import os
    if not filename:
        return False
    base = os.path.basename(filename).replace(".py", "")
    test_candidates = [
        f"test_{base}.py",
        f"{base}_test.py",
        f"tests/test_{base}.py",
    ]
    for candidate in test_candidates:
        if os.path.exists(candidate):
            return True
    return False


def _lightweight_complexity(code: str) -> dict[str, Any]:
    """Minimal complexity metrics using only the stdlib (no radon dependency)."""
    lines = code.splitlines()
    sloc = sum(1 for l in lines if l.strip() and not l.strip().startswith("#"))

    try:
        tree = ast.parse(code)
        nesting = _max_nesting(tree)
        fn_lengths = _fn_lengths(tree)
    except SyntaxError:
        nesting = 0
        fn_lengths = []

    return {
        "max_cyclomatic_complexity": 0,
        "avg_cyclomatic_complexity": 0.0,
        "maintainability_index": 0.0,
        "max_nesting_depth": nesting,
        "sloc": sloc,
        "function_lengths": fn_lengths,
    }


def _max_nesting(tree: ast.AST) -> int:
    nesting_nodes = (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.ExceptHandler)
    max_d = [0]

    def walk(node: ast.AST, d: int) -> None:
        if isinstance(node, nesting_nodes):
            d += 1
            max_d[0] = max(max_d[0], d)
        for child in ast.iter_child_nodes(node):
            walk(child, d)

    walk(tree, 0)
    return max_d[0]


def _fn_lengths(tree: ast.AST) -> list[int]:
    lengths = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if hasattr(node, "end_lineno"):
                lengths.append(node.end_lineno - node.lineno + 1)
    return lengths
