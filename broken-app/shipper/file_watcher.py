"""
file_watcher.py — Local file-watcher auto-shipper for CodeSentinel demo.

Watches the broken-app/app directory for file saves and immediately POSTs
each changed file to the CodeSentinel backend's /ingest/webhook endpoint.

This is the PRIMARY ingestion channel (recommended over GitHub webhook for
live demo reliability — zero network hops beyond localhost, no ngrok/tunnel
needed, no GitHub API outage risk mid-pitch).

Usage:
    # From the broken-app/ directory:
    python shipper/file_watcher.py

    # Override defaults via env vars:
    SENTINEL_URL=http://localhost:8000  python shipper/file_watcher.py
    WATCH_DIR=./app                    python shipper/file_watcher.py

Dependencies:
    pip install watchdog requests
"""

import os
import sys
import time
import logging

import requests
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent
from watchdog.observers import Observer

# ---------------------------------------------------------------------------
# Configuration (all overridable via environment variables)
# ---------------------------------------------------------------------------
SENTINEL_BASE_URL = os.getenv("SENTINEL_URL", "http://localhost:8000")
INGEST_ENDPOINT = f"{SENTINEL_BASE_URL}/ingest/webhook"

# Directory to watch — defaults to the broken-app/app folder relative to CWD
WATCH_DIR = os.path.abspath(os.getenv("WATCH_DIR", os.path.join(os.path.dirname(__file__), "..", "app")))

# Only ship files with these extensions
WATCHED_EXTENSIONS = {".py", ".js", ".ts", ".go", ".java", ".rb"}

# How long to debounce rapid save events (seconds)
DEBOUNCE_SECONDS = float(os.getenv("DEBOUNCE_SECONDS", "0.5"))

# Request timeout for each POST to the backend (seconds)
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "10"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [WATCHER]  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("file_watcher")


# ---------------------------------------------------------------------------
# Debouncer — prevents duplicate POSTs when an editor writes + fsyncs rapidly
# ---------------------------------------------------------------------------
class _Debouncer:
    """
    Tracks the last-seen modification time per file path.
    A second event for the same file within DEBOUNCE_SECONDS is dropped.
    """

    def __init__(self, window: float = DEBOUNCE_SECONDS):
        self._last_fired: dict[str, float] = {}
        self._window = window

    def should_fire(self, path: str) -> bool:
        now = time.monotonic()
        last = self._last_fired.get(path, 0.0)
        if now - last < self._window:
            return False
        self._last_fired[path] = now
        return True


_debouncer = _Debouncer()


# ---------------------------------------------------------------------------
# Sender
# ---------------------------------------------------------------------------
def ship_file(filepath: str) -> None:
    """
    Read `filepath` and POST its contents to the CodeSentinel ingest endpoint.

    Payload shape (matches PRD Section 3.6 / backend /ingest/webhook contract):
        {
            "filename": "app/routes/auth.py",
            "code":     "<file contents>",
            "source":   "watcher"
        }
    """
    if not _debouncer.should_fire(filepath):
        return

    ext = os.path.splitext(filepath)[1].lower()
    if ext not in WATCHED_EXTENSIONS:
        log.debug("Skipping %s (extension %s not watched)", filepath, ext)
        return

    # Relative path for display / backend filename field
    try:
        rel_path = os.path.relpath(filepath, WATCH_DIR)
    except ValueError:
        rel_path = os.path.basename(filepath)

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            code = fh.read()
    except OSError as exc:
        log.warning("Could not read %s: %s", filepath, exc)
        return

    if not code.strip():
        log.debug("Skipping empty file: %s", filepath)
        return

    payload = {
        "filename": rel_path.replace("\\", "/"),
        "code": code,
        "source": "watcher",
    }

    log.info("→ Shipping  %s  (%d bytes) to %s", rel_path, len(code), INGEST_ENDPOINT)

    try:
        resp = requests.post(INGEST_ENDPOINT, json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        review_id = data.get("review_id", "?")
        log.info("✓ Accepted   review_id=%s", review_id)
    except requests.exceptions.ConnectionError:
        log.error(
            "✗ Connection refused — is the CodeSentinel backend running at %s?",
            SENTINEL_BASE_URL,
        )
    except requests.exceptions.Timeout:
        log.error("✗ Request timed out after %ds", REQUEST_TIMEOUT)
    except requests.exceptions.HTTPError as exc:
        log.error("✗ HTTP %s — %s", exc.response.status_code, exc.response.text[:200])
    except Exception as exc:
        log.error("✗ Unexpected error: %s", exc)


# ---------------------------------------------------------------------------
# watchdog event handler
# ---------------------------------------------------------------------------
class SourceFileHandler(FileSystemEventHandler):
    """Fires ship_file() on any Python/source file modification or creation."""

    def on_modified(self, event: FileModifiedEvent) -> None:
        if not event.is_directory:
            ship_file(event.src_path)

    def on_created(self, event: FileCreatedEvent) -> None:
        if not event.is_directory:
            ship_file(event.src_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    if not os.path.isdir(WATCH_DIR):
        log.error("Watch directory does not exist: %s", WATCH_DIR)
        sys.exit(1)

    log.info("CodeSentinel File Watcher starting…")
    log.info("  Watching : %s", WATCH_DIR)
    log.info("  Endpoint : %s", INGEST_ENDPOINT)
    log.info("  Extensions: %s", ", ".join(sorted(WATCHED_EXTENSIONS)))
    log.info("Press Ctrl+C to stop.\n")

    handler = SourceFileHandler()
    observer = Observer()
    observer.schedule(handler, path=WATCH_DIR, recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Shutting down watcher…")
    finally:
        observer.stop()
        observer.join()
        log.info("Watcher stopped.")


if __name__ == "__main__":
    main()
