# API Contract — CodeSentinel
**Frozen at T+0:20. No field name changes after this without notifying all team members.**

This file is the single source of truth for all request/response schemas.
Frontend (`frontend/lib/types.ts`, `frontend/lib/api.ts`) and ML (`ml/src/risk_model.py`)
both build against this contract.

---

## Endpoints

### `POST /analyze`
Submit code for review. Returns a review ID immediately (async processing).

**Request body:**
```json
{
  "code": "string",
  "language": "python",
  "filename": "string"
}
```

**Response `202 Accepted`:**
```json
{
  "review_id": "string"
}
```

---

### `GET /review/{review_id}`
Poll for the completed review result.

**Response `200 OK`:**
```json
{
  "review_id": "string",
  "status": "pending | done | failed",
  "filename": "string",
  "language": "string",
  "submitted_at": "ISO-8601 datetime",
  "findings": [
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
  ],
  "risk_scores": [
    {
      "finding_id": "string",
      "risk_probability": 0.0,
      "predicted_severity": "critical | high | medium | low",
      "top_contributing_features": [
        {"feature": "string", "weight": 0.0}
      ]
    }
  ],
  "explanations": [
    {
      "finding_id": "string",
      "plain_english_explanation": "string",
      "severity_rationale": "string",
      "fix_suggestion": "string",
      "fix_diff": "string (unified diff)",
      "confidence": 0.0,
      "verified": true
    }
  ],
  "pr_status": null
}
```

**Response `404`** if review_id not found.

---

### `POST /ingest/webhook`
For the broken-app file-watcher / GitHub webhook to POST code automatically.

**Request body:**
```json
{
  "filename": "string",
  "code": "string",
  "source": "watcher | github"
}
```

**Response `202 Accepted`:**
```json
{
  "review_id": "string"
}
```

---

### `POST /pr/{review_id}`
Open a GitHub PR with the verified fix diffs.

**Response `200 OK`:**
```json
{
  "pr_number": 0,
  "pr_url": "string",
  "branch": "string",
  "mocked": true
}
```

---

### `GET /demo/{n}`
Return the nth cached demo review (0-indexed). Used by the frontend DemoModeToggle.

**Response `200 OK`:** same shape as `GET /review/{review_id}` with `status: "done"`.

---

### `GET /health`
**Response `200 OK`:**
```json
{
  "status": "ok",
  "groq_reachable": true,
  "model_loaded": true,
  "db_ok": true
}
```

---

## Shared Schemas (canonical definitions)

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
  "verified": true
}
```
