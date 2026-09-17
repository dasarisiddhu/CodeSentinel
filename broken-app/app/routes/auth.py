"""
Authentication routes — login, register, token generation.

Contains several intentional vulnerabilities for the CodeSentinel demo:
- SQL injection in login query (CRITICAL / security)
- Weak randomness for session token generation (HIGH / security)
- Verbose error handler leaking stack trace to client (MEDIUM / security)
- Plain-text password storage (HIGH / security)
"""

import random
import string
import traceback
import sqlite3

from flask import Blueprint, request, jsonify

from app.db import get_db

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


# ---------------------------------------------------------------------------
# VULNERABILITY: Weak randomness for session token (HIGH / security)
# random.random() is not cryptographically secure. An attacker can predict
# tokens if they can observe a few outputs.
# ---------------------------------------------------------------------------
def generate_session_token(length: int = 32) -> str:
    """Generate a session token using the non-CSPRNG random module."""
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


# In-memory token store — also has a race condition if ever made async,
# but for now the bug is purely the weak RNG above.
_active_tokens: dict = {}


@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user. Stores password in plain text (HIGH / security)."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400

    conn = get_db()
    try:
        # VULNERABILITY: Plain-text password storage (HIGH / security)
        # A real app would hash with bcrypt/argon2. This stores the raw string.
        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, password),
        )
        conn.commit()
        return jsonify({"message": "User registered successfully"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already exists"}), 409
    finally:
        conn.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Log in with username + password.

    VULNERABILITY: SQL injection (CRITICAL / security)
    The username is interpolated directly into the SQL string.
    Payload: username = "admin' OR '1'='1" bypasses password check entirely.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    conn = get_db()
    try:
        # ----------------------------------------------------------------
        # VULNERABLE: direct string formatting into SQL — never do this.
        # Parameterized form would be: "SELECT * FROM users WHERE username=?"
        # ----------------------------------------------------------------
        query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
        cur = conn.execute(query)
        user = cur.fetchone()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        token = generate_session_token()
        _active_tokens[token] = dict(user)
        return jsonify({"token": token, "user_id": user["id"], "role": user["role"]}), 200

    except Exception:
        # VULNERABILITY: Verbose error handler leaking stack trace (MEDIUM / security)
        # Sends the full Python traceback to the HTTP response — exposes
        # internal paths, library versions, and DB schema fragments.
        return jsonify({"error": traceback.format_exc()}), 500
    finally:
        conn.close()


def get_current_user(request):
    """Extract user from Bearer token. Returns None if missing/invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer "):]
    return _active_tokens.get(token)
