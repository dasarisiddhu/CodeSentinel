import type {
  Review,
  PRStatus,
  HealthStatus,
  LiveFeedEvent,
  Finding,
  RiskScore,
  Explanation,
} from './types';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = '/api';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`[${res.status}] ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── POST /analyze ─────────────────────────────────────────────────────────────

export interface AnalyzePayload {
  code: string;
  language: string;
  filename: string;
}

export async function postAnalyze(
  payload: AnalyzePayload,
): Promise<{ review_id: string }> {
  return apiFetch('/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── GET /review/{id} with polling ────────────────────────────────────────────

export async function pollReview(
  reviewId: string,
  onProgress?: (status: string) => void,
): Promise<Review> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const review = await apiFetch<Review>(`/review/${reviewId}`);
    if (review.status === 'done') return review;
    if (review.status === 'failed') throw new Error('Review pipeline failed on the server.');
    onProgress?.(review.status);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for review to complete (60s).');
}

// ── POST /pr/{review_id} ─────────────────────────────────────────────────────

export async function openPR(reviewId: string): Promise<PRStatus> {
  return apiFetch(`/pr/${reviewId}`, { method: 'POST' });
}

// ── GET /health ───────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch('/health');
}

// ── GET /demo/reviews ─────────────────────────────────────────────────────────
// Returns a cached demo review from the server (if available), else falls back
// to the local MOCK_REVIEW below.

export async function getDemoReview(): Promise<Review> {
  try {
    return await apiFetch<Review>('/demo/review');
  } catch {
    return MOCK_REVIEW;
  }
}

// ── Live feed polling (GET /ingest/events) ────────────────────────────────────
// Simple short-poll since SSE isn't guaranteed in all environments.

export async function fetchLiveEvents(): Promise<LiveFeedEvent[]> {
  try {
    return await apiFetch<LiveFeedEvent[]>('/ingest/events');
  } catch {
    return [];
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ── Mock data (Demo Mode fallback) ────────────────────────────────────────────
// Matches the exact API schema — used when network is unavailable or Demo
// toggle is ON. Deliberately includes one verified and one unverified fix
// so judges see both code paths.

const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f001',
    file: 'broken-app/app/config.py',
    line_start: 11,
    line_end: 11,
    rule_id: 'python.lang.security.audit.hardcoded-secret.hardcoded-secret',
    category: 'security',
    tool_severity: 'high',
    message: 'Hardcoded secret key detected. This value is committed to source control and visible to anyone with repository access.',
    code_snippet: 'SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"',
  },
  {
    id: 'f002',
    file: 'broken-app/app/config.py',
    line_start: 15,
    line_end: 15,
    rule_id: 'python.lang.security.audit.hardcoded-api-key.hardcoded-api-key',
    category: 'security',
    tool_severity: 'high',
    message: 'Hardcoded payment API key (live key prefix "pk_live_") committed directly in source. Treat as compromised.',
    code_snippet: 'PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"',
  },
  {
    id: 'f003',
    file: 'broken-app/app/routes/auth.py',
    line_start: 42,
    line_end: 42,
    rule_id: 'python.lang.security.sql-injection.raw-sql',
    category: 'bug',
    tool_severity: 'high',
    message: 'User input concatenated directly into SQL query string. This is a textbook SQL injection sink.',
    code_snippet: 'query = f"SELECT * FROM users WHERE username = \'{username}\'"',
  },
  {
    id: 'f004',
    file: 'broken-app/app/routes/items.py',
    line_start: 87,
    line_end: 112,
    rule_id: 'radon.complexity.C',
    category: 'code_smell',
    tool_severity: 'medium',
    message: 'Function `process_item_batch` has cyclomatic complexity of 18 (threshold: 10). High complexity correlates with defect density.',
    code_snippet: 'def process_item_batch(items, filters, user, db, cache):\n    ...',
  },
];

const MOCK_RISK_SCORES: RiskScore[] = [
  {
    finding_id: 'f001',
    risk_probability: 0.97,
    predicted_severity: 'critical',
    top_contributing_features: [
      { feature: 'hardcoded_secret_regex_match', weight: 0.62 },
      { feature: 'semgrep_security_count', weight: 0.21 },
      { feature: 'import_risk_list_membership', weight: 0.09 },
    ],
  },
  {
    finding_id: 'f002',
    risk_probability: 0.95,
    predicted_severity: 'critical',
    top_contributing_features: [
      { feature: 'hardcoded_secret_regex_match', weight: 0.58 },
      { feature: 'live_key_prefix_detected', weight: 0.28 },
      { feature: 'semgrep_security_count', weight: 0.09 },
    ],
  },
  {
    finding_id: 'f003',
    risk_probability: 0.91,
    predicted_severity: 'critical',
    top_contributing_features: [
      { feature: 'dangerous_sink_calls', weight: 0.51 },
      { feature: 'has_input_validation', weight: 0.31 },
      { feature: 'semgrep_security_count', weight: 0.11 },
    ],
  },
  {
    finding_id: 'f004',
    risk_probability: 0.54,
    predicted_severity: 'medium',
    top_contributing_features: [
      { feature: 'cyclomatic_complexity', weight: 0.48 },
      { feature: 'function_length', weight: 0.29 },
      { feature: 'nesting_depth', weight: 0.15 },
    ],
  },
];

const MOCK_EXPLANATIONS: Explanation[] = [
  {
    finding_id: 'f001',
    plain_english_explanation:
      'A secret key used to sign authentication tokens is written directly in the source file. Anyone with read access to the repository — including any future attacker who gains access — can immediately impersonate any user or bypass authentication entirely.',
    severity_rationale:
      'Hardcoded secrets are rated Critical because the attack is trivially executed with zero exploit complexity once the key is known.',
    fix_suggestion:
      'Remove the hardcoded value and read from an environment variable. Use python-dotenv in development to keep the variable out of source control.',
    fix_diff:
      `--- a/broken-app/app/config.py
+++ b/broken-app/app/config.py
@@ -8,5 +8,5 @@
 import os
 
-SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"
+SECRET_KEY = os.getenv("SECRET_KEY")
+if not SECRET_KEY:
+    raise RuntimeError("SECRET_KEY environment variable is not set.")`,
    confidence: 0.95,
    verified: true,
  },
  {
    finding_id: 'f002',
    plain_english_explanation:
      'A live payment API key is committed directly in source code. The "pk_live_" prefix confirms this is a production credential, not a test key. If this repository is or ever becomes public, or if any collaborator is compromised, this key must be revoked immediately.',
    severity_rationale:
      'Live payment credentials in source code are Critical. Financial exposure is direct and immediate.',
    fix_suggestion:
      'Revoke this key in your payment provider dashboard right now, regardless of other remediation steps. Then replace with an environment variable.',
    fix_diff:
      `--- a/broken-app/app/config.py
+++ b/broken-app/app/config.py
@@ -13,3 +13,4 @@
-PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"
+PAYMENT_API_KEY = os.getenv("PAYMENT_API_KEY")
+if not PAYMENT_API_KEY:
+    raise RuntimeError("PAYMENT_API_KEY environment variable is not set.")`,
    confidence: 0.93,
    verified: true,
  },
  {
    finding_id: 'f003',
    plain_english_explanation:
      'User-supplied input is pasted directly into a SQL query string using an f-string. An attacker can craft a username like `\' OR \'1\'=\'1` to bypass authentication, or use UNION SELECT to exfiltrate arbitrary data from the database.',
    severity_rationale:
      'SQL injection allows complete database compromise. OWASP ranks it #1 in the Top 10 web vulnerabilities.',
    fix_suggestion:
      'Use parameterized queries (prepared statements). Never concatenate user input into SQL strings.',
    fix_diff:
      `--- a/broken-app/app/routes/auth.py
+++ b/broken-app/app/routes/auth.py
@@ -40,4 +40,4 @@
-    query = f"SELECT * FROM users WHERE username = '{username}'"
-    result = db.execute(query)
+    result = db.execute(
+        "SELECT * FROM users WHERE username = ?", (username,)
+    )`,
    confidence: 0.88,
    verified: false,
  },
  {
    finding_id: 'f004',
    plain_english_explanation:
      'This function has 18 branching paths through it, nearly double the recommended limit of 10. Functions this complex are statistically more likely to contain bugs, are harder to test exhaustively, and are significantly harder for reviewers to reason about.',
    severity_rationale:
      'High complexity is a code quality signal, not an immediate exploit — hence Medium priority. But it correlates strongly with where future bugs will be introduced.',
    fix_suggestion:
      'Extract filter logic and batch-processing logic into smaller, single-responsibility helpers. Aim for no function exceeding complexity 10.',
    fix_diff:
      `--- a/broken-app/app/routes/items.py
+++ b/broken-app/app/routes/items.py
@@ -85,28 +85,12 @@
-def process_item_batch(items, filters, user, db, cache):
-    # ... 26 lines of nested logic ...
+def _apply_filters(items, filters):
+    \"\"\"Apply filter criteria to item list.\"\"\"
+    return [i for i in items if _matches_filters(i, filters)]
+
+def _matches_filters(item, filters):
+    # single-responsibility filter check
+    ...
+
+def process_item_batch(items, filters, user, db, cache):
+    filtered = _apply_filters(items, filters)
+    return _persist_batch(filtered, user, db, cache)`,
    confidence: 0.72,
    verified: false,
  },
];

export const MOCK_REVIEW: Review = {
  review_id: 'demo-review-001',
  status: 'done',
  findings: MOCK_FINDINGS,
  risk_scores: MOCK_RISK_SCORES,
  explanations: MOCK_EXPLANATIONS,
  overall_risk: 0.84,
  created_at: new Date().toISOString(),
};

export const MOCK_LIVE_EVENT: LiveFeedEvent = {
  filename: 'broken-app/app/config.py',
  source: 'watcher',
  timestamp: new Date().toISOString(),
  review_id: 'demo-review-001',
};
