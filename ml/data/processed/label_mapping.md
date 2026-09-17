# Severity Label Mapping
**Owner: Team Member 1 | This is your "defensible engineering call" document for judge Q&A.**

When a judge asks "how did you decide SQL injection is 'critical' and path disclosure is 'medium'?"
— point them here.

---

## Mapping: VUDENC category → Severity bucket

Mapped loosely to **OWASP Top 10 (2021)** impact categories and **CVSS v3.1 exploitability** scores.

| VUDENC Category | Mapped Severity | OWASP Reference | Rationale |
|---|---|---|---|
| SQL Injection | `critical` | A03:2021 — Injection | Direct database breach, full data exfiltration, possible RCE via stacked queries |
| Remote Code Execution | `critical` | A03:2021 — Injection | Full system compromise, highest impact of any vulnerability class |
| Command Injection | `high` | A03:2021 — Injection | OS-level command execution; severity depends on privilege level of the process |
| XSS (Cross-Site Scripting) | `medium` | A03:2021 — Injection | Client-side attack requiring user interaction; scope limited to browser session |
| XSRF (Cross-Site Request Forgery) | `medium` | A01:2021 — Broken Access Control | Requires authenticated session; impact depends on the action being forged |
| Open Redirect | `low` | A01:2021 — Broken Access Control | Phishing vector, not direct data access or code execution |
| Path Disclosure | `low` | A05:2021 — Security Misconfiguration | Information leakage; useful to an attacker as reconnaissance, not direct exploitation |

---

## Mapping: Juliet Test Suite (C/C++, if used)

Juliet provides binary labels: **"bad"** (vulnerable) → **"high"** and **"good"** (safe) → **"low"**.
The CWE category is not mapped to a severity bucket when using Juliet — only the binary label is used.
This is acceptable because Juliet is used only to pad structural-feature training samples,
not as a severity-label source.

---

## How this was used in training

Each row in `ml/data/processed/features.csv` has a `label` column with values from:
`critical`, `high`, `medium`, `low`

This label was assigned as follows:
1. VUDENC samples: using the mapping above.
2. Juliet samples (if included): binary `high` / `low` per the "bad"/"good" label.
3. Internally generated fixture samples (`backend/app/tests/fixtures/`): manually labeled
   using the same mapping as VUDENC.
