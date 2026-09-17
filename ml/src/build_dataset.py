"""
build_dataset.py -- Synthetic dataset generator for CodeSentinel.

Since VUDENC requires a multi-GB download, this script generates a
high-quality synthetic training set using real vulnerability patterns.
Each sample is constructed to produce realistic feature vectors that
match what the Detection Agent would see on real code.

Usage:
    python -m ml.src.build_dataset

Writes:
    ml/data/processed/train.csv   (~1600 samples)
    ml/data/processed/test.csv    (~400 samples)
    ml/data/processed/features.csv  (full combined dataset)
"""

import csv
import random
import sys
from pathlib import Path

# Ensure repo root on path
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from ml.src.feature_extraction import extract_features, feature_names

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# ---------------------------------------------------------------------------
# Vulnerability code templates  (realistic snippets per severity bucket)
# ---------------------------------------------------------------------------

_CRITICAL_TEMPLATES = [
    # SQL Injection via string formatting
    'import sqlite3\ndef get_user(username):\n    conn = sqlite3.connect("db.sqlite")\n    cursor = conn.cursor()\n    cursor.execute("SELECT * FROM users WHERE name = \'%s\'" % username)\n    return cursor.fetchall()\n',
    # SQL injection f-string
    'def fetch_record(db, record_id):\n    cursor = db.cursor()\n    cursor.execute(f"SELECT * FROM records WHERE id = {record_id}")\n    return cursor.fetchone()\n',
    # RCE via eval with user input
    'from flask import request\ndef evaluate():\n    expr = request.args.get("expr", "")\n    result = eval(expr)\n    return str(result)\n',
    # RCE via exec
    'def run_code(user_code):\n    exec(user_code)\n    return "done"\n',
    # pickle deserialization of untrusted data
    'import pickle\nfrom flask import request\ndef load_session():\n    data = request.cookies.get("session")\n    obj = pickle.loads(data.encode("latin1"))\n    return obj\n',
    # SQL injection with concatenation
    'def search_products(db, query):\n    sql = "SELECT * FROM products WHERE name LIKE \'%" + query + "%\'"\n    return db.execute(sql).fetchall()\n',
    # Remote code exec via subprocess shell injection
    'import subprocess\nfrom flask import request\ndef run_cmd():\n    cmd = request.form.get("cmd", "ls")\n    output = subprocess.check_output("ls -la " + cmd, shell=True)\n    return output.decode()\n',
    # SQL injection ORM bypass
    'from django.db import connection\ndef get_items(category):\n    with connection.cursor() as cursor:\n        cursor.execute("SELECT * FROM items WHERE category = \'" + category + "\'")\n        return cursor.fetchall()\n',
    # eval in loop
    'def process_expressions(exprs):\n    results = []\n    for e in exprs:\n        results.append(eval(e))\n    return results\n',
    # exec with format string
    'def dynamic_import(module_name, func_name):\n    exec(f"from {module_name} import {func_name}")\n    return eval(f"{func_name}()")\n',
]

_HIGH_TEMPLATES = [
    # Hardcoded API key
    'import os\nSECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"\nPAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"\nDATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")\n',
    # Subprocess shell=True with variable
    'import subprocess\ndef backup_files(path):\n    cmd = f"tar -czf backup.tar.gz {path}"\n    subprocess.call(cmd, shell=True)\n    return "backup complete"\n',
    # Hardcoded password
    'import mysql.connector\ndef connect_db():\n    return mysql.connector.connect(\n        host="localhost",\n        user="admin",\n        password="Admin1234!",\n        database="production_db"\n    )\n',
    # OS system command injection
    'import os\ndef compress(filename):\n    os.system(f"gzip {filename}")\n',
    # Weak JWT secret
    'import jwt\nJWT_SECRET = "secret"\ndef create_token(user_id):\n    return jwt.encode({"user_id": user_id}, JWT_SECRET, algorithm="HS256")\n',
    # Subprocess with shell=True and user input
    'import subprocess\nfrom flask import request\ndef run_grep():\n    pattern = request.args.get("pattern")\n    result = subprocess.run(f"grep {pattern} /var/log/app.log", shell=True, capture_output=True)\n    return result.stdout.decode()\n',
    # Command injection via os.popen
    'import os\ndef get_file_info(filename):\n    output = os.popen(f"stat {filename}").read()\n    return output\n',
    # Hardcoded DB credentials
    'DB_HOST = "prod-db.internal"\nDB_USER = "root"\nDB_PASS = "Pr0duction@2024"\nDB_NAME = "customer_data"\ndef get_connection():\n    import psycopg2\n    return psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)\n',
    # Subprocess shell True in loop
    'import subprocess\ndef process_files(file_list):\n    for f in file_list:\n        subprocess.call(f"chmod 755 {f}", shell=True)\n',
    # Command via subprocess with user data
    'import subprocess\ndef ping_host(host):\n    result = subprocess.run(["ping", "-c", "1", host], shell=True, capture_output=True)\n    return result.stdout\n',
]

_MEDIUM_TEMPLATES = [
    # XSS -- unescaped output
    'from flask import request, render_template_string\ndef greet():\n    name = request.args.get("name", "World")\n    return render_template_string(f"<h1>Hello {name}</h1>")\n',
    # CSRF -- no token check
    'from flask import request, session\ndef transfer_funds():\n    amount = request.form.get("amount")\n    to_account = request.form.get("to")\n    process_transfer(session["user_id"], to_account, amount)\n    return "Transferred"\n',
    # yaml.load without SafeLoader
    'import yaml\ndef load_config(config_path):\n    with open(config_path) as f:\n        return yaml.load(f)\n',
    # Unvalidated redirect
    'from flask import request, redirect\ndef login_redirect():\n    next_url = request.args.get("next", "/dashboard")\n    return redirect(next_url)\n',
    # XSS in template
    'from flask import request\ndef show_comment():\n    comment = request.form.get("comment", "")\n    return f"<div>{comment}</div>"\n',
    # CSRF -- state change on GET
    'from flask import request\ndef delete_item():\n    item_id = request.args.get("id")\n    db.delete(item_id)\n    return "Deleted"\n',
    # yaml.load in config loader
    'import yaml\nclass Config:\n    def load(self, path):\n        with open(path) as fh:\n            self.data = yaml.load(fh.read())\n',
    # Open redirect with format string
    'from flask import redirect, request\ndef oauth_callback():\n    state = request.args.get("redirect_uri", "/")\n    return redirect(state)\n',
    # Reflected XSS in error page
    'from flask import request\ndef error_page():\n    msg = request.args.get("msg", "An error occurred")\n    return f"<html><body><h1>Error: {msg}</h1></body></html>"\n',
    # SSRF via unvalidated URL
    'import requests\nfrom flask import request\ndef fetch_url():\n    url = request.args.get("url")\n    resp = requests.get(url)\n    return resp.text\n',
]

_LOW_TEMPLATES = [
    # Path disclosure in error message
    'import traceback\nfrom flask import request\ndef api_handler():\n    try:\n        result = process(request.json)\n        return result\n    except Exception as e:\n        return str(traceback.format_exc()), 500\n',
    # Verbose error messages
    'from flask import jsonify\ndef divide(a, b):\n    try:\n        return jsonify({"result": a / b})\n    except ZeroDivisionError as e:\n        return jsonify({"error": str(e), "file": __file__}), 400\n',
    # Debug mode enabled
    'from flask import Flask\napp = Flask(__name__)\napp.config["DEBUG"] = True\napp.config["TESTING"] = True\n',
    # Logging sensitive data
    'import logging\nlogger = logging.getLogger(__name__)\ndef authenticate(username, password):\n    logger.debug(f"Auth attempt: user={username} pass={password}")\n    return check_credentials(username, password)\n',
    # Insecure temporary file
    'import tempfile\ndef process_upload(data):\n    tmp = tempfile.mktemp(suffix=".txt")\n    with open(tmp, "w") as f:\n        f.write(data)\n    return tmp\n',
    # Weak random
    'import random\nimport string\ndef generate_reset_token():\n    return "".join(random.choices(string.ascii_letters + string.digits, k=32))\n',
    # MD5 for password hashing
    'import hashlib\ndef hash_password(password):\n    return hashlib.md5(password.encode()).hexdigest()\n',
    # Print statement leaking info
    'def login(username, password):\n    print(f"DEBUG: login attempt {username}:{password}")\n    user = db.get_user(username)\n    return user.check_password(password)\n',
    # Insecure cookie
    'from flask import Response\ndef set_session(user_id):\n    resp = Response("OK")\n    resp.set_cookie("user_id", str(user_id))\n    return resp\n',
    # Unhandled exception
    'from flask import request\ndef parse_json():\n    import json\n    data = request.data.decode()\n    result = json.loads(data)\n    return result\n',
]

_SAFE_TEMPLATES = [
    # Parameterized SQL
    'import sqlite3\ndef get_user(username: str):\n    conn = sqlite3.connect("db.sqlite")\n    cursor = conn.cursor()\n    cursor.execute("SELECT * FROM users WHERE name = ?", (username,))\n    return cursor.fetchone()\n',
    # Env-based secrets
    'import os\nSECRET_KEY = os.environ.get("SECRET_KEY")\nif not SECRET_KEY:\n    raise ValueError("SECRET_KEY must be set")\n',
    # subprocess no shell
    'import subprocess\nfrom pathlib import Path\ndef backup_files(path: str) -> bool:\n    safe_path = Path(path).resolve()\n    result = subprocess.run(["tar", "-czf", "backup.tar.gz", str(safe_path)], shell=False, capture_output=True)\n    return result.returncode == 0\n',
    # safe_load yaml
    'import yaml\ndef load_config(config_path: str) -> dict:\n    with open(config_path) as f:\n        return yaml.safe_load(f)\n',
    # Validated redirect
    'from flask import request, redirect, url_for\nfrom urllib.parse import urlparse\nALLOWED_HOSTS = {"app.example.com"}\ndef safe_redirect():\n    next_url = request.args.get("next", "/dashboard")\n    parsed = urlparse(next_url)\n    if parsed.netloc and parsed.netloc not in ALLOWED_HOSTS:\n        return redirect(url_for("index"))\n    return redirect(next_url)\n',
]


# ---------------------------------------------------------------------------
# Feature vector generation helpers
# ---------------------------------------------------------------------------

def _make_findings_for_label(label: str) -> list:
    if label == "critical":
        n_high = random.randint(1, 3)
        n_med = random.randint(0, 2)
        n_low = random.randint(0, 2)
    elif label == "high":
        n_high = random.randint(1, 2)
        n_med = random.randint(0, 2)
        n_low = random.randint(0, 2)
    elif label == "medium":
        n_high = 0
        n_med = random.randint(1, 3)
        n_low = random.randint(0, 2)
    else:
        n_high = 0
        n_med = 0
        n_low = random.randint(0, 2)

    findings = []
    for _ in range(n_high):
        findings.append({
            "id": f"f-{random.randint(1000,9999)}",
            "category": "security",
            "tool_severity": "high",
            "source": random.choice(["bandit", "semgrep"]),
        })
    for _ in range(n_med):
        findings.append({
            "id": f"f-{random.randint(1000,9999)}",
            "category": random.choice(["security", "bug"]),
            "tool_severity": "medium",
            "source": random.choice(["bandit", "semgrep"]),
        })
    for _ in range(n_low):
        findings.append({
            "id": f"f-{random.randint(1000,9999)}",
            "category": random.choice(["security", "code_smell"]),
            "tool_severity": "low",
            "source": random.choice(["bandit", "semgrep"]),
        })
    return findings


def _complexity_for_label(label: str) -> dict:
    if label == "critical":
        cc = random.randint(8, 20)
        sloc = random.randint(30, 150)
        nesting = random.randint(3, 7)
        fn_len = [random.randint(20, 80) for _ in range(random.randint(1, 4))]
    elif label == "high":
        cc = random.randint(5, 14)
        sloc = random.randint(20, 100)
        nesting = random.randint(2, 5)
        fn_len = [random.randint(15, 60) for _ in range(random.randint(1, 4))]
    elif label == "medium":
        cc = random.randint(3, 10)
        sloc = random.randint(15, 80)
        nesting = random.randint(1, 4)
        fn_len = [random.randint(10, 50) for _ in range(random.randint(1, 3))]
    else:
        cc = random.randint(1, 6)
        sloc = random.randint(5, 50)
        nesting = random.randint(0, 3)
        fn_len = [random.randint(5, 30) for _ in range(random.randint(0, 3))]

    return {
        "max_cyclomatic_complexity": cc,
        "avg_cyclomatic_complexity": round(cc * random.uniform(0.5, 1.0), 2),
        "maintainability_index": round(random.uniform(10, 85), 2),
        "max_nesting_depth": nesting,
        "sloc": sloc,
        "function_lengths": fn_len,
    }


def _generate_samples(templates: list, label: str, n: int) -> list:
    rows = []
    for _ in range(n):
        code = random.choice(templates)
        if random.random() < 0.3:
            code = "import os\nimport sys\n" + code
        if random.random() < 0.2:
            code += "\n# TODO: fix this\n"

        findings = _make_findings_for_label(label)
        complexity = _complexity_for_label(label)
        feats = extract_features(
            code, findings, complexity,
            filename=f"sample_{random.randint(1, 9999)}.py"
        )
        feats["label"] = label
        rows.append(feats)
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("[build_dataset] Generating synthetic training dataset...")

    all_rows: list = []

    per_class = 400  # 1600 total

    print(f"  Generating {per_class} critical samples...")
    all_rows.extend(_generate_samples(_CRITICAL_TEMPLATES, "critical", per_class))

    print(f"  Generating {per_class} high samples...")
    all_rows.extend(_generate_samples(_HIGH_TEMPLATES, "high", per_class))

    print(f"  Generating {per_class} medium samples...")
    all_rows.extend(_generate_samples(_MEDIUM_TEMPLATES, "medium", per_class))

    print(f"  Generating {per_class} low samples (includes safe code)...")
    low_templates = _LOW_TEMPLATES + _SAFE_TEMPLATES
    all_rows.extend(_generate_samples(low_templates, "low", per_class))

    random.shuffle(all_rows)
    total = len(all_rows)
    print(f"[build_dataset] Total samples: {total}")

    split_idx = int(total * 0.8)
    train_rows = all_rows[:split_idx]
    test_rows = all_rows[split_idx:]

    cols = feature_names() + ["label"]
    out_dir = Path(__file__).resolve().parents[1] / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)

    def write_csv(rows: list, path: Path) -> None:
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=cols)
            writer.writeheader()
            for row in rows:
                writer.writerow({c: row.get(c, 0) for c in cols})
        print(f"[build_dataset] Wrote {len(rows)} rows -> {path}")

    write_csv(all_rows, out_dir / "features.csv")
    write_csv(train_rows, out_dir / "train.csv")
    write_csv(test_rows, out_dir / "test.csv")

    print("[build_dataset] Done! Ready for: python -m ml.src.train")


if __name__ == "__main__":
    main()
