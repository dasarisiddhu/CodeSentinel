# API Contract — CodeSentinel
**Frozen at T+0:20. No field name changes without team announcement.**

Base URL: `http://localhost:8000`

This file is the single source of truth for all request/response schemas.
Frontend (`frontend/lib/types.ts`, `frontend/lib/api.ts`), backend (`backend/app/api/`), and ML (`ml/src/risk_model.py`) all build against this contract.

---

## Endpoints

### `POST /analyze`
Submit source code for full pipeline analysis. Returns a review ID immediately (async processing, HTTP 202 Accepted).

**Request Body:**
```json
{
  "code": "import subprocess\nsubprocess.call(['rm', '-rf', '/'], shell=True)",
  "language": "python",
  "filename": "vuln.py"
}
```

**Response `202 Accepted`:**
```json
{
  "review_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### `GET /review/{review_id}`
Poll for the completed review result. Status transitions: `pending` → `done` | `failed`.

**Response `200 OK`:**
```json
{
  "review_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "done",
  "filename": "vuln.py",
  "language": "python",
  "submitted_at": "2026-09-17T05:53:00Z",
  "completed_at": "2026-09-17T05:53:12Z",
  "error": null,
  "findings": [
    {
      "id": "f-550e8400-1",
      "file": "vuln.py",
      "line_start": 2,
      "line_end": 2,
      "rule_id": "python.lang.security.audit.subprocess-shell-true",
      "category": "security",
      "tool_severity": "high",
      "message": "subprocess with shell=True is a shell injection risk",
      "code_snippet": "subprocess.call(['rm', '-rf', '/'], shell=True)"
    }
  ],
  "risk_scores": [
    {
      "finding_id": "f-550e8400-1",
      "risk_probability": 0.92,
      "predicted_severity": "critical",
      "top_contributing_features": [
        { "feature": "tool_severity", "weight": 0.55 },
        { "feature": "category_security", "weight": 0.25 },
        { "feature": "dangerous_sink_count", "weight": 0.20 }
      ]
    }
  ],
  "explanations": [
    {
      "finding_id": "f-550e8400-1",
      "plain_english_explanation": "This code passes shell=True to subprocess, allowing arbitrary command execution.",
      "severity_rationale": "Execution with shell=True creates remote code execution vectors if untrusted input reaches the call.",
      "fix_suggestion": "Use a list of arguments without shell=True.",
      "fix_diff": "--- vuln.py\n+++ vuln.py\n@@ -1,2 +1,2 @@\n import subprocess\n-subprocess.call(['rm', '-rf', '/'], shell=True)\n+subprocess.call(['ls', '-la'])",
      "confidence": 0.91,
      "verified": true,
      "verified_error": null,
      "is_mock": false
    }
  ],
  "pr_status": null
}
```

**Response `404 Not Found`:** if `review_id` is unknown.
```json
{
  "detail": "Review 'xyz' not found"
}
```

---

### `POST /ingest/webhook`
Called by the file-watcher (Member 4) or GitHub CI webhook when a file is saved or pushed.

**Request Body:**
```json
{
  "filename": "app/routes/user.py",
  "code": "<file contents>",
  "source": "watcher"
}
```

**Response `202 Accepted`:**
```json
{
  "review_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### `POST /pr/{review_id}`
Open a GitHub PR with the verified fix diffs.

**Response `200 OK`:**
```json
{
  "pr_number": 42,
  "pr_url": "https://github.com/owner/repo/pull/42",
  "branch": "codesentinel/fix-550e8400",
  "mocked": false
}
```
*Note:* When GitHub is not configured, the endpoint returns `mocked: true` and a mock branch/URL.

---

### `GET /demo/{n}`
Return cached reviews from in-memory LRU without making network calls. Used by frontend DemoModeToggle.

**Response `200 OK`:**
```json
{
  "reviews": [ /* array of ReviewResponse */ ],
  "total": 3
}
```

---

### `GET /health`
System diagnostics and service connectivity.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "groq_reachable": true,
  "model_loaded": true,
  "database_ok": true
}
```

---

## Shared Schemas (Canonical Definitions)

### Finding
```json
{
  "id": "string (UUID)",
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

### RiskScore
```json
{
  "finding_id": "string (UUID — matches Finding.id)",
  "risk_probability": 0.0,
  "predicted_severity": "critical | high | medium | low",
  "top_contributing_features": [
    {"feature": "string", "weight": 0.0}
  ]
}
```

### Explanation
```json
{
  "finding_id": "string (UUID — matches Finding.id)",
  "plain_english_explanation": "string",
  "severity_rationale": "string",
  "fix_suggestion": "string",
  "fix_diff": "string (unified diff, or empty string if none)",
  "confidence": 0.0,
  "verified": true,
  "verified_error": null,
  "is_mock": false
}
```

---

## Error Shapes
All errors return standard FastAPI detail format:
```json
{ "detail": "Review 'xyz' not found" }
```
Status codes: `404` (not found), `409` (review not done yet), `400` (bad request), `422` (validation).
