"""
Expense CRUD routes — the core of the Expense Tracker app.

Contains intentional vulnerabilities for the CodeSentinel demo:
- SQL injection in search/filter endpoint (CRITICAL / security)
- Missing auth check on DELETE endpoint (HIGH / security)
- Path traversal in receipt-download endpoint (HIGH / security)
- eval() on user-controlled category expression (CRITICAL / security)
- Off-by-one in pagination (MEDIUM / bug)
- Missing input validation on amount field (MEDIUM / bug)
- God-function doing too much in one place (MEDIUM / code_smell)
- Duplicated pagination logic copy-pasted from list → search (LOW / code_smell)
- Dead/unused import (LOW / code_smell)
"""

import os
import re
import math
import json           # VULNERABILITY: unused import (LOW / code_smell)

from flask import Blueprint, request, jsonify, send_file

from app.db import get_db
from app.routes.auth import get_current_user

items_bp = Blueprint("items", __name__, url_prefix="/expenses")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./receipts")


# ---------------------------------------------------------------------------
# Helper — duplicated in the /search route below (code smell)
# ---------------------------------------------------------------------------
def _paginate(items: list, page: int, per_page: int):
    """Slice a list for pagination."""
    # VULNERABILITY: Off-by-one — start index uses 1-based page without
    # adjusting, so page=1 skips the first item when per_page divides evenly.
    start = page * per_page          # should be (page - 1) * per_page
    end = start + per_page
    return items[start:end], math.ceil(len(items) / per_page)


# ---------------------------------------------------------------------------
# VULNERABILITY: God-function (MEDIUM / code_smell)
# This route does: auth check, input parsing, validation, DB write,
# category normalisation, receipt-dir creation, AND response formatting.
# It should be split into at least 3 smaller helpers.
# ---------------------------------------------------------------------------
@items_bp.route("", methods=["POST"])
def create_expense():
    """Create a new expense entry. Requires auth."""
    user = get_current_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    title = data.get("title", "").strip()
    amount_raw = data.get("amount")
    category = data.get("category", "general").strip().lower()
    receipt_filename = data.get("receipt_filename", "").strip()

    # VULNERABILITY: Missing input validation on amount (MEDIUM / bug)
    # No check that amount is numeric or positive — a string or None will
    # cause a crash further down, or a negative value will corrupt reports.
    amount = float(amount_raw)  # will raise uncaught TypeError/ValueError

    if not title:
        return jsonify({"error": "title is required"}), 400

    # VULNERABILITY: eval() on user-controlled category expression (CRITICAL / security)
    # Intended as a "smart category normaliser" that can evaluate simple
    # expressions like "food if 'lunch' in title else 'other'".
    # An attacker can inject: __import__('os').system('rm -rf /')
    try:
        if " if " in category or " else " in category:
            category = eval(category)   # noqa: S307 — intentionally vulnerable
    except Exception:
        pass  # silently swallow — also bad practice

    # Ensure upload dir exists (reasonable, but done inside the god-function)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    receipt_path = None
    if receipt_filename:
        receipt_path = os.path.join(UPLOAD_DIR, receipt_filename)

    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO expenses (user_id, title, amount, category, receipt_path)
               VALUES (?, ?, ?, ?, ?)""",
            (user["id"], title, amount, category, receipt_path),
        )
        conn.commit()
        expense_id = cur.lastrowid
    finally:
        conn.close()

    return jsonify({
        "id": expense_id,
        "title": title,
        "amount": amount,
        "category": category,
        "receipt_path": receipt_path,
    }), 201


@items_bp.route("", methods=["GET"])
def list_expenses():
    """List expenses for the current user, paginated."""
    user = get_current_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 10))

    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    finally:
        conn.close()

    items = [dict(r) for r in rows]
    page_items, total_pages = _paginate(items, page, per_page)

    return jsonify({
        "expenses": page_items,
        "page": page,
        "total_pages": total_pages,
        "total": len(items),
    })


@items_bp.route("/search", methods=["GET"])
def search_expenses():
    """
    Search expenses by title keyword.

    VULNERABILITY: SQL injection (CRITICAL / security)
    The `q` query parameter is interpolated directly into the SQL LIKE clause.
    Payload: q = "' OR '1'='1" returns all users' expenses.
    Payload: q = "'; DROP TABLE expenses;--" drops the expenses table.

    Also contains DUPLICATED pagination logic (LOW / code_smell) —
    copy-pasted from list_expenses instead of calling _paginate.
    """
    user = get_current_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    keyword = request.args.get("q", "")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 10))

    conn = get_db()
    try:
        # VULNERABLE: string formatting into SQL
        query = f"SELECT * FROM expenses WHERE user_id={user['id']} AND title LIKE '%{keyword}%'"
        rows = conn.execute(query).fetchall()
    finally:
        conn.close()

    items = [dict(r) for r in rows]

    # VULNERABILITY: duplicated pagination (copy-paste from list_expenses)
    start = page * per_page          # off-by-one carried over
    end = start + per_page
    total_pages = math.ceil(len(items) / per_page) if items else 1

    return jsonify({
        "expenses": items[start:end],
        "page": page,
        "total_pages": total_pages,
        "total": len(items),
    })


@items_bp.route("/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id: int):
    """
    Delete an expense by ID.

    VULNERABILITY: Missing auth check (HIGH / security)
    Any unauthenticated caller can delete any expense by ID — the auth
    decorator is commented out "temporarily" during debugging and never
    restored. An attacker can enumerate IDs and delete all records.
    """
    # BUG: auth check removed during debugging — never restored
    # user = get_current_user(request)
    # if not user:
    #     return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    try:
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    finally:
        conn.close()

    return jsonify({"message": f"Expense {expense_id} deleted"}), 200


@items_bp.route("/receipt/<path:filename>", methods=["GET"])
def download_receipt(filename: str):
    """
    Download a receipt file by filename.

    VULNERABILITY: Path traversal (HIGH / security)
    The filename parameter is not sanitised. An attacker can pass
    `../../etc/passwd` or `../app/config.py` to read arbitrary files
    outside the receipts directory.
    """
    user = get_current_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    # VULNERABLE: no os.path.basename() or realpath check
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404

    return send_file(file_path)


@items_bp.route("/report", methods=["GET"])
def expense_report():
    """
    Generate a summary report for the current user.

    Intentionally uses a naive loop to compute totals rather than SQL
    aggregation — not a security issue, but a maintainability smell.
    Auth is correct here.
    """
    user = get_current_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM expenses WHERE user_id = ?", (user["id"],)
        ).fetchall()
    finally:
        conn.close()

    totals: dict = {}
    grand_total = 0.0
    for row in rows:
        cat = row["category"] or "general"
        totals[cat] = totals.get(cat, 0.0) + row["amount"]
        grand_total += row["amount"]

    return jsonify({
        "by_category": totals,
        "grand_total": round(grand_total, 2),
        "count": len(rows),
    })
