# PRD — CodeSentinel
**AI Code Review & Vulnerability Detection Agent — HackForge × Microsoft, PS1**
Team: 4 people | Coding window: 5–6 hours | Round: 105 → 12

---

## 0. Read this before anything else (mentor's note)

You asked for three things layered on top of each other: a full PRD with real ML training and datasets, a multi-agent architecture, and a 4-way team split. Each of those is reasonable alone. Stacked together against a **5–6 hour live coding window**, they aren't free — here's exactly what pays for what, so nobody on the team over-builds and blows the clock.

**What makes this actually fit in 5–6 hours:**
- The "hard core ML" is a **feature-engineered gradient-boosted classifier** (XGBoost/LightGBM on ~20 hand-built features), not a fine-tuned code model. This trains in **2–5 minutes on a laptop CPU** on a few thousand labeled samples.
- **Detection stays deterministic.** Semgrep/Bandit find the bugs. The ML model only adds a risk/priority score on top of what the deterministic tools already found.
- **Dataset download, not dataset code, happens ahead of time.**

---

## 1. Problem & Fit to PS1

**Problem statement:** Developers spend significant time reviewing source code for bugs, security vulnerabilities, and maintainability issues. Build an AI-powered code review assistant that analyzes source code and identifies potential problems.

| Requirement | Owned by |
|---|---|
| Source code input | Frontend + Backend ingestion endpoint |
| Bug detection | Detection Agent (Semgrep/Bandit) |
| Security issue detection | Detection Agent (Semgrep security rulesets) |
| Code smell detection | Detection Agent (Semgrep + Radon complexity rules) |
| Severity classification | Detection Agent (tool-native) cross-checked by ML Risk-Scoring Agent |
| Explanation of detected issues | LLM Explanation Agent |
| Suggested improvements | LLM Fix Agent (diff), verified before display |

**The wedge:**
> "Static analyzers find real bugs but can't explain them well. LLMs explain well but hallucinate vulnerabilities that aren't there. We split the job three ways: a deterministic scanner finds it, a trained risk model prioritizes it against real vulnerability data, and the LLM only explains and drafts a fix for what the first two already confirmed exists."

---

## 2. System Architecture

```
Source Input (Frontend paste / Webhook / File watcher)
    |
    v
Orchestrator Agent
    |
    v
Detection Agent (Semgrep + Bandit — deterministic)
    |
    v
ML Risk-Scoring Agent (engineered features + trained classifier)
    |
    v
LLM Explanation & Fix Agent (Groq/OpenAI, JSON-schema constrained)
    |
    v
Verification Pass (diff-applies check, schema validation)
    |
    +---> Review Result --> PR / Delivery Agent
    |                   --> Frontend Results View
    |
    +-- fails verification --> Flag as "unverified — needs manual review"
```

---

## 3. Component Specs

### 3.1 Detection Agent (deterministic — zero hallucination risk)
- **Tools:** Semgrep + Bandit + Radon
- **Input:** raw source file(s) + language tag
- **Output — `Finding` schema:**
```json
{
  "id": "string",
  "file": "string",
  "line_start": 0,
  "line_end": 0,
  "rule_id": "string",
  "category": "bug | security | code_smell",
  "tool_severity": "high | medium | low",
  "message": "string",
  "code_snippet": "string"
}
```
- **Hard rule:** this agent never uses an LLM. If Semgrep/Bandit find nothing, return "no issues found."

### 3.2 ML Risk-Scoring Agent (Team Member 1)
- **Model:** XGBoost or LightGBM
- **Output — `RiskScore` schema:**
```json
{
  "finding_id": "string",
  "risk_probability": 0.0,
  "predicted_severity": "critical | high | medium | low",
  "top_contributing_features": [{"feature": "string", "weight": 0.0}]
}
```

### 3.3 LLM Explanation & Fix Agent (Team Member 2)
- **Output — `Explanation` schema:**
```json
{
  "finding_id": "string",
  "plain_english_explanation": "string",
  "severity_rationale": "string",
  "fix_suggestion": "string",
  "fix_diff": "unified diff string",
  "confidence": 0.0
}
```

### 3.4 Orchestrator Agent (Team Member 2)
Sequences 3.1 → 3.2 → 3.3 → verification. Owns timeouts/retries and demo-fallback cache.

### 3.5 PR / Delivery Agent (Team Member 2, stretch)
Applies fix diff to actual flagged file on a new branch and opens a PR.

### 3.6 Ingestion Channel (Team Member 4)
- **Local file-watcher (primary):** watches for file saves, POSTs to `/analyze`.
- **GitHub webhook (stretch):** push-triggered.

---

## 4. Data Flow

1. Code arrives → content hash computed for caching.
2. Detection Agent: Semgrep + Bandit + Radon → `Finding[]`.
3. If `Finding[]` is empty → short-circuit, return "no issues found."
4. ML Risk-Scoring Agent → `RiskScore[]`.
5. LLM Explanation Agent → `Explanation[]`.
6. Verification pass → marks verified/unverified.
7. Orchestrator assembles `Review`.
8. Frontend renders. PR Agent opens branch+PR if configured.
9. Cache `Review` by content hash.

---

## 5. Datasets

| Dataset | Language | Priority |
|---|---|---|
| VUDENC | Python (native) | **Primary** |
| Juliet Test Suite (NIST SARD) | C/C++, Java | Optional |
| CVEfixes | Multi-language | Stretch |

See `docs/datasets.md` for full details.

---

## 6. Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python, async) |
| Detection | Semgrep, Bandit, Radon (subprocess-wrapped) |
| ML | XGBoost/LightGBM + scikit-learn |
| LLM | Groq (Llama 3.3 70B → 3.1 8B fallback → mock) |
| DB | SQLite via SQLAlchemy |
| Frontend | Next.js/React + Tailwind + Recharts |
| PR delivery | GitHub REST API |
| Diff verification | `unidiff` / `patch --dry-run` |

---

## 7. API Contract

```
POST /analyze
  body: { "code": "string", "language": "python", "filename": "string" }
  -> 202 { "review_id": "string" }

GET /review/{review_id}
  -> 200 { findings: Finding[], risk_scores: RiskScore[], explanations: Explanation[], status: "pending|done|failed" }

POST /ingest/webhook
  body: { "filename": "string", "code": "string", "source": "watcher|github" }
  -> 202 { "review_id": "string" }

POST /pr/{review_id}
  -> 200 { pr_number, pr_url, branch, mocked: bool }

GET /health
  -> 200 { status: "ok", groq_reachable: bool, model_loaded: bool }
```

**Lock this contract at T+0:20.**

---

## 8. Non-Functional Requirements

- Every external call has an explicit timeout and fallback.
- 2–3 pre-run reviews cached as demo fallback by hour 4–5.
- Structured logging on every stage transition.
- No secrets hardcoded — all via environment variables.

---

## 9. Timeline

- **T+0:20** — API contract + JSON schemas frozen.
- **T+3:00** — Hard triage. Cut per Section 10 if behind.
- **T+4:30** — Feature freeze.
- **T+5:30–6:00** — Full dry run + cached fallback tested.

**Cut order if behind at T+3:00:**
1. GitHub webhook → file-watcher only.
2. Multi-dataset → VUDENC-only model.
3. Multi-language → Python only.
4. PR diff on real file → new fix file approach.
5. Feature-importance chart on frontend → terminal/notebook only.

**Never cut:** deterministic detection, verification pass, cached demo fallback.

---

## 10. Definition of Done

- [ ] Paste a real vulnerable file → get categorized findings with tool-native severity
- [ ] Risk model score shown alongside tool severity with feature-importance value
- [ ] At least one finding has LLM explanation + verified diff
- [ ] Broken app's file-watcher pushes a real edit live, no manual paste
- [ ] PR (real or mock) opens with the fix
- [ ] 2–3 cached fallback runs ready
- [ ] Team can state precision/recall out loud without checking notes
- [ ] Pitch under 3 minutes, rehearsed at least twice

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Rules forbid pre-built logic reuse | Confirm with organizers; treat LogSentinel as blueprint |
| LLM API rate-limits mid-demo | Fallback chain + cached demo runs |
| Model underperforms | Secondary signal only — never fabricates vulnerabilities |
| Judge submits adversarial code | Verification pass + "no issues found" short-circuit both hold |
