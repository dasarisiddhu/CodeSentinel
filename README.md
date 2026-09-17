# 🛡️ CodeSentinel

**AI-Powered Code Review & Automated Vulnerability Detection Agent**  
*HackForge × Microsoft, Problem Statement 1 (PS1)*  
**Stack:** FastAPI · XGBoost / LightGBM · Groq LLM · Next.js 14 · TypeScript · Tailwind CSS / Vanilla CSS

---

## ⚡ Executive Summary & Problem Statement

> **The Dilemma:**  
> Static application security testing (SAST) tools (Semgrep, Bandit) identify deterministic vulnerabilities but flood engineers with noisy false-positives and cryptic warnings without remediation context. Conversely, pure generative LLMs write plausible explanations but frequently hallucinate non-existent vulnerabilities and generate invalid syntax or unverified patches.

**CodeSentinel resolves this with a tri-agent architecture and patch-verification engine:**
1. **Deterministic Scanner Agent** detects verified syntax and AST flaws (zero hallucination).
2. **ML Risk-Scoring Agent** evaluates 20 hand-crafted code & complexity features with an XGBoost classifier to compute empirical risk probabilities.
3. **LLM Explainer Agent** (Groq) synthesizes plain-English root causes, rationale, and diff patches.
4. **Deterministic Patch Verifier** tests the generated diffs in-memory and in dry-run mode against original code to certify fixes as **Verified** or **Unverified**.

```mermaid
flowchart LR
    A[Source Code / Git PR] --> B[Deterministic Scanner\nSemgrep + Bandit + Radon]
    B -->|Flagged AST & Lines| C[ML Risk Scorer\nXGBoost Classifier\n20 Features]
    C -->|Empirical Risk Score| D[LLM Explainer\nGroq LLaMA 3.3]
    D -->|Unified Fix Diff| E[Diff Verification Service\nPatch Simulation]
    E -->|Verified Review| F[Lab Notebook Dashboard\nNext.js Split-Pane UI]
    F -->|1-Click| G[GitHub Pull Request]
    F -->|Alert| H[Owner Notification]
```

---

## 🌟 Unique Selling Points & Key Innovations

| Feature | CodeSentinel | Traditional SAST | Generic AI Reviewers |
| :--- | :---: | :---: | :---: |
| **Ground Truth Detection** | ✅ Deterministic (Semgrep/Bandit) | ✅ Deterministic | ❌ Hallucinates fake bugs |
| **Risk Scoring** | ✅ Trained ML (XGBoost 20 features) | ⚠️ Static Rule Severities | ❌ Subjective LLM guess |
| **Remediation Code** | ✅ Full Unified Diffs | ❌ None or vague advice | ⚠️ Unverified diffs |
| **Diff Verification** | ✅ Syntactic Patch Simulation | ❌ None | ❌ None (often broken diffs) |
| **Offline Pitch Fallback** | ✅ Built-in cached demo engine | ❌ N/A | ❌ Fails on network drop |
| **UI Aesthetic** | ✅ Scientific "Lab Notebook / Audit" | ❌ Cluttered tables | ⚠️ Generic SaaS cards |

### 🔬 Core Capabilities
- **Strict Grounding:** An LLM is never allowed to invent a vulnerability. It only explains findings verified by scanner tools or verified AST patterns.
- **Trained Risk Model:** 20 features extracted from code complexity (cyclomatic, Halstead SLOC, nesting depth, dangerous sinks, secret key regexes) predict real-world exploitability.
- **Diff Verification Engine (`verification_service.py`):** Automatically tests LLM patches using `unidiff` and `patch --dry-run`. If an LLM hallucinated an offset or broken syntax, it is transparently tagged: `Unverified — review manually`.
- **"Lab Notebook" Visual Experience:** Designed specifically for security auditors and engineers. Features high-density split-pane layouts, pure severity accent tokens (`critical`, `high`, `medium`, `low`), and instant interactive patch inspectability.
- **Automated PR & Alerts:** One-click GitHub PR creation (`POST /pr/{id}`) and instant email/webhook notification dispatch to repository owners (`POST /notify/{review_id}`).

---

## 📁 Repository Structure

```
CodeSentinel/
├── backend/                    # FastAPI orchestration layer
│   ├── app/
│   │   ├── agents/             # Detection agent & ML inference agent
│   │   ├── api/                # Endpoints: /analyze, /review, /notify, /demo, /pr, /health
│   │   ├── core/               # Database, config, logging
│   │   ├── schemas/            # Pydantic schemas (Finding, RiskScore, Explanation, Review)
│   │   └── services/           # Orchestrator, LLM service, diff verification service
│   └── requirements.txt
├── ml/                         # Machine learning training & feature pipeline
│   ├── data/                   # Processed vulnerability datasets
│   ├── models/                 # risk_model.json, feature_importance.json, model_meta.json
│   └── src/
│       ├── detection/          # Semgrep, Bandit, Radon wrappers + normalizer
│       ├── features/           # 20-feature AST & metric extraction
│       └── train.py            # XGBoost training pipeline
├── frontend/                   # Next.js 14 App Router UI
│   ├── app/                    # page.tsx (split-pane audit layout), globals.css
│   ├── components/             # Status states, code input, risk gauge, finding cards
│   └── lib/                    # API client, types, mock demo review
├── broken-app/                 # Vulnerable sample app for live demo & file-watcher
├── docs/                       # PRD, API contract, team roles, datasets guide
└── README.md
```

---

## 🚀 Localhost Execution Guide

### Prerequisites
- **Python:** 3.11 or 3.12 (`python --version`)
- **Node.js:** 18.x or 20.x (`node --version`)
- **Package Managers:** `pip` and `npm`

---

### Step 1: Clone & Configure Environment

```bash
git clone https://github.com/dasarisiddhu/CodeSentinel.git
cd CodeSentinel
```

Create `.env` file in the root:
```env
GROQ_API_KEY=your_groq_api_key_here
GITHUB_TOKEN=optional_github_token_for_prs
GITHUB_REPO=optional_owner/repo_name
DATABASE_URL=sqlite+aiosqlite:///./codesentinel.db
```
*(Note: If `GROQ_API_KEY` is not provided, the backend automatically uses intelligent local fallback explanations).*

---

### Step 2: Set Up & Run the Backend

Open **Terminal 1**:

```powershell
# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server
python -m uvicorn app.main:app --reload --port 8000
```
- **API Documentation (Swagger):** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/health`

---

### Step 3: Set Up & Run the Frontend

Open **Terminal 2**:

```powershell
# Navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start development server
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

### Step 4: Running a Demo Review
1. Open `http://localhost:3000`.
2. Click the **Sample** button to load the intentionally vulnerable expense tracker code.
3. Click **Analyze** to watch the multi-agent pipeline execute in real-time.
4. Inspect the findings on the left rail, observe the **Scanner vs. ML severity** comparison, and review the verified code patch.
5. Click **Notify Code Owner** or **Open GitHub PR** to test the dispatch actions.
6. *(Optional)* Toggle **Demo Mode** in the header to demo instant-cached results offline without internet.

---

## 🌐 Deploying the Frontend to Vercel

The frontend is built using Next.js 14 and is optimized for deployment on Vercel.

### Method A: Deploy via Vercel Web Dashboard (Recommended)

1. **Push your repository to GitHub** (already set up at `dasarisiddhu/CodeSentinel`).
2. Log in to [Vercel](https://vercel.com) and click **"Add New..."** → **"Project"**.
3. Select your repository: **`CodeSentinel`**.
4. In the configuration settings:
   - **Root Directory:** Click **Edit** and set it to: `frontend`
   - **Framework Preset:** `Next.js` (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
5. **Environment Variables:**
   Add the following environment variable:
   - `NEXT_PUBLIC_API_URL`: URL of your deployed backend (e.g. `https://codesentinel-api.onrender.com` or your backend server).
6. Click **Deploy**.

---

### Method B: Deploy via Vercel CLI

```bash
npm install -g vercel
cd frontend
vercel
```
Follow the interactive prompts:
- Set root directory to current directory (`./`).
- Override settings if needed, then run `vercel --prod` to deploy to production.

---

### Connecting Vercel Frontend to Backend

In production, since the backend runs FastAPI (Python), host the backend on any Python platform:
- **Render / Railway / Fly.io / AWS EC2 / DigitalOcean**

In `frontend/next.config.js`, the rewrite proxy maps `/api/:path*` to the backend:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

---

## 📡 API Reference Summary

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/analyze` | Submits code to pipeline; triggers analysis |
| `GET` | `/review/{review_id}` | Polls status and retrieves findings, risk scores & diffs |
| `POST` | `/notify/{review_id}` | Dispatches finding notifications to the code owner |
| `POST` | `/pr/{review_id}` | Automatically creates a GitHub Pull Request with the verified patch |
| `GET` | `/demo/review` | Serves instant cached demo review for pitch reliability |
| `GET` | `/health` | System health check (Database, ML model status, Groq API connectivity) |
| `POST` | `/ingest/webhook` | Receives live file-watcher and CI/CD webhook events |

---

## 👥 HackForge Team & Ownership

- **Member 1 (ML & Detection Lead):** Detection agent wrappers (Semgrep/Bandit/Radon), feature engineering, XGBoost training.
- **Member 2 (Backend & Orchestration Lead):** FastAPI core, pipeline state machine, diff verification service, database & notify endpoints.
- **Member 3 (Frontend & Experience Lead):** Next.js 14 "lab notebook" UI, dense finding rail, verified diff viewer, and risk metrics.
- **Member 4 (Security & Demo Lead):** Broken-app fixtures, realistic vulnerability scenarios, watcher integration, demo execution.

---

## 📄 License
MIT License. Built for **HackForge × Microsoft Hackathon**.
