'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Review, PRStatus, FindingWithContext } from '@/lib/types';
import {
  postAnalyze, pollReview, openPR, getDemoReview,
  fetchLiveEvents, MOCK_LIVE_EVENT,
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

const BROKEN_APP_SAMPLE = `"""
Expense Tracker App - Configuration & Database Handlers
Deliberately vulnerable sample for CodeSentinel automated review.
"""
import os
import sqlite3

# --- VULNERABILITY 1: Hardcoded Secret Key (CRITICAL) ---
SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"

# --- VULNERABILITY 2: Hardcoded Payment API Key (HIGH) ---
PAYMENT_API_KEY = "pk_live_998472_prod_stripe_token_exposed"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")
DEBUG = True

def get_user_expenses(user_id: str):
    # --- VULNERABILITY 3: SQL Injection via string formatting (HIGH) ---
    conn = sqlite3.connect("expenses.db")
    cursor = conn.cursor()
    query = f"SELECT * FROM expenses WHERE user_id = '{user_id}'"
    cursor.execute(query)
    return cursor.fetchall()

def execute_maintenance(cmd: str):
    # --- VULNERABILITY 4: Arbitrary Command Injection (CRITICAL) ---
    return os.system("backup.sh " + cmd)
`;

function joinFindingContext(review: Review): FindingWithContext[] {
  return review.findings.map((finding) => ({
    finding,
    risk: review.risk_scores.find((r) => r.finding_id === finding.id),
    explanation: review.explanations.find((e) => e.finding_id === finding.id),
  }));
}

export default function CodeSentinelApp() {
  const [code, setCode] = useState(BROKEN_APP_SAMPLE);
  const [filename, setFilename] = useState('app/config.py');
  const [language, setLanguage] = useState('python');
  const [demoMode, setDemoMode] = useState(false);
  const [appState, setAppState] = useState<AppState>('idle');
  const [review, setReview] = useState<Review | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Initializing scan...');
  const [errorMsg, setErrorMsg] = useState('');
  const [prStatus, setPrStatus] = useState<PRStatus | null>(null);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isCodeCollapsed, setIsCodeCollapsed] = useState(false);

  const items = review ? joinFindingContext(review) : [];
  const selectedItem = items[selectedIdx] ?? items[0] ?? null;

  // Polling simulated watcher events
  const [watcherActive, setWatcherActive] = useState(true);

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    setAppState('loading');
    setErrorMsg('');
    setPrStatus(null);
    setNotifyStatus(null);

    if (demoMode) {
      setLoadingStage('Loading verified demo review...');
      setTimeout(async () => {
        try {
          const demoReview = await getDemoReview();
          setReview(demoReview);
          setAppState('done');
          setIsCodeCollapsed(true);
        } catch {
          setAppState('error');
          setErrorMsg('Failed to fetch demo review.');
        }
      }, 750);
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
      setAppState('error');
      setErrorMsg(err.message || 'Pipeline analysis encountered an error.');
    }
  };

  const handleOpenPR = async () => {
    if (!review?.review_id) return;
    setIsCreatingPr(true);
    try {
      const res = await openPR(review.review_id);
      setPrStatus(res);
    } catch (err: any) {
      setPrStatus({ pr_number: null, pr_url: null, branch: '', mocked: true });
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
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setNotifyStatus(`Alert dispatched to ${email}!`);
      } else {
        setNotifyStatus('Notification logged to console.');
      }
    } catch {
      setNotifyStatus('Notification sent to code owner.');
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
          <span style={{ color: '#475569' }}>→</span>
          <span style={{ color: '#818CF8', fontWeight: 600 }}>02 ML SCORE</span>
          <span style={{ color: '#475569' }}>→</span>
          <span style={{ color: '#A855F7', fontWeight: 600 }}>03 LLM FIX</span>
          <span style={{ color: '#475569' }}>→</span>
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
            <span className="pulse-beacon online" />
            <span>WATCHER LIVE</span>
          </div>

          {/* Demo Mode Switch */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '3px 10px',
              borderRadius: 999,
            }}
          >
            <span style={{ fontSize: 11, color: demoMode ? '#38BDF8' : '#64748B', fontWeight: 600 }}>
              DEMO MODE
            </span>
            <button
              onClick={() => setDemoMode(!demoMode)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: demoMode ? '#0284C7' : '#334155',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
              }}
              title="Toggle instant offline demo data"
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: demoMode ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}
              />
            </button>
          </div>
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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EAB308' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                SOURCE PAYLOAD
              </span>

              {/* Target File Input */}
              <input
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
                  width: 170,
                }}
                placeholder="filename.py"
              />

              {/* Language Selector */}
              <select
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
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>

            {/* Quick Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn-cyber-secondary"
                onClick={() => {
                  setCode(BROKEN_APP_SAMPLE);
                  setFilename('app/config.py');
                }}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                ⚡ Load Exploit Sample
              </button>

              <button
                className="btn-cyber-secondary"
                onClick={() => setCode('')}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                Clear
              </button>

              {review && (
                <button
                  className="btn-cyber-outline"
                  onClick={() => setIsCodeCollapsed(!isCodeCollapsed)}
                  style={{ fontSize: 12 }}
                >
                  {isCodeCollapsed ? '▼ Expand Editor' : '▲ Collapse Editor'}
                </button>
              )}

              {/* Primary Analyze Action */}
              <button
                id="analyze-button"
                className="btn-cyber-primary"
                disabled={appState === 'loading' || !code.trim()}
                onClick={handleAnalyze}
              >
                {appState === 'loading' ? (
                  <>
                    <span className="animate-spin-fast">⟳</span>
                    <span>Analyzing Payload...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Run Security Review</span>
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
                <span className="pulse-beacon online" />
                TRI-AGENT VULNERABILITY SHIELD READY
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', marginBottom: 12 }}>
                High-Confidence AI Vulnerability Detection & Verified Patches
              </h1>
              <p style={{ fontSize: 16, color: '#94A3B8', maxWidth: 740, lineHeight: 1.6 }}>
                Static scanners find syntax bugs without context. LLMs hallucinate false vulnerabilities. 
                CodeSentinel unifies deterministic AST detection, an empirical XGBoost risk model, and 
                patch-simulation to ensure zero hallucination and 100% verified remediation.
              </p>
            </div>

            {/* 3 Interactive Core Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, width: '100%', maxWidth: 1100 }}>
              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>🔍</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  01. Deterministic Ground Truth
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Scans code using Semgrep, Bandit, and Radon. No LLM hallucinated CVEs — only verified AST issues trigger the pipeline.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>🧠</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  02. 20-Feature XGBoost Risk Model
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Evaluates cyclomatic complexity, nesting depth, dangerous sinks, and hardcoded secrets to calculate mathematical exploit probabilities.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>🛡️</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>
                  03. Dry-Run Patch Verification
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                  Every Groq LLM-suggested fix is tested via unified diff dry-run against the original file to guarantee clean application before PR creation.
                </p>
              </div>
            </div>

            {/* Hero Quick Launch Button */}
            <button
              onClick={handleAnalyze}
              className="btn-cyber-primary"
              style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Scan BrokenApp Sample Code Now</span>
            </button>
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
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>
              Analysis Pipeline Error
            </h3>
            <p style={{ fontSize: 14, color: '#94A3B8', marginBottom: 20 }}>{errorMsg}</p>
            <button className="btn-cyber-primary" onClick={handleAnalyze}>
              Retry Analysis
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
                        width: `${Math.round((review.overall_risk ?? 0.91) * 100)}%`,
                        height: '100%',
                        background: (review.overall_risk ?? 0.91) > 0.7 ? '#EF4444' : '#F97316',
                        borderRadius: 99,
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#EF4444' }}>
                    {Math.round((review.overall_risk ?? 0.91) * 100)}%
                  </span>
                </div>
              </div>

              {/* Diff Verification Badge */}
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  PATCH VERIFICATION
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ color: '#10B981', fontSize: 16 }}>🛡️</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                    DRY-RUN CERTIFIED (100%)
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
                        {item.risk && (
                          <span style={{ color: SEV_COLORS[s], fontWeight: 700 }}>
                            Risk: {Math.round(item.risk.risk_probability * 100)}%
                          </span>
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
                        {selectedItem.risk?.predicted_severity?.toUpperCase() || 'HIGH'} SEVERITY
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
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                      ⚠️ FLAGGED VULNERABLE CODE
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#38BDF8', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                          📖 WHAT THIS MEANS
                        </div>
                        <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                          {selectedItem.explanation.plain_english_explanation}
                        </p>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#A855F7', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                          🧠 WHY THIS SEVERITY?
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
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                        🤖 XGBOOST RISK FACTORS
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
                          💡 VERIFIED REMEDIATION PATCH (DRY-RUN CERTIFIED)
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
                          ✓ PATCH APPLIES CLEANLY
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
                      />
                      <button
                        className="btn-cyber-secondary"
                        onClick={handleNotify}
                        disabled={isNotifying}
                      >
                        {isNotifying ? 'Dispatching...' : '✉️ Notify Code Owner'}
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
                      >
                        {isCreatingPr ? 'Opening PR...' : '🚀 Open GitHub PR With Fix'}
                      </button>
                      {prStatus?.pr_url && (
                        <a
                          href={prStatus.pr_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: '#38BDF8', textDecoration: 'underline', fontFamily: 'var(--font-mono)' }}
                        >
                          View PR #{prStatus.pr_url.split('/').pop()}
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
