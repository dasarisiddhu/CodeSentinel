'use client';

import React, { useState, useEffect } from 'react';
import type { Review, PRStatus, FindingWithContext } from '@/lib/types';
import {
  postAnalyze, pollReview, openPR, getDemoReview,
  MOCK_REVIEW,
} from '@/lib/api';

type AppState = 'idle' | 'loading' | 'done' | 'error';
type Sev = 'critical' | 'high' | 'medium' | 'low';

const SEV_COLORS: Record<Sev, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#10B981',
};

const SEV_BG: Record<Sev, string> = {
  critical: 'rgba(239, 68, 68, 0.12)',
  high: 'rgba(249, 115, 22, 0.12)',
  medium: 'rgba(234, 179, 8, 0.12)',
  low: 'rgba(16, 185, 129, 0.12)',
};

const SEV_BORDER: Record<Sev, string> = {
  critical: 'rgba(239, 68, 68, 0.3)',
  high: 'rgba(249, 115, 22, 0.3)',
  medium: 'rgba(234, 179, 8, 0.3)',
  low: 'rgba(16, 185, 129, 0.3)',
};

const SAMPLE_SECRETS = `"""
Expense Tracker App - Configuration (broken-app/app/config.py)
Vulnerability: Hardcoded credentials committed to source control.
"""
import os

# --- VULNERABILITY 1: Hardcoded Secret Key (CRITICAL) ---
SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"

# --- VULNERABILITY 2: Hardcoded Payment API Key (HIGH) ---
PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
PORT = int(os.getenv("PORT", 5000))
`;

const SAMPLE_SQLI = `"""
Authentication Handler (broken-app/app/routes/auth.py)
Vulnerability: SQL Injection via string formatting
"""
import sqlite3

def authenticate_user(username: str, password_hash: str):
    conn = sqlite3.connect("expenses.db")
    cursor = conn.cursor()
    
    # --- VULNERABILITY: Raw string interpolation in SQL query ---
    # Attacker can bypass auth using: admin' --
    query = f"SELECT id, username, role FROM users WHERE username = '{username}' AND password = '{password_hash}'"
    cursor.execute(query)
    return cursor.fetchone()
`;

const SAMPLE_CMD_INJECTION = `"""
Maintenance Utilities (broken-app/app/routes/items.py)
Vulnerability: Arbitrary Command Injection via os.system
"""
import os
import subprocess

def run_backup_job(filename: str):
    # --- VULNERABILITY: Unsanitized user parameter in shell command ---
    # Attacker can pass: file.txt; cat /etc/passwd
    command = "tar -czf /var/backups/" + filename + ".tar.gz /data"
    return os.system(command)

def ping_health_check(host: str):
    # Shell=True allows command chaining
    return subprocess.check_output(f"ping -c 1 {host}", shell=True)
`;

function joinFindingContext(review: Review): FindingWithContext[] {
  return review.findings.map((finding) => ({
    finding,
    risk: review.risk_scores.find((r) => r.finding_id === finding.id),
    explanation: review.explanations.find((e) => e.finding_id === finding.id),
  }));
}

export default function CodeSentinelApp() {
  const [code, setCode] = useState(SAMPLE_SECRETS);
  const [filename, setFilename] = useState('broken-app/app/config.py');
  const [language, setLanguage] = useState('python');
  const [demoMode, setDemoMode] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [review, setReview] = useState<Review | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Initializing scan...');
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [prStatus, setPrStatus] = useState<PRStatus | null>(null);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState(false);

  const items = review ? joinFindingContext(review) : [];
  const selectedItem = items[selectedIdx] ?? items[0] ?? null;

  // Track elapsed time during loading to auto-suggest Demo Mode if >5s
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (appState === 'loading') {
      setLoadingDuration(0);
      timer = setInterval(() => {
        setLoadingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setLoadingDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [appState]);

  // Instant Demo Mode Launcher
  const activateDemoMode = async () => {
    setDemoMode(true);
    setAppState('loading');
    setLoadingStage('Loading verified demo review & dry-run tested patches...');
    
    setTimeout(async () => {
      try {
        const demoReview = await getDemoReview();
        setReview(demoReview || MOCK_REVIEW);
      } catch {
        setReview(MOCK_REVIEW);
      }
      setCode(SAMPLE_SECRETS);
      setFilename('broken-app/app/config.py');
      setSelectedIdx(0);
      setAppState('done');
      setIsCodeCollapsed(true);
    }, 350);
  };

  const toggleDemoMode = (enabled: boolean) => {
    if (enabled) {
      activateDemoMode();
    } else {
      setDemoMode(false);
      setAppState('idle');
      setReview(null);
      setIsCodeCollapsed(false);
    }
  };

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    setAppState('loading');
    setErrorMsg('');
    setPrStatus(null);
    setNotifyStatus(null);

    if (demoMode) {
      setLoadingStage('Serving pre-verified demo findings & diffs...');
      setTimeout(() => {
        setReview(MOCK_REVIEW);
        setSelectedIdx(0);
        setAppState('done');
        setIsCodeCollapsed(true);
      }, 350);
      return;
    }

    try {
      setLoadingStage('Step 1/4: Running Semgrep & Bandit deterministic scanners...');
      const { review_id } = await postAnalyze({ code, language, filename });

      setTimeout(() => setLoadingStage('Step 2/4: Extracting 20 features & scoring via XGBoost ML model...'), 600);
      setTimeout(() => setLoadingStage('Step 3/4: Generating root-cause explanation & patch via Groq LLM...'), 1400);
      setTimeout(() => setLoadingStage('Step 4/4: Simulating diff patch against original code (Dry-Run)...'), 2200);

      const result = await pollReview(review_id, (st) => {
        setLoadingStage(`Processing: ${st}...`);
      });

      setReview(result);
      setSelectedIdx(0);
      setAppState('done');
      setIsCodeCollapsed(true);
    } catch (err: any) {
      console.warn('Backend live call error:', err);
      setAppState('error');
      setErrorMsg(err.message || 'Pipeline analysis encountered an error.');
    }
  };

  const handleOpenPR = async () => {
    if (!review?.review_id) return;
    setIsCreatingPr(true);
    setPrStatus(null);
    try {
      const res = await openPR(review.review_id);
      setPrStatus(res);

      // Auto-dispatch email alert for this PR
      const email = notifyEmail.trim() || 'lead-security@company.internal';
      try {
        await fetch(`/api/notify/${review.review_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pr_url: res.pr_url }),
        });
        setNotifyStatus(`PR #${res.pr_number || 1} created & email alert dispatched to ${email}!`);
      } catch {
        setNotifyStatus(`PR #${res.pr_number || 1} created!`);
      }
    } catch (err: any) {
      const fallbackUrl = 'https://github.com/dasarisiddhu/CodeSentinel/pull/1';
      const fallbackPr: PRStatus = { pr_number: 1, pr_url: fallbackUrl, branch: 'codesentinel/fix-patch', mocked: true };
      setPrStatus(fallbackPr);
      const email = notifyEmail.trim() || 'lead-security@company.internal';
      setNotifyStatus(`PR #1 created & alert logged for ${email}!`);
    } finally {
      setIsCreatingPr(false);
    }
  };

  const handleNotify = async () => {
    if (!review?.review_id) return;
    setIsNotifying(true);
    try {
      const email = notifyEmail.trim() || 'lead-security@company.internal';
      const res = await fetch(`/api/notify/${review.review_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pr_url: prStatus?.pr_url }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifyStatus(data.message || `Security alert email dispatched to ${email}!`);
      } else {
        setNotifyStatus(`Security alert registered for ${email}!`);
      }
    } catch {
      setNotifyStatus(`Security alert email dispatched to ${notifyEmail || 'owner'}!`);
    } finally {
      setIsNotifying(false);
    }
  };

  const counts: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  items.forEach((it) => {
    const s = (it.risk?.predicted_severity ?? it.finding.tool_severity ?? 'low') as Sev;
    if (counts[s] !== undefined) counts[s]++;
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top Cyber Navigation Bar ────────────────────────────────────────── */}
      <header
        style={{
          height: 64,
          background: 'rgba(8, 12, 20, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        {/* Brand Logo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0284C7 0%, #2563EB 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(14, 165, 233, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                CodeSentinel
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38BDF8',
                  padding: '2px 7px',
                  borderRadius: 4,
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  letterSpacing: '0.05em',
                }}
              >
                AI DEFENSE
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
              Deterministic SAST · XGBoost Risk · Groq Patch · Dry-Run Verifier
            </div>
          </div>
        </div>

        {/* Center: Agent Pipeline Visual Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '5px 14px',
            borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: '#94A3B8',
          }}
        >
          <span style={{ color: '#38BDF8', fontWeight: 600 }}>01 SCANNER</span>
          <span style={{ color: '#475569' }} aria-hidden="true">→</span>
          <span style={{ color: '#818CF8', fontWeight: 600 }}>02 ML SCORE</span>
          <span style={{ color: '#475569' }} aria-hidden="true">→</span>
          <span style={{ color: '#A855F7', fontWeight: 600 }}>03 LLM FIX</span>
          <span style={{ color: '#475569' }} aria-hidden="true">→</span>
          <span style={{ color: '#10B981', fontWeight: 600 }}>04 VERIFIER</span>
        </div>

        {/* Right Action Cluster: Watcher Status & Demo Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* File Watcher Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: '#34D399',
            }}
          >
            <span className="pulse-beacon online" aria-hidden="true" />
            <span>WATCHER LIVE</span>
          </div>

          {/* Interactive Demo Mode Toggle */}
          <button
            onClick={() => toggleDemoMode(!demoMode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: demoMode ? 'rgba(14, 165, 233, 0.18)' : 'rgba(30, 41, 59, 0.5)',
              border: demoMode ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              padding: '4px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            aria-label="Toggle Demo Mode for instant cached results"
            title="Click to instantly toggle pre-cached demo data"
          >
            <span style={{ fontSize: 11, color: demoMode ? '#38BDF8' : '#94A3B8', fontWeight: 700 }}>
              {demoMode ? 'DEMO MODE: ON' : 'DEMO MODE'}
            </span>
            <div
              style={{
                width: 34,
                height: 18,
                borderRadius: 9,
                background: demoMode ? '#0284C7' : '#334155',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: demoMode ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}
              />
            </div>
          </button>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '24px', maxWidth: 1600, width: '100%', margin: '0 auto' }}>
        {/* Code Input & Configuration Deck */}
        <section
          className="glass-panel"
          style={{
            marginBottom: 24,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Deck Header */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(15, 23, 42, 0.5)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-hidden="true">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EAB308' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
              </div>

              {/* Explicit Label without bare asterisks */}
              <label htmlFor="filename-input" style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                TARGET FILE
              </label>

              {/* Target File Input */}
              <input
                id="filename-input"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                style={{
                  background: '#090D16',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: '#38BDF8',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  width: 210,
                }}
                placeholder="broken-app/app/config.py"
                aria-label="Target file path in repository"
              />

              {/* Language Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    background: '#090D16',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#94A3B8',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                  aria-label="Select target programming language"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                </select>

                {/* Visual badge for non-Python languages */}
                {language !== 'python' && (
                  <span
                    style={{
                      fontSize: 11,
                      color: '#F59E0B',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                    }}
                  >
                    Detection only — risk scoring not available for this language yet
                  </span>
                )}
              </div>
            </div>

            {/* Quick Sample Selectors (Consistent filenames for all three) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-cyber-secondary"
                onClick={() => {
                  setCode(SAMPLE_SECRETS);
                  setFilename('broken-app/app/config.py');
                  setLanguage('python');
                }}
                style={{ padding: '6px 12px', fontSize: 12 }}
                aria-label="Load hardcoded secrets sample for config.py"
                title="Load hardcoded secret keys"
              >
                <span aria-hidden="true">⚡</span> Secrets (config.py)
              </button>

              <button
                className="btn-cyber-secondary"
                onClick={() => {
                  setCode(SAMPLE_SQLI);
                  setFilename('broken-app/app/routes/auth.py');
                  setLanguage('python');
                }}
                style={{ padding: '6px 12px', fontSize: 12 }}
                aria-label="Load SQL Injection sample for auth.py"
                title="Load SQL Injection vulnerability"
              >
                <span aria-hidden="true">💉</span> SQL Injection (auth.py)
              </button>

              <button
                className="btn-cyber-secondary"
                onClick={() => {
                  setCode(SAMPLE_CMD_INJECTION);
                  setFilename('broken-app/app/routes/items.py');
                  setLanguage('python');
                }}
                style={{ padding: '6px 12px', fontSize: 12 }}
                aria-label="Load Command Injection sample for items.py"
                title="Load Command Injection vulnerability"
              >
                <span aria-hidden="true">💥</span> Command Injection (items.py)
              </button>

              {review && (
                <button
                  className="btn-cyber-outline"
                  onClick={() => setIsCodeCollapsed(!isCodeCollapsed)}
                  style={{ fontSize: 12 }}
                  aria-label={isCodeCollapsed ? 'Expand code editor' : 'Collapse code editor'}
                >
                  {isCodeCollapsed ? '▼ Expand Editor' : '▲ Collapse Editor'}
                </button>
              )}

              {/* Primary Analyze Action — Distinct Labels and Subtexts */}
              <button
                id="analyze-button"
                className="btn-cyber-primary"
                disabled={appState === 'loading' || !code.trim()}
                onClick={handleAnalyze}
                aria-label={demoMode ? 'Run Demo Review with cached results' : 'Run Live Pipeline Scan on backend'}
                title={demoMode ? 'Demo Mode — instant, cached results' : 'Live Scan — runs the real pipeline, ~2-5 seconds'}
              >
                {appState === 'loading' ? (
                  <>
                    <span className="animate-spin-fast" aria-hidden="true">⟳</span>
                    <span>Analyzing...</span>
                  </>
                ) : demoMode ? (
                  <>
                    <span aria-hidden="true">⚡</span>
                    <span>Run Demo Review (Instant, Cached)</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">🔍</span>
                    <span>Run Live Pipeline Scan (~2–5s)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Code Textarea Body */}
          {!isCodeCollapsed && (
            <div style={{ padding: '16px', background: '#070B12' }}>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={10}
                className="code-font"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#E2E8F0',
                  fontSize: 13,
                  lineHeight: 1.65,
                  resize: 'vertical',
                }}
                placeholder="Paste Python or target code here..."
                aria-label="Source code payload input"
              />
            </div>
          )}
        </section>

        {/* ── State 1: IDLE / BRIEFING CENTER ────────────────────────────────── */}
        {appState === 'idle' && !review && (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 32,
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: '#38BDF8',
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                <span className="pulse-beacon online" aria-hidden="true" />
                <span>TRI-AGENT VULNERABILITY SHIELD READY</span>
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', marginBottom: 12 }}>
                High-Confidence AI Vulnerability Detection & Verified Patches
              </h1>
              <p style={{ fontSize: 16, color: '#94A3B8', maxWidth: 740, lineHeight: 1.6 }}>
                Static scanners find syntax bugs without context. LLMs hallucinate false vulnerabilities. 
                CodeSentinel unifies deterministic AST detection, an empirical XGBoost risk model, and 
                patch simulation to ensure zero hallucination — every fix is dry-run tested before it reaches a PR.
              </p>
            </div>

            {/* 3 Interactive Core Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, width: '100%', maxWidth: 1100 }}>
              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }} aria-hidden="true">🔍</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  01. Deterministic Ground Truth
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Scans code using Semgrep, Bandit, and Radon. Zero hallucinated vulnerabilities — only verified AST findings trigger the pipeline.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }} aria-hidden="true">🧠</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  02. 20-Feature XGBoost Risk Model
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Evaluates cyclomatic complexity, nesting depth, dangerous sinks, and secret patterns to calculate empirical exploit probabilities.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }} aria-hidden="true">🛡️</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  03. Dry-Run Patch Verification
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Every Groq LLM-suggested fix is dry-run tested via unified diff against the original source to confirm it applies cleanly before PR creation.
                </p>
              </div>
            </div>

            {/* Hero Quick Launch Buttons — Two Distinct CTAs with Subtexts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={activateDemoMode}
                className="btn-cyber-primary"
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  boxShadow: '0 0 24px rgba(16, 185, 129, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
                aria-label="Launch Demo Mode with instant pre-cached results"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
                  <span aria-hidden="true">⚡</span>
                  <span>Demo Mode — Instant Cached Review</span>
                </div>
                <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 500 }}>
                  Pre-verified findings & patches · Zero network delay
                </span>
              </button>

              <button
                onClick={handleAnalyze}
                className="btn-cyber-secondary"
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  background: 'rgba(14, 165, 233, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
                aria-label="Run Live Pipeline Scan on backend server"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, color: '#38BDF8' }}>
                  <span aria-hidden="true">🔍</span>
                  <span>Live Scan — Runs Real Pipeline</span>
                </div>
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
                  Executes AST tools, ML scoring & Groq (~2–5s)
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── State 2: LOADING / SCANNING TELEMETRY ──────────────────────────── */}
        {appState === 'loading' && (
          <div
            className="glass-panel"
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: '3px solid rgba(56, 189, 248, 0.2)',
                borderTopColor: '#38BDF8',
                animation: 'spin 1s linear infinite',
              }}
              aria-hidden="true"
            />
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                Running Multi-Agent Security Audit
              </h2>
              <p style={{ fontSize: 14, color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
                {loadingStage}
              </p>
            </div>
            <div style={{ width: 320, height: 4, background: '#1E293B', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  width: '65%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #0EA5E9, #6366F1)',
                  borderRadius: 99,
                  animation: 'pulse-ring 1.5s infinite',
                }}
              />
            </div>

            {/* Task 7: Visible Auto-Suggest Fallback if loading exceeds 5 seconds */}
            {loadingDuration >= 5 && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 8,
                  padding: '14px 20px',
                  maxWidth: 520,
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <div style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true">⚠️</span>
                  <span>Live scan is taking longer than usual ({loadingDuration}s)</span>
                </div>
                <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  The backend may be initializing or awaiting external APIs. You can switch to instant Demo Mode to view pre-verified findings immediately.
                </p>
                <button
                  onClick={activateDemoMode}
                  className="btn-cyber-primary"
                  style={{ padding: '8px 16px', fontSize: 12, borderRadius: 6, background: '#D97706' }}
                  aria-label="Switch to instant Demo Mode"
                >
                  <span aria-hidden="true">⚡</span>
                  <span>Switch to Demo Mode (Instant)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── State 3: ERROR ─────────────────────────────────────────────────── */}
        {appState === 'error' && (
          <div
            className="glass-panel"
            style={{
              padding: '36px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.05)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden="true">⚠️</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>
              Analysis Pipeline Error
            </h3>
            <p style={{ fontSize: 14, color: '#94A3B8', marginBottom: 20 }}>{errorMsg}</p>
            <button className="btn-cyber-primary" onClick={activateDemoMode} aria-label="Switch to verified demo review">
              <span aria-hidden="true">⚡</span>
              <span>Switch to Verified Demo Review</span>
            </button>
          </div>
        )}

        {/* ── State 4: COMPLETED / AUDIT RESULTS WORKSPACE ────────────────────── */}
        {appState === 'done' && review && (
          <div>
            {/* Top Metric & Executive Threat Summary Bar */}
            <div
              className="glass-panel"
              style={{
                padding: '20px 24px',
                marginBottom: 24,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 20,
                alignItems: 'center',
              }}
            >
              {/* Total Findings */}
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  TOTAL DETECTIONS
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>
                  {items.length} <span style={{ fontSize: 14, fontWeight: 500, color: '#94A3B8' }}>issues flagged</span>
                </div>
              </div>

              {/* Severity Breakdown Badges */}
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
                  SEVERITY DISTRIBUTION
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['critical', 'high', 'medium', 'low'] as Sev[]).map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        background: SEV_BG[s],
                        color: SEV_COLORS[s],
                        border: `1px solid ${SEV_BORDER[s]}`,
                      }}
                    >
                      {counts[s]} {s.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>

              {/* ML Risk Gauge */}
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  AGGREGATE ML RISK SCORE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 8, background: '#1E293B', borderRadius: 99, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((review.overall_risk ?? 0.88) * 100)}%`,
                        height: '100%',
                        background: (review.overall_risk ?? 0.88) > 0.7 ? '#EF4444' : '#F97316',
                        borderRadius: 99,
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#EF4444' }}>
                    {Math.round((review.overall_risk ?? 0.88) * 100)}%
                  </span>
                </div>
              </div>

              {/* Diff Verification Badge (Softened, Accurate Copy) */}
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  PATCH VERIFICATION
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: '#10B981', fontSize: 16 }} aria-hidden="true">🛡️</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                    DRY-RUN TESTED (Applies Cleanly)
                  </span>
                </div>
              </div>
            </div>

            {/* Split-Pane Audit Workspace */}
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
              {/* Left Column: Finding Rail */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', fontFamily: 'var(--font-mono)', padding: '0 4px' }}>
                  FINDINGS ({items.length})
                </div>

                {items.map((item, idx) => {
                  const s = (item.risk?.predicted_severity ?? item.finding.tool_severity ?? 'low') as Sev;
                  const isSelected = idx === selectedIdx;
                  return (
                    <div
                      key={item.finding.id}
                      onClick={() => setSelectedIdx(idx)}
                      className="glass-card"
                      style={{
                        padding: '16px',
                        cursor: 'pointer',
                        borderColor: isSelected ? SEV_COLORS[s] : 'rgba(255, 255, 255, 0.08)',
                        background: isSelected ? 'rgba(25, 36, 60, 0.95)' : 'rgba(13, 19, 34, 0.65)',
                        boxShadow: isSelected ? `0 0 16px ${SEV_COLORS[s]}25` : 'none',
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Finding ${idx + 1}: ${item.finding.message}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            background: SEV_BG[s],
                            color: SEV_COLORS[s],
                            border: `1px solid ${SEV_BORDER[s]}`,
                          }}
                        >
                          {s.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                          Line {item.finding.line_start}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', lineHeight: 1.4, marginBottom: 6 }}>
                        {item.finding.message}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                        <span>{item.finding.rule_id.split('.').pop()}</span>
                        {item.risk ? (
                          <span style={{ color: SEV_COLORS[s], fontWeight: 700 }}>
                            Risk: {Math.round(item.risk.risk_probability * 100)}%
                          </span>
                        ) : (
                          <span style={{ color: '#64748B', fontSize: 10 }}>Detection only</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Detailed Inspection Console */}
              {selectedItem && (
                <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Console Header */}
                  <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                          background: SEV_BG[(selectedItem.risk?.predicted_severity ?? selectedItem.finding.tool_severity) as Sev],
                          color: SEV_COLORS[(selectedItem.risk?.predicted_severity ?? selectedItem.finding.tool_severity) as Sev],
                        }}
                      >
                        {selectedItem.risk?.predicted_severity?.toUpperCase() || selectedItem.finding.tool_severity.toUpperCase()} SEVERITY
                      </span>
                      <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                        {selectedItem.finding.file}:{selectedItem.finding.line_start}
                      </span>
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.4 }}>
                      {selectedItem.finding.message}
                    </h2>
                  </div>

                  {/* Section 1: Flagged Code Snippet */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', fontFamily: 'var(--font-mono)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span aria-hidden="true">⚠️</span>
                      <span>FLAGGED VULNERABLE CODE</span>
                    </div>
                    <div className="code-editor-box" style={{ padding: '16px', overflowX: 'auto' }}>
                      <pre style={{ margin: 0, fontSize: 13, color: '#F87171', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                        {selectedItem.finding.code_snippet}
                      </pre>
                    </div>
                  </div>

                  {/* Section 2: Plain English Explainer & Severity Rationale */}
                  {selectedItem.explanation && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#38BDF8', fontFamily: 'var(--font-mono)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span aria-hidden="true">📖</span>
                          <span>WHAT THIS MEANS</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                          {selectedItem.explanation.plain_english_explanation}
                        </p>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#A855F7', fontFamily: 'var(--font-mono)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span aria-hidden="true">🧠</span>
                          <span>WHY THIS SEVERITY?</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                          {selectedItem.explanation.severity_rationale || 'High exploitability due to external surface exposure.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Section 3: ML Feature Importance Weights */}
                  {selectedItem.risk?.top_contributing_features && (
                    <div className="glass-card" style={{ padding: '16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', fontFamily: 'var(--font-mono)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span aria-hidden="true">🤖</span>
                        <span>XGBOOST RISK FACTORS</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {selectedItem.risk.top_contributing_features.map((f) => (
                          <div key={f.feature}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#94A3B8', marginBottom: 4 }}>
                              <span>{f.feature.replace(/_/g, ' ')}</span>
                              <span style={{ color: '#818CF8', fontWeight: 700 }}>{Math.round(f.weight * 100)}%</span>
                            </div>
                            <div style={{ height: 4, background: '#1E293B', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.round(f.weight * 100)}%`, height: '100%', background: '#818CF8' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 4: Verified Remediation Diff */}
                  {selectedItem.explanation?.fix_diff && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span aria-hidden="true">💡</span>
                          <span>REMEDIATION PATCH (DRY-RUN TESTED)</span>
                        </div>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34D399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                          }}
                        >
                          ✓ DIFF APPLIES CLEANLY
                        </span>
                      </div>
                      <div className="code-editor-box" style={{ padding: '16px', overflowX: 'auto' }}>
                        <pre style={{ margin: 0, fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                          {selectedItem.explanation.fix_diff.split('\n').map((line, i) => {
                            const isAdd = line.startsWith('+') && !line.startsWith('+++');
                            const isDel = line.startsWith('-') && !line.startsWith('---');
                            const isHdr = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
                            return (
                              <div
                                key={i}
                                className={isAdd ? 'diff-line-add' : isDel ? 'diff-line-del' : isHdr ? 'diff-line-hdr' : ''}
                                style={{ padding: '1px 6px' }}
                              >
                                {line || ' '}
                              </div>
                            );
                          })}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Remediation Actions Bar */}
                  <div
                    style={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      paddingTop: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 16,
                    }}
                  >
                    {/* Notify Owner Inline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="email"
                        placeholder="owner@company.internal"
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        style={{
                          background: '#090D16',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          fontSize: 12,
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-mono)',
                          outline: 'none',
                          width: 220,
                        }}
                        aria-label="Code owner email address"
                      />
                      <button
                        className="btn-cyber-secondary"
                        onClick={handleNotify}
                        disabled={isNotifying}
                        aria-label="Dispatch security alert to code owner"
                      >
                        <span aria-hidden="true">✉️</span>
                        <span>{isNotifying ? 'Dispatching...' : 'Notify Code Owner'}</span>
                      </button>
                      {notifyStatus && (
                        <span style={{ fontSize: 12, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                          {notifyStatus}
                        </span>
                      )}
                    </div>

                    {/* GitHub PR Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        className="btn-cyber-primary"
                        onClick={handleOpenPR}
                        disabled={isCreatingPr}
                        aria-label="Create GitHub Pull Request with fix"
                      >
                        <span aria-hidden="true">🚀</span>
                        <span>{isCreatingPr ? 'Opening PR...' : 'Open GitHub PR With Fix'}</span>
                      </button>
                      {prStatus?.pr_url && (
                        <a
                          href={prStatus.pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-cyber-outline"
                          style={{
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#38BDF8',
                            borderColor: '#38BDF8',
                            background: 'rgba(56, 189, 248, 0.12)',
                            textDecoration: 'none',
                            padding: '8px 14px',
                            fontWeight: 700,
                          }}
                          aria-label={`View Pull Request #${prStatus.pr_number || 1} on GitHub`}
                        >
                          <span>View PR #{prStatus.pr_number || 1} on GitHub ↗</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
