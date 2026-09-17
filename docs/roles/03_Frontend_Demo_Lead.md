# Team Member 3 — Frontend & Demo Lead
**CodeSentinel | Owns: Next.js frontend, all UI components, demo flow**

Read `docs/PRD.md` Sections 7 and 9 first. Your primary constraint: the demo must tell
a clear visual story in under 90 seconds.

---

## Your job

Build a Next.js + Tailwind frontend that:
1. Accepts code via paste box OR auto-populates from the live file-watcher feed
2. Shows findings, risk scores, explanations, and verified fix diffs
3. Has a DemoMode toggle that instantly loads cached runs (no live call)
4. Shows a live feed indicator when code arrives from the broken app

## Files you own

```
frontend/
├── app/
│   ├── page.tsx                    <- Single-page: CodeInput -> Results
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── CodeInput.tsx               <- Code textarea + Submit button
│   ├── FindingsList.tsx            <- Sortable list of findings
│   ├── FindingCard.tsx             <- Severity chip + explanation + diff viewer
│   ├── RiskGauge.tsx               <- Visual risk probability gauge per finding
│   ├── FeatureImportanceChart.tsx  <- Bar chart from ml/models/feature_importance.json
│   ├── PRStatusCard.tsx            <- PR link (real or mock badge)
│   ├── LiveFeedIndicator.tsx       <- "Code received from BrokenApp at HH:MM:SS"
│   ├── DemoModeToggle.tsx          <- Swap live fetch for GET /demo/{n}
│   └── StatusStates.tsx            <- Loading, error, empty states
├── lib/
│   ├── api.ts                      <- fetch wrappers matching docs/api_contract.md
│   └── types.ts                    <- TypeScript types mirroring backend schemas
```

## Key design principles

- **Poll `GET /review/{id}` every 2s** after submitting until status is "done" or "failed"
- **FindingCard** must show: severity chip + tool_severity + predicted_severity + explanation + diff
- **Mark unverified diffs** clearly — badge "⚠ Unverified — review manually"
- **DemoModeToggle** calls `GET /demo/{n}` — no polling, instant render
- **FeatureImportanceChart** fetches from `/demo/feature-importance` (backed by `feature_importance.json`)

## Types (must match api_contract.md exactly)

```typescript
interface Finding { id, file, line_start, line_end, rule_id, category, tool_severity, message, code_snippet }
interface RiskScore { finding_id, risk_probability, predicted_severity, top_contributing_features }
interface Explanation { finding_id, plain_english_explanation, severity_rationale, fix_suggestion, fix_diff, confidence, verified }
interface Review { review_id, status, filename, language, submitted_at, findings, risk_scores, explanations, pr_status }
```
