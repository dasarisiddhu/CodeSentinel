// ── Finding (Detection Agent output) ─────────────────────────────────────────

export type Category = 'bug' | 'security' | 'code_smell';
export type ToolSeverity = 'high' | 'medium' | 'low';
export type PredictedSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  file: string;
  line_start: number;
  line_end: number;
  rule_id: string;
  category: Category;
  tool_severity: ToolSeverity;
  message: string;
  code_snippet: string;
}

// ── RiskScore (ML Agent output) ───────────────────────────────────────────────

export interface FeatureWeight {
  feature: string;
  weight: number;
}

export interface RiskScore {
  finding_id: string;
  risk_probability: number;           // 0.0 – 1.0
  predicted_severity: PredictedSeverity;
  top_contributing_features: FeatureWeight[];
}

// ── Explanation (LLM Agent output) ───────────────────────────────────────────

export interface Explanation {
  finding_id: string;
  plain_english_explanation: string;
  severity_rationale: string;
  fix_suggestion: string;
  fix_diff: string;                   // unified diff string
  confidence: number;                 // 0.0 – 1.0
  verified: boolean;                  // did patch --dry-run pass?
}

// ── Review (assembled by Orchestrator) ───────────────────────────────────────

export type ReviewStatus = 'pending' | 'done' | 'failed';

export interface Review {
  review_id: string;
  status: ReviewStatus;
  findings: Finding[];
  risk_scores: RiskScore[];
  explanations: Explanation[];
  overall_risk: number;               // aggregate 0–1
  created_at: string;                 // ISO timestamp
}

// ── PR Status ─────────────────────────────────────────────────────────────────

export interface PRStatus {
  pr_number: number | null;
  pr_url: string | null;
  branch: string;
  mocked: boolean;
}

// ── Live Feed Event ───────────────────────────────────────────────────────────

export interface LiveFeedEvent {
  filename: string;
  source: 'watcher' | 'github';
  timestamp: string;                  // ISO timestamp
  review_id?: string;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  groq_reachable: boolean;
  model_loaded: boolean;
}

// ── Composite card data (joined for rendering) ────────────────────────────────

export interface FindingWithContext {
  finding: Finding;
  risk?: RiskScore;
  explanation?: Explanation;
}
