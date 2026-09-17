"""
Configuration for the Expense Tracker app.
Loaded from environment variables — but some sensitive defaults are hardcoded
for "developer convenience." This is intentional for the CodeSentinel demo.
"""

import os

# --- VULNERABILITY: Hardcoded secret key (HIGH / security) ---
# A real developer might do this "just to test" and forget to change it.
SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"

# --- VULNERABILITY: Hardcoded API key (HIGH / security) ---
# Third-party payment service key committed directly in source.
PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"

# These are correct — pulled from env with a safe fallback for local dev only.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
PORT = int(os.getenv("PORT", 5000))

# JWT config — short expiry is fine, but signing secret is reused above (bad practice).
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 3600
