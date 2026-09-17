# Vulnerability Manifest — Expense Tracker Demo App
> **Team Member 4 artifact** — ground truth for the CodeSentinel pipeline evaluation.
> Cross-check every pipeline output against this table before declaring the demo ready.

---

## How to use this manifest

1. Run the broken app through the CodeSentinel pipeline.
2. For every row below, check: did the pipeline find it? At what severity?
3. Log results in the [Cross-Check Log](#cross-check-log) section at the bottom.
4. Flag any **misses** to Team Member 1 (ML/detection gap) immediately.
5. Flag any **false positives** the pipeline raises that are NOT in this list.

---

## Seeded Vulnerability Index

| # | ID | File | Lines | Category | Expected Severity | Type | Description |
|---|---|---|---|---|---|---|---|
| 1 | `VULN-01` | `app/config.py` | 14 | security | **critical** | Hardcoded secret | `SECRET_KEY` hardcoded as string literal |
| 2 | `VULN-02` | `app/config.py` | 17 | security | **high** | Hardcoded API key | `PAYMENT_API_KEY` committed with `pk_live_` prefix |
| 3 | `VULN-03` | `app/routes/auth.py` | 64 | security | **critical** | SQL injection | Login query uses f-string interpolation of `username` and `password` |
| 4 | `VULN-04` | `app/routes/auth.py` | 28 | security | **high** | Weak randomness | `random.choice()` (non-CSPRNG) used to generate session tokens |
| 5 | `VULN-05` | `app/routes/auth.py` | 50 | security | **high** | Plain-text passwords | `INSERT` stores raw password string, no hashing |
| 6 | `VULN-06` | `app/routes/auth.py` | 79 | security | **medium** | Stack trace leakage | `traceback.format_exc()` returned verbatim in HTTP 500 response |
| 7 | `VULN-07` | `app/routes/items.py` | 78 | security | **critical** | `eval()` on user input | Category field passed to `eval()` when it contains `if`/`else` keywords |
| 8 | `VULN-08` | `app/routes/items.py` | 134 | security | **critical** | SQL injection | Search `q` param string-formatted into `LIKE` clause |
| 9 | `VULN-09` | `app/routes/items.py` | 160 | security | **high** | Missing auth check | `DELETE /expenses/<id>` has auth check commented out — unauthenticated access |
| 10 | `VULN-10` | `app/routes/items.py` | 182 | security | **high** | Path traversal | `filename` in receipt download not sanitised — allows `../../etc/passwd` |
| 11 | `VULN-11` | `app/routes/items.py` | 43 | bug | **medium** | Off-by-one in pagination | `start = page * per_page` skips first page of results (should be `(page-1)*per_page`) |
| 12 | `VULN-12` | `app/routes/items.py` | 65–70 | bug | **medium** | Missing input validation | `float(amount_raw)` called with no guard — `None` or a string crashes the endpoint |
| 13 | `VULN-13` | `app/routes/items.py` | 56–110 | code_smell | **medium** | God function | `create_expense()` performs auth, parsing, validation, DB write, dir creation, and formatting |
| 14 | `VULN-14` | `app/routes/items.py` | 143–148 | code_smell | **low** | Duplicated logic | Pagination slice copy-pasted from `list_expenses` into `search_expenses` |
| 15 | `VULN-15` | `app/routes/items.py` | 19 | code_smell | **low** | Unused import | `import json` at top of file — never referenced |

---

## Detailed Breakdown

### VULN-01 — Hardcoded SECRET_KEY (critical / security)
**File:** `app/config.py` **Lines:** 14  
**Pattern Bandit catches:** `B105` (hardcoded password/secret)  
**Pattern Semgrep catches:** `python.lang.security.audit.hardcoded-secret`  
**Attack surface:** Flask session cookies signed with this key can be forged by anyone who reads the source.
```python
# VULNERABLE
SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"
# FIX
SECRET_KEY = os.environ["SECRET_KEY"]
```

---

### VULN-02 — Hardcoded PAYMENT_API_KEY (high / security)
**File:** `app/config.py` **Lines:** 17  
**Pattern Bandit catches:** `B105`  
**Pattern Semgrep catches:** `generic.secrets.security.detected-generic-api-key`  
**Attack surface:** Live payment API key exposed in version control — any repo access grants billing privileges.
```python
# VULNERABLE
PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"
# FIX
PAYMENT_API_KEY = os.environ["PAYMENT_API_KEY"]
```

---

### VULN-03 — SQL Injection in Login (critical / security)
**File:** `app/routes/auth.py` **Lines:** 64  
**Pattern Bandit catches:** `B608` (SQL injection)  
**Pattern Semgrep catches:** `python.django.security.injection.sql.sql-injection-using-format-string` (and the generic equivalent)  
**Attack surface:** `username = "admin'--"` bypasses password check. `username = "' OR '1'='1"` returns the first user unconditionally.
```python
# VULNERABLE
query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
# FIX
cur = conn.execute("SELECT * FROM users WHERE username=? AND password=?", (username, password))
```

---

### VULN-04 — Weak Randomness for Session Tokens (high / security)
**File:** `app/routes/auth.py` **Lines:** 28  
**Pattern Bandit catches:** `B311` (pseudo-random generators)  
**Pattern Semgrep catches:** `python.lang.security.audit.insecure-random-usage`  
**Attack surface:** Mersenne Twister state can be reconstructed from ~624 observed tokens, allowing an attacker to predict future tokens.
```python
# VULNERABLE
return "".join(random.choice(chars) for _ in range(length))
# FIX
import secrets
return secrets.token_urlsafe(length)
```

---

### VULN-05 — Plain-text Password Storage (high / security)
**File:** `app/routes/auth.py` **Lines:** 50  
**Pattern Bandit catches:** N/A (requires semantic analysis — good ML signal)  
**Pattern Semgrep catches:** `python.lang.security.audit.plaintext-password-storage` (custom rule)  
**Attack surface:** A DB dump exposes all user passwords immediately. Also breaks against credential-stuffing attacks.
```python
# VULNERABLE
conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
# FIX
import bcrypt
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed))
```

---

### VULN-06 — Stack Trace Leakage in Error Handler (medium / security)
**File:** `app/routes/auth.py` **Lines:** 79  
**Pattern Bandit catches:** N/A  
**Pattern Semgrep catches:** `python.flask.security.audit.app-run-debug-enabled` (adjacent); custom rule on `traceback.format_exc()` in response  
**Attack surface:** Leaks DB path, library versions, internal function names, and schema fragments to any attacker who can trigger an exception.
```python
# VULNERABLE
return jsonify({"error": traceback.format_exc()}), 500
# FIX
log.exception("Login error for user %s", username)
return jsonify({"error": "Internal server error"}), 500
```

---

### VULN-07 — eval() on User-Controlled Input (critical / security)
**File:** `app/routes/items.py` **Lines:** 78  
**Pattern Bandit catches:** `B307` (use of `eval`)  
**Pattern Semgrep catches:** `python.lang.security.audit.eval-usage`  
**Attack surface:** Sending `category = "__import__('os').system('id')"` executes arbitrary OS commands on the server.  
**Demo payload:** `{"title":"lunch","amount":12.5,"category":"__import__('os').popen('whoami').read()"}`
```python
# VULNERABLE
category = eval(category)
# FIX — remove the eval entirely; normalise with a whitelist dict
VALID_CATEGORIES = {"food", "travel", "utilities", "general", "entertainment"}
category = category if category in VALID_CATEGORIES else "general"
```

---

### VULN-08 — SQL Injection in Search (critical / security)
**File:** `app/routes/items.py` **Lines:** 134  
**Pattern Bandit catches:** `B608`  
**Pattern Semgrep catches:** `python.lang.security.injection.sql`  
**Attack surface:** `q = "' OR '1'='1"` returns every user's expenses. `q = "'; DROP TABLE expenses;--"` destroys all data.
```python
# VULNERABLE
query = f"SELECT * FROM expenses WHERE user_id={user['id']} AND title LIKE '%{keyword}%'"
# FIX
cur = conn.execute(
    "SELECT * FROM expenses WHERE user_id=? AND title LIKE ?",
    (user["id"], f"%{keyword}%"),
)
```

---

### VULN-09 — Missing Auth Check on DELETE (high / security)
**File:** `app/routes/items.py` **Lines:** 160  
**Pattern Bandit catches:** N/A (logic-level; good ML/LLM signal)  
**Pattern Semgrep catches:** Custom rule checking for commented-out auth guards  
**Attack surface:** `DELETE /expenses/1` through `DELETE /expenses/9999` with no token deletes any record in the DB.
```python
# VULNERABLE — auth check commented out
# user = get_current_user(request)
# if not user: return jsonify({"error": "Unauthorized"}), 401

# FIX — restore the guard
user = get_current_user(request)
if not user:
    return jsonify({"error": "Unauthorized"}), 401
# Also verify ownership: WHERE id=? AND user_id=?
```

---

### VULN-10 — Path Traversal in Receipt Download (high / security)
**File:** `app/routes/items.py` **Lines:** 182  
**Pattern Bandit catches:** N/A  
**Pattern Semgrep catches:** `python.lang.security.audit.path-traversal-open`  
**Attack surface:** `GET /expenses/receipt/../../app/config.py` returns the app's config file including hardcoded secrets.
```python
# VULNERABLE
file_path = os.path.join(UPLOAD_DIR, filename)
# FIX
safe_name = os.path.basename(filename)
file_path = os.path.realpath(os.path.join(UPLOAD_DIR, safe_name))
if not file_path.startswith(os.path.realpath(UPLOAD_DIR)):
    abort(400, "Invalid path")
```

---

### VULN-11 — Off-by-One in Pagination (medium / bug)
**File:** `app/routes/items.py` **Lines:** 43  
**Pattern Bandit catches:** N/A  
**Pattern Semgrep catches:** N/A (logic bug — ML model should assign medium risk)  
**Impact:** Page 1 always returns items 11–20 (skips first 10). Page 0 returns items 1–10. Users can never see the first page via the normal UI.
```python
# VULNERABLE
start = page * per_page       # page=1 → start=10, skips items 0-9
# FIX
start = (page - 1) * per_page # page=1 → start=0, correct
```

---

### VULN-12 — Missing Input Validation on Amount (medium / bug)
**File:** `app/routes/items.py` **Lines:** 65–70  
**Pattern Bandit catches:** N/A  
**Pattern Semgrep catches:** N/A (logic bug)  
**Impact:** `POST /expenses` with `"amount": "twelve"` or `"amount": null` raises an unhandled `TypeError`/`ValueError`, returning an ugly 500. Negative amounts are silently accepted and corrupt totals.
```python
# VULNERABLE
amount = float(amount_raw)  # crashes on None or non-numeric string
# FIX
try:
    amount = float(amount_raw)
    if amount <= 0:
        return jsonify({"error": "amount must be positive"}), 400
except (TypeError, ValueError):
    return jsonify({"error": "amount must be a number"}), 400
```

---

### VULN-13 — God Function (medium / code_smell)
**File:** `app/routes/items.py` **Lines:** 56–110  
**Pattern Radon catches:** High cyclomatic complexity (CC > 10)  
**Pattern Semgrep catches:** N/A  
**Impact:** `create_expense()` has 9 distinct responsibilities. Any change to one (e.g. adding S3 upload) forces editing a 50-line function, increasing regression risk.

---

### VULN-14 — Duplicated Pagination Logic (low / code_smell)
**File:** `app/routes/items.py` **Lines:** 143–148 (duplicates lines 43–44)  
**Pattern Radon/Semgrep catches:** N/A (structural duplication)  
**Impact:** The off-by-one bug exists in *two places* — fixing one doesn't fix the other. DRY violation.

---

### VULN-15 — Unused Import (low / code_smell)
**File:** `app/routes/items.py` **Lines:** 19  
**Pattern Bandit catches:** N/A  
**Pattern Semgrep/Pylint catches:** `F401` unused-import  
**Impact:** Dead code, adds confusion about where JSON serialisation happens.
```python
# VULNERABLE
import json  # never used
# FIX: remove the line
```

---

## Cross-Check Log
> Fill this in during T+3:00–4:00 after running the real pipeline.

| # | ID | Pipeline Found? | Pipeline Severity | Matches Expected? | Notes |
|---|---|---|---|---|---|
| 1 | `VULN-01` | ☐ | — | — | |
| 2 | `VULN-02` | ☐ | — | — | |
| 3 | `VULN-03` | ☐ | — | — | |
| 4 | `VULN-04` | ☐ | — | — | |
| 5 | `VULN-05` | ☐ | — | — | |
| 6 | `VULN-06` | ☐ | — | — | |
| 7 | `VULN-07` | ☐ | — | — | |
| 8 | `VULN-08` | ☐ | — | — | |
| 9 | `VULN-09` | ☐ | — | — | |
| 10 | `VULN-10` | ☐ | — | — | |
| 11 | `VULN-11` | ☐ | — | — | |
| 12 | `VULN-12` | ☐ | — | — | |
| 13 | `VULN-13` | ☐ | — | — | |
| 14 | `VULN-14` | ☐ | — | — | |
| 15 | `VULN-15` | ☐ | — | — | |

**False positives (pipeline flagged but NOT in manifest):**
- *(none yet — fill in during testing)*

---

## Summary Stats (fill in after cross-check)

| Metric | Value |
|---|---|
| Total seeded issues | 15 |
| Critical | 4 |
| High | 5 |
| Medium | 4 |
| Low | 2 |
| Pipeline hits | TBD |
| Pipeline misses | TBD |
| False positives | TBD |
| Detection rate | TBD |
