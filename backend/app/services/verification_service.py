"""
CodeSentinel — Diff Verification Service.

For every LLM-generated fix_diff, we check whether it actually applies cleanly
against the submitted source before showing it to judges.

Strategy (two layers for Windows/Linux portability):
  1. Try unidiff in-memory parsing first (fast, no subprocess).
  2. If the diff is non-trivial, write to a temp file and run
     `patch --dry-run` (subprocess) to get a definitive answer.
  3. On any exception → verified=False with the error message.

This is the step that separates us from "trust the LLM" — a hallucinated or
malformed diff is caught here and labeled "unverified — review manually" instead
of silently being presented as ground truth.
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile

from unidiff import PatchSet, UnidiffParseError

from app.schemas.explanation import Explanation

logger = logging.getLogger(__name__)


async def verify_diffs(
    explanations: list[Explanation],
    original_code: str,
) -> list[Explanation]:
    """
    Annotate each Explanation with verified=True/False.

    Args:
        explanations:   List of Explanation objects from the LLM agent.
        original_code:  The submitted source code (as a string).

    Returns:
        The same list with `verified` and `verified_error` fields set.
    """
    results: list[Explanation] = []
    for explanation in explanations:
        annotated = await _check_one(explanation, original_code)
        results.append(annotated)
    return results


async def _check_one(explanation: Explanation, original_code: str) -> Explanation:
    """Verify a single fix_diff. Never raises — always returns an annotated copy."""
    diff_str = explanation.fix_diff.strip()

    if not diff_str:
        return explanation.model_copy(
            update={"verified": False, "verified_error": "fix_diff is empty"}
        )

    # ── Step 1: parse with unidiff ────────────────────────────────────────────
    try:
        patch = PatchSet(diff_str)
    except UnidiffParseError as exc:
        logger.warning("diff_parse_failed", extra={"finding_id": explanation.finding_id, "error": str(exc)})
        return explanation.model_copy(
            update={"verified": False, "verified_error": f"Diff parse error: {exc}"}
        )

    if len(patch) == 0:
        return explanation.model_copy(
            update={"verified": False, "verified_error": "Diff is empty after parsing"}
        )

    # ── Step 2: dry-run patch in a temp directory ─────────────────────────────
    try:
        verified, error_msg = await asyncio.to_thread(
            _dry_run_patch, diff_str, original_code
        )
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning("verification_unexpected_error", extra={"error": str(exc)})
        verified, error_msg = False, f"Verification error: {exc}"

    return explanation.model_copy(
        update={"verified": verified, "verified_error": error_msg if not verified else None}
    )


def _dry_run_patch(diff_str: str, original_code: str) -> tuple[bool, str | None]:
    """
    Synchronous: write source + diff to temp files, run `patch --dry-run`.
    Returns (success, error_message).
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # The diff may reference any filename in the header; use a generic name
        source_path = os.path.join(tmpdir, "source.py")
        diff_path = os.path.join(tmpdir, "fix.patch")

        with open(source_path, "w", encoding="utf-8") as f:
            f.write(original_code)

        # Normalise diff to use our local filename so patch can find the target
        normalised_diff = _normalise_diff_target(diff_str, "source.py")
        with open(diff_path, "w", encoding="utf-8") as f:
            f.write(normalised_diff)

        try:
            result = subprocess.run(
                ["patch", "--dry-run", "-p1", source_path, diff_path],
                capture_output=True,
                text=True,
                timeout=5,
                cwd=tmpdir,
            )
            if result.returncode == 0:
                return True, None
            error = (result.stderr or result.stdout).strip()
            return False, f"patch --dry-run failed: {error}"
        except FileNotFoundError:
            # `patch` binary not available (Windows without Git-for-Windows etc.)
            # Fall back to in-memory apply attempt
            return _inmemory_apply(diff_str, original_code)
        except subprocess.TimeoutExpired:
            return False, "Patch dry-run timed out"


def _normalise_diff_target(diff_str: str, target_name: str) -> str:
    """
    Replace the file paths in a unified diff header with `target_name`
    so `patch` can locate the file regardless of what the LLM wrote.

    Only rewrites `--- ...` / `+++ ...` lines.
    """
    lines = diff_str.splitlines(keepends=True)
    normalised = []
    for line in lines:
        if line.startswith("--- "):
            normalised.append(f"--- {target_name}\n")
        elif line.startswith("+++ "):
            normalised.append(f"+++ {target_name}\n")
        else:
            normalised.append(line)
    return "".join(normalised)


def _inmemory_apply(diff_str: str, original_code: str) -> tuple[bool, str | None]:
    """
    Pure-Python fallback when the `patch` binary is unavailable.
    Applies the unified diff in memory and checks for conflicts.
    """
    try:
        patch = PatchSet(diff_str)
        original_lines = original_code.splitlines(keepends=True)

        for patched_file in patch:
            for hunk in patched_file:
                source_start = hunk.source_start - 1  # 0-indexed
                source_length = hunk.source_length

                # Verify that the original lines match what the hunk expects
                expected_source = [
                    line.value
                    for line in hunk
                    if line.is_context or line.is_removed
                ]
                actual_slice = original_lines[source_start: source_start + source_length]
                actual_slice_plain = [l.rstrip("\n") + "\n" for l in actual_slice]
                expected_plain = [l.rstrip("\n") + "\n" for l in expected_source]

                if actual_slice_plain != expected_plain:
                    return (
                        False,
                        f"Hunk context mismatch at line {hunk.source_start}: "
                        f"diff expects different source lines than submitted code",
                    )
        return True, None

    except Exception as exc:
        return False, f"In-memory apply failed: {exc}"
