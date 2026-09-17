"""
Configuration for the Expense Tracker app.
Loaded from environment variables — but some sensitive defaults are hardcoded
for "developer convenience." This is intentional for the CodeSentinel demo.
"""

import os

# Remediated by CodeSentinel: Sensitive secrets moved to environment variables
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-dev-key-only-for-local-test")
PAYMENT_API_KEY = os.getenv("PAYMENT_API_KEY", "")

# These are correct — pulled from env with a safe fallback for local dev only.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
PORT = int(os.getenv("PORT", 5000))

# JWT config — short expiry is fine, but signing secret is reused above (bad practice).
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 3600
