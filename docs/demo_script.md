# Demo Script — CodeSentinel
**3-minute pitch | Rehearse twice as a full team before the event**

---

## Beat 1 — Hook (0:00–0:30)

**Who speaks:** Anyone (rotate for rehearsal, agree on day-of)

> "Every developer reviews code. Most teams use static analyzers — but static analyzers flag
> hundreds of warnings with no explanation of *why* they matter. LLMs can explain code, but
> they hallucinate vulnerabilities that aren't there. We built CodeSentinel to solve both
> problems at once."

*[Point to architecture slide]*

> "Three agents, three responsibilities. The deterministic scanner finds it. The trained risk
> model — trained on real vulnerability data — prioritizes it. The LLM only explains and fixes
> what the first two already confirmed exists. No hallucinated vulnerabilities."

---

## Beat 2 — Live ingestion (0:30–1:00)

**Who acts:** Member 4 (broken app machine)

*[Member 4 opens `broken-app/app/routes/items.py` and saves a change — or adds an f-string SQL line]*

> "This is our deliberately vulnerable expense-tracker app. I just saved a file. Watch the
> right side of the screen."

*[Frontend LiveFeedIndicator lights up — "Code received from BrokenApp at HH:MM:SS"]*

> "The file-watcher shipped that straight to our backend. No copy-paste, no manual submission."

*[Wait 2–4 seconds for findings to appear]*

---

## Beat 3 — Results walk-through (1:00–2:00)

**Who speaks:** Member 3 (frontend machine)

*[Point to FindingsList — highlight one high/critical finding]*

> "Semgrep flagged this as a SQL injection on line 47. Our risk model — trained on 1,000+
> real GitHub vulnerability commits — scored it as **critical**, with a 94% risk probability.
> The top driver: direct string formatting inside a `.execute()` call."

*[Click into FindingCard — show RiskGauge and feature importances]*

> "Here's the LLM's explanation — plain English, no jargon. And here's the fix diff."

*[Show the diff viewer — diff is marked "✓ Verified"]*

> "That diff was verified: we ran it through a dry-run patch check before showing it.
> If it doesn't apply cleanly, we label it 'unverified — review manually' instead of
> pretending it's ground truth."

---

## Beat 4 — PR (2:00–2:20)

**Who acts:** Member 3 (or Member 2 on the backend machine)

*[Click "Open PR" button]*

> "One click opens a GitHub PR with the fix applied to the actual file on a new branch —
> not a separate patch file, a real git-native diff against the original."

*[Show PRStatusCard — real PR URL or mock badge]*

---

## Beat 5 — Close (2:20–3:00)

**Who speaks:** Any member

> "What makes this different: we didn't prompt an LLM to find bugs. We let deterministic
> tools do what they're good at, a trained model prioritize what matters, and the LLM only
> speak to what's already confirmed. The result is a demo you can poke adversarially — try
> submitting clean code. It says 'no issues found.'"

*[Demo: paste a clean function — show "No issues found" state]*

> "Our model's macro F1 is [N]. Our pipeline has processed [N] real seeded bugs from the
> broken app with zero false-positive hallucinated findings. Thank you."

---

## Q&A Prep (memorize these before the event)

| Question | Answer |
|---|---|
| What dataset? | VUDENC — 1,009 real vulnerability-fixing commits from GitHub Python repos |
| How many samples? | ~[N] after filtering to SQL injection and command injection categories |
| What's your F1? | Macro F1: [fill in from metrics.json] |
| What if the model is wrong? | It's a secondary signal — it never creates a finding Semgrep/Bandit didn't already flag. A wrong risk score degrades priority, never fabricates a vulnerability. |
| What if the LLM API goes down? | We have a 3-tier fallback: primary model → smaller model → deterministic mock. And 3 pre-cached runs serve from memory if all live calls fail. |
| Did you use pre-built code? | [Answer honestly per what you confirmed with organizers in Section 0 of the PRD] |

---

## Fallback order

1. **Live demo works** — do it live.
2. **API is flaky** — switch DemoModeToggle on, serve from cached runs.
3. **Frontend crashes** — Member 2 curls the backend from terminal and narrates the JSON.
4. **Backend is down** — play `pitch/demo_recording/` screen recording.
