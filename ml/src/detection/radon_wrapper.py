"""
Detection Agent — Radon wrapper.
Extracts cyclomatic complexity and maintainability metrics from Python source code.
These are structural signals used by the ML Risk-Scoring Agent, not vulnerability findings per se.
"""

import ast
from typing import Any

try:
    from radon.complexity import cc_visit, cc_rank
    from radon.metrics import mi_visit, mi_rank
    from radon.raw import analyze
    RADON_AVAILABLE = True
except ImportError:
    RADON_AVAILABLE = False


def compute_complexity_metrics(code: str) -> dict[str, Any]:
    """
    Compute code complexity and maintainability metrics from Python source.

    Returns a dict of metrics used downstream by extract_features():
      - max_cyclomatic_complexity: int
      - avg_cyclomatic_complexity: float
      - maintainability_index: float  (0–100; <25 is unmaintainable, >65 is maintainable)
      - loc: int  (lines of code)
      - lloc: int (logical lines of code)
      - sloc: int (source lines of code — non-blank, non-comment)
      - comments: int
      - max_nesting_depth: int  (computed separately via AST walk)
      - function_lengths: list[int]  (line counts per function/method)
    """
    if not RADON_AVAILABLE:
        return _fallback_metrics(code)

    metrics: dict[str, Any] = {}

    # Raw metrics (LOC, LLOC, SLOC, comments)
    try:
        raw = analyze(code)
        metrics["loc"] = raw.loc
        metrics["lloc"] = raw.lloc
        metrics["sloc"] = raw.sloc
        metrics["comments"] = raw.comments
    except Exception:
        metrics["loc"] = code.count("\n") + 1
        metrics["lloc"] = 0
        metrics["sloc"] = 0
        metrics["comments"] = 0

    # Cyclomatic complexity per block
    try:
        blocks = cc_visit(code)
        complexities = [b.complexity for b in blocks]
        metrics["max_cyclomatic_complexity"] = max(complexities) if complexities else 0
        metrics["avg_cyclomatic_complexity"] = (
            sum(complexities) / len(complexities) if complexities else 0.0
        )
    except Exception:
        metrics["max_cyclomatic_complexity"] = 0
        metrics["avg_cyclomatic_complexity"] = 0.0

    # Maintainability index
    try:
        mi = mi_visit(code, multi=True)
        metrics["maintainability_index"] = mi if isinstance(mi, float) else 0.0
    except Exception:
        metrics["maintainability_index"] = 0.0

    # Nesting depth and function lengths via AST
    try:
        tree = ast.parse(code)
        metrics["max_nesting_depth"] = _max_nesting_depth(tree)
        metrics["function_lengths"] = _function_lengths(tree, code)
    except SyntaxError:
        metrics["max_nesting_depth"] = 0
        metrics["function_lengths"] = []

    return metrics


def _max_nesting_depth(tree: ast.AST) -> int:
    """Walk the AST and compute the maximum nesting depth of control-flow nodes."""
    nesting_nodes = (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.ExceptHandler)
    max_depth = [0]

    def walk(node: ast.AST, depth: int) -> None:
        if isinstance(node, nesting_nodes):
            depth += 1
            max_depth[0] = max(max_depth[0], depth)
        for child in ast.iter_child_nodes(node):
            walk(child, depth)

    walk(tree, 0)
    return max_depth[0]


def _function_lengths(tree: ast.AST, code: str) -> list[int]:
    """Return a list of line counts for each function/method definition."""
    lengths = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if hasattr(node, "end_lineno") and hasattr(node, "lineno"):
                lengths.append(node.end_lineno - node.lineno + 1)
    return lengths


def _fallback_metrics(code: str) -> dict[str, Any]:
    """Minimal fallback metrics computed with the stdlib only (no radon)."""
    lines = code.splitlines()
    try:
        tree = ast.parse(code)
        nesting = _max_nesting_depth(tree)
        fn_lengths = _function_lengths(tree, code)
    except SyntaxError:
        nesting = 0
        fn_lengths = []

    return {
        "loc": len(lines),
        "lloc": 0,
        "sloc": sum(1 for l in lines if l.strip() and not l.strip().startswith("#")),
        "comments": sum(1 for l in lines if l.strip().startswith("#")),
        "max_cyclomatic_complexity": 0,
        "avg_cyclomatic_complexity": 0.0,
        "maintainability_index": 0.0,
        "max_nesting_depth": nesting,
        "function_lengths": fn_lengths,
    }
