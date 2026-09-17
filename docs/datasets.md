# Datasets for the ML Risk-Scoring Model
**Owner: Team Member 1 | Data lands in `ml/data/` per the folder structure**

---

## Recommendation at a glance

| Priority | Dataset | Language | What it's for | Effort |
|---|---|---|---|---|
| **Primary** | VUDENC | Python (native) | Real GitHub vulnerability-fixing commits, 7 categories | Low — plain JSON/text files |
| **Optional** | Juliet Test Suite (C/C++ 1.3) | C/C++ | Structural features transfer across languages | Low, but skip if short on time |
| **Stretch** | CVEfixes | Multi-language incl. Python | Real CVE-severity labels + realistic fix diffs | Higher — ships as SQL dump |
| **Always available** | broken-app manifest (Member 4) | Python | Final sanity check against ground truth you control | None |

Do not attempt all four under time pressure. VUDENC alone is enough for a defensible trained model.

---

## 1. VUDENC (Primary)

**What it is:** 1,009 real vulnerability-fixing commits from GitHub Python repositories, covering seven vulnerability categories:
- SQL injection
- XSS
- Command injection
- XSRF
- Remote code execution
- Path disclosure
- Open redirect

**Where to get it:**
- Code + scripts: `github.com/LauraWartschinski/VulnerabilityDetection`
- Labeled datasets (plain code + label files): Zenodo, record `3559841` — "VUDENC - datasets for vulnerabilities"
- Pick 2–3 categories that overlap with what Semgrep/Bandit flags: **SQL injection** and **command injection** are the strongest overlap.

**What you actually need:** you are NOT doing the original paper's word2vec + LSTM approach. Pull the **pre-fix code snippet** and its **category label** from each commit, run it through `extract_features()`, and use the category as your severity/vulnerability-class label. You don't need the word2vec embeddings or LSTM code at all.

**Land at:** `ml/data/raw/vudenc/` (gitignored).

---

## 2. Juliet Test Suite (Optional — cross-language structural signal)

**What it is:** NIST's synthetic, exhaustively-labeled test suite of small "good" (safe) and "bad" (vulnerable) function pairs.

- **C/C++:** Test Suite #112, 118 different CWE categories, ~64,000 test cases
- **Java:** Test Suite #111, 112 different CWE categories, ~29,000 test cases

**Where to get it:** `samate.nist.gov/SARD/test-suites/112` (C/C++) and `/111` (Java). Public domain (CC0).

**Why optional:** there is no Python version. It's only useful because several engineered features are language-agnostic (cyclomatic complexity, nesting depth, function length, dangerous-sink patterns). If you use it, extract the same structural features from "good" vs "bad" pairs and fold them into training as additional rows.

**Land at:** `ml/data/raw/juliet_cpp/`. Skip entirely if VUDENC gives enough samples.

---

## 3. CVEfixes (Stretch — only if genuinely ahead of schedule)

**What it is:** 12,107 vulnerability-fixing commits across 4,249 open-source projects, 11,873 CVEs, 272 CWE types. Multi-language including Python.

**Where to get it:**
- Code: `github.com/secureIT-project/CVEfixes`
- Data: Zenodo, DOI `10.5281/zenodo.4476563` (compressed SQL dump — needs restoring into SQLite/Postgres)

**Why stretch:** the SQL-restore overhead is the main cost. It's useful for real CVE severity labels and real before/after fix diffs to sanity-check the LLM's diff style — but not worth it purely for training features if VUDENC already covers you.

**Land at:** `ml/data/raw/cvefixes/` if used.

---

## 4. broken-app manifest (Always available, not a training set)

Member 4's `manifest.md` (seeded bugs → file → line → expected category/severity) is your held-out real-world sanity check. Once the model is trained on VUDENC, run it against the broken app and compare to the manifest. A miss here is more informative than another percentage point on the VUDENC held-out set — this is the exact code your live demo will run against.

---

## Feature-Label Mapping (concretely)

For every code sample from whichever dataset(s) you use:

1. Run it through `extract_features()` (Semgrep/Bandit finding counts, cyclomatic complexity, dangerous-sink counts, etc.).
2. Label it using the dataset's own label:
   - **VUDENC:** map vulnerability category → severity bucket (e.g. SQLi/RCE → critical-high, XSS/open redirect → medium, path disclosure → low-medium). Document this mapping.
   - **Juliet:** "bad" function → vulnerable, "good" function → not vulnerable.
   - **CVEfixes:** use CVSS severity if present in the dump.
3. Concatenate into `ml/data/processed/features.csv`, split 80/20 train/test.

---

## Severity Bucket Mapping

Document this in `ml/data/processed/label_mapping.md` so you can defend it in Q&A:

| VUDENC Category | Mapped Severity | Rationale |
|---|---|---|
| SQL Injection | critical | OWASP A03 — direct data breach risk |
| Remote Code Execution | critical | Full system compromise |
| Command Injection | high | OS-level command execution |
| XSS | medium | Client-side — requires user interaction |
| XSRF | medium | Requires authenticated session |
| Open Redirect | low-medium | Phishing vector, not direct data access |
| Path Disclosure | low | Information leakage, not direct exploitation |

**When a judge asks:** "We mapped loosely to OWASP Top 10 impact categories and CVSS exploitability scoring — the mapping is documented in `label_mapping.md`."

---

## One Thing to Get Right

Don't skip documenting the severity-bucket mapping — if a judge asks "how did you decide SQL injection is 'critical' and path disclosure is 'medium'," having a one-line documented rationale is the difference between "defensible engineering call" and "we guessed."
