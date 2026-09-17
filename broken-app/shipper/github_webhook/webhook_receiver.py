"""
webhook_receiver.py — STRETCH: GitHub webhook-triggered shipper.

This is a tiny Flask server that receives GitHub `push` events and ships
each changed Python file to the CodeSentinel /ingest/webhook endpoint.

Only use this if the file_watcher.py primary path is solid and you have
time to spare — it adds ngrok/tunnel dependency and GitHub webhook delivery
latency vs. the zero-overhead file watcher.

Usage:
    # 1. Set env vars
    export GITHUB_WEBHOOK_SECRET=your_secret_here
    export SENTINEL_URL=http://localhost:8000

    # 2. Start this receiver (binds on port 9000 by default)
    python shipper/github_webhook/webhook_receiver.py

    # 3. Expose it via ngrok
    ngrok http 9000

    # 4. Register the ngrok URL as a GitHub webhook on your repo:
    #    Payload URL : https://<ngrok-id>.ngrok.io/webhook
    #    Content-type: application/json
    #    Secret      : <GITHUB_WEBHOOK_SECRET>
    #    Events      : Just the push event

Dependencies:
    pip install flask requests
"""

import hashlib
import hmac
import logging
import os

import requests
from flask import Flask, abort, jsonify, request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")
SENTINEL_BASE_URL = os.getenv("SENTINEL_URL", "http://localhost:8000")
INGEST_ENDPOINT = f"{SENTINEL_BASE_URL}/ingest/webhook"
RECEIVER_PORT = int(os.getenv("RECEIVER_PORT", 9000))

SHIPPED_EXTENSIONS = {".py", ".js", ".ts"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [WEBHOOK]  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("webhook_receiver")

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Signature verification (HMAC-SHA256, as required by GitHub)
# ---------------------------------------------------------------------------
def _verify_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """Return True if the request signature matches our webhook secret."""
    if not WEBHOOK_SECRET:
        log.warning("GITHUB_WEBHOOK_SECRET not set — skipping signature verification")
        return True  # allow in dev; never skip in production

    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


# ---------------------------------------------------------------------------
# GitHub file content fetcher
# ---------------------------------------------------------------------------
def _fetch_file_content(raw_url: str) -> str | None:
    """Fetch raw file content from GitHub's CDN. Returns None on error."""
    try:
        resp = requests.get(raw_url, timeout=10)
        resp.raise_for_status()
        return resp.text
    except Exception as exc:
        log.warning("Could not fetch %s: %s", raw_url, exc)
        return None


def _raw_url(repo_full_name: str, ref: str, filepath: str) -> str:
    """Build a raw.githubusercontent.com URL for a file at a specific ref."""
    return f"https://raw.githubusercontent.com/{repo_full_name}/{ref}/{filepath}"


# ---------------------------------------------------------------------------
# Ship a single file to CodeSentinel
# ---------------------------------------------------------------------------
def _ship(filename: str, code: str) -> None:
    payload = {"filename": filename, "code": code, "source": "github"}
    try:
        resp = requests.post(INGEST_ENDPOINT, json=payload, timeout=15)
        resp.raise_for_status()
        review_id = resp.json().get("review_id", "?")
        log.info("✓ Shipped %s → review_id=%s", filename, review_id)
    except requests.exceptions.ConnectionError:
        log.error("✗ Backend unreachable at %s", SENTINEL_BASE_URL)
    except Exception as exc:
        log.error("✗ Failed to ship %s: %s", filename, exc)


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------
@app.route("/webhook", methods=["POST"])
def github_webhook():
    """Receive a GitHub push event and ship changed source files."""
    payload_bytes = request.get_data()
    sig = request.headers.get("X-Hub-Signature-256", "")

    if not _verify_signature(payload_bytes, sig):
        log.warning("Invalid signature — request rejected")
        abort(403)

    event_type = request.headers.get("X-GitHub-Event", "")
    if event_type == "ping":
        return jsonify({"message": "pong"}), 200

    if event_type != "push":
        return jsonify({"message": f"Event '{event_type}' ignored"}), 200

    data = request.get_json(silent=True) or {}
    repo_full_name = data.get("repository", {}).get("full_name", "")
    head_commit = data.get("head_commit") or {}
    ref = data.get("after", "HEAD")   # the new commit SHA

    changed_files = (
        head_commit.get("added", [])
        + head_commit.get("modified", [])
    )

    if not changed_files:
        return jsonify({"message": "No changed files in push"}), 200

    log.info(
        "Push to %s (%s) — %d changed file(s)",
        repo_full_name, ref[:8], len(changed_files),
    )

    shipped = 0
    for filepath in changed_files:
        ext = os.path.splitext(filepath)[1].lower()
        if ext not in SHIPPED_EXTENSIONS:
            log.debug("Skipping %s (extension not watched)", filepath)
            continue

        raw_url = _raw_url(repo_full_name, ref, filepath)
        code = _fetch_file_content(raw_url)
        if code:
            _ship(filepath, code)
            shipped += 1

    return jsonify({"shipped": shipped, "total_changed": len(changed_files)}), 200


@app.route("/health")
def health():
    return jsonify({"status": "ok", "endpoint": INGEST_ENDPOINT})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    log.info("GitHub Webhook Receiver starting on port %d", RECEIVER_PORT)
    log.info("Forwarding to: %s", INGEST_ENDPOINT)
    if not WEBHOOK_SECRET:
        log.warning("GITHUB_WEBHOOK_SECRET is not set — all payloads accepted (dev mode)")
    app.run(host="0.0.0.0", port=RECEIVER_PORT, debug=False)
