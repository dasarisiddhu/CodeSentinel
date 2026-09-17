'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Review, PRStatus, LiveFeedEvent, FindingWithContext, FeatureWeight } from '@/lib/types';
import {
  postAnalyze,
  pollReview,
  openPR,
  getDemoReview,
  fetchLiveEvents,
  MOCK_LIVE_EVENT,
} from '@/lib/api';

// Components
import CodeInput from '@/components/CodeInput';
import DemoModeToggle from '@/components/DemoModeToggle';
import { LoadingState, ErrorState, EmptyState, IdleState } from '@/components/StatusStates';
import FindingsList from '@/components/FindingsList';
import RiskGauge from '@/components/RiskGauge';
import FeatureImportanceChart from '@/components/FeatureImportanceChart';
import PRStatusCard from '@/components/PRStatusCard';
import LiveFeedIndicator from '@/components/LiveFeedIndicator';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppState = 'idle' | 'loading' | 'done' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function joinFindingContext(review: Review): FindingWithContext[] {
  return review.findings.map((finding) => ({
    finding,
    risk: review.risk_scores.find((r) => r.finding_id === finding.id),
    explanation: review.explanations.find((e) => e.finding_id === finding.id),
  }));
}

function collectAllFeatures(review: Review): FeatureWeight[] {
  return review.risk_scores.flatMap((r) => r.top_contributing_features);
}

// ── BROKENAPP_SAMPLE code (pre-fills input for instant demo) ──────────────────

const BROKEN_APP_SAMPLE = `"""
Configuration for the Expense Tracker app.
Loaded from environment variables — but some sensitive defaults are hardcoded
for "developer convenience." This is intentional for the CodeSentinel demo.
"""

import os

# --- VULNERABILITY: Hardcoded secret key (HIGH / security) ---
SECRET_KEY = "super-secret-dev-key-do-not-use-in-prod-1234"

# --- VULNERABILITY: Hardcoded API key (HIGH / security) ---
PAYMENT_API_KEY = "pk_live_abc123xyz_hardcoded_payment_key"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///expenses.db")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
PORT = int(os.getenv("PORT", 5000))
`;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  // Input state
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [filename, setFilename] = useState('');

  // App state
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingStage, setLoadingStage] = useState('');

  // Results state
  const [review, setReview] = useState<Review | null>(null);
  const [pr, setPr] = useState<PRStatus | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveFeedEvent[]>([]);

  // Mode
  const [isDemo, setIsDemo] = useState(false);

  // Polling refs
  const liveEventRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Live feed polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDemo) {
      // In demo mode, simulate a live event after 2s
      const t = setTimeout(() => {
        setLiveEvents([{ ...MOCK_LIVE_EVENT, timestamp: new Date().toISOString() }]);
      }, 2000);
      return () => clearTimeout(t);
    }

    // Real mode: poll /ingest/events every 5s
    liveEventRef.current = setInterval(async () => {
      const events = await fetchLiveEvents();
      if (events.length > 0) {
        setLiveEvents(events);
        // Auto-populate code input with the latest received file if empty
        // (backend would need to return code content — this is best-effort)
      }
    }, 5000);

    return () => {
      if (liveEventRef.current) clearInterval(liveEventRef.current);
    };
  }, [isDemo]);

  // ── Demo mode switch ─────────────────────────────────────────────────────────
  const handleDemoToggle = useCallback(async (value: boolean) => {
    setIsDemo(value);
    if (value) {
      setAppState('loading');
      setLoadingStage('pending');
      try {
        const demoReview = await getDemoReview();
        setReview(demoReview);
        setCode(BROKEN_APP_SAMPLE);
        setFilename('config.py');
        setLanguage('python');
        setAppState('done');
        // Auto-open mock PR
        setPr({
          pr_number: 42,
          pr_url: null,
          branch: 'codesentinel/fix-findings-demo-review-001',
          mocked: true,
        });
      } catch {
        setAppState('idle');
      }
    } else {
      // Back to live — clear results
      setReview(null);
      setPr(null);
      setAppState('idle');
    }
  }, []);

  // ── Analyze ──────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) return;

    setAppState('loading');
    setLoadingStage('pending');
    setReview(null);
    setPr(null);
    setErrorMsg('');

    if (isDemo) {
      // Demo mode: always use cached result
      try {
        const demoReview = await getDemoReview();
        setReview(demoReview);
        setAppState('done');
        setPr({
          pr_number: 42,
          pr_url: null,
          branch: 'codesentinel/fix-findings-demo-review-001',
          mocked: true,
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Demo review failed.');
        setAppState('error');
      }
      return;
    }

    // Live mode
    try {
      const { review_id } = await postAnalyze({ code, language, filename: filename || 'input.py' });
      const result = await pollReview(review_id, (s) => setLoadingStage(s));
      setReview(result);
      setAppState('done');

      // Kick off PR in background (non-blocking)
      openPR(review_id)
        .then((prResult) => setPr(prResult))
        .catch(() => {
          // PR failed — not critical, don't surface as error
          setPr({ pr_number: null, pr_url: null, branch: `codesentinel/fix-${review_id}`, mocked: true });
        });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unknown error. Check the backend is running at http://localhost:8000.',
      );
      setAppState('error');
    }
  }, [code, language, filename, isDemo]);

  // ── Retry ────────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setAppState('idle');
    setErrorMsg('');
    setReview(null);
    setPr(null);
  }, []);

  // ── Load BrokenApp sample ────────────────────────────────────────────────────
  const loadSample = () => {
    setCode(BROKEN_APP_SAMPLE);
    setFilename('config.py');
    setLanguage('python');
    setAppState('idle');
    setReview(null);
    setPr(null);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const items: FindingWithContext[] = review ? joinFindingContext(review) : [];
  const allFeatures: FeatureWeight[] = review ? collectAllFeatures(review) : [];
  const isLoading = appState === 'loading';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        id="main-header"
        role="banner"
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 flex-wrap gap-3"
        style={{
          background: 'rgba(10,11,15,0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3" role="img" aria-label="CodeSentinel logo">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{
              background: 'linear-gradient(135deg, rgba(124,111,247,0.3), rgba(90,79,212,0.2))',
              border: '1px solid rgba(124,111,247,0.35)',
              boxShadow: '0 0 16px rgba(124,111,247,0.25)',
            }}
            aria-hidden="true"
          >
            🛡️
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight" style={{ color: '#f0f0f8' }}>
              CodeSentinel
            </h1>
            <p className="text-xs" style={{ color: '#50546a' }}>
              AI Code Review &amp; Vulnerability Detection
            </p>
          </div>
        </div>

        {/* Header right — live indicator + demo toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <LiveFeedIndicator events={liveEvents} isDemo={isDemo} />
          <DemoModeToggle isDemo={isDemo} onToggle={handleDemoToggle} />
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main
        id="main-content"
        role="main"
        className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 space-y-6"
      >
        {/* ── Tagline ─────────────────────────────────────────────────────── */}
        <div className="text-center pt-2 pb-4 animate-fade-in">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
            style={{
              background: 'rgba(124,111,247,0.10)',
              border: '1px solid rgba(124,111,247,0.2)',
              color: '#a89cf8',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
              style={{ background: '#7c6ff7' }}
              aria-hidden="true"
            />
            HackForge × Microsoft — PS1
          </div>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#8a8ea8' }}>
            Scanner finds it · ML model prioritizes it · LLM explains and fixes it
          </p>

          {/* Sample loader */}
          {appState === 'idle' && !code && (
            <button
              id="load-sample-button"
              onClick={loadSample}
              className="mt-4 btn-ghost text-xs"
              aria-label="Load BrokenApp sample code"
            >
              ↓ Load BrokenApp sample
            </button>
          )}
        </div>

        {/* ── Two-column layout on wide screens ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Code input (always visible) */}
          <div className="lg:col-span-2">
            <CodeInput
              code={code}
              language={language}
              filename={filename}
              isLoading={isLoading}
              onCodeChange={setCode}
              onLanguageChange={setLanguage}
              onFilenameChange={setFilename}
              onAnalyze={handleAnalyze}
            />

            {/* Risk gauge + PR card below input on desktop */}
            {review && appState === 'done' && (
              <div className="mt-4 space-y-4 animate-fade-in">
                <div
                  className="glass-card-elevated p-5 flex flex-col items-center gap-2"
                  role="region"
                  aria-label="Overall risk gauge"
                >
                  <RiskGauge probability={review.overall_risk} size={160} />
                  <p className="text-xs text-center" style={{ color: '#50546a' }}>
                    Aggregate ML risk across all findings
                  </p>
                </div>

                {pr && <PRStatusCard pr={pr} />}
              </div>
            )}
          </div>

          {/* Right: Results panel */}
          <div className="lg:col-span-3 space-y-4">
            {/* Feature importance chart — always prominent when results exist */}
            {review && appState === 'done' && allFeatures.length > 0 && (
              <FeatureImportanceChart features={allFeatures} />
            )}

            {/* State-driven result area */}
            {appState === 'idle' && <IdleState />}
            {appState === 'loading' && <LoadingState stage={loadingStage} />}
            {appState === 'error' && <ErrorState message={errorMsg} onRetry={handleRetry} />}
            {appState === 'done' && review && items.length === 0 && <EmptyState />}
            {appState === 'done' && review && items.length > 0 && (
              <FindingsList items={items} />
            )}
          </div>
        </div>

        {/* ── Demo mode banner ────────────────────────────────────────────── */}
        {isDemo && (
          <div
            role="status"
            aria-live="polite"
            className="animate-slide-up flex items-center gap-3 px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'rgba(124,111,247,0.08)',
              border: '1px solid rgba(124,111,247,0.2)',
              color: '#a89cf8',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>
              <strong>Demo Mode</strong> — showing cached results. Toggle to{' '}
              <strong>LIVE</strong> to analyze real code against the backend.
            </span>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        role="contentinfo"
        className="text-center py-6 px-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: '#50546a' }}
      >
        <p className="text-xs">
          CodeSentinel · Deterministic detection + ML risk scoring + LLM-verified fixes ·{' '}
          <span style={{ color: '#7c6ff7' }}>HackForge × Microsoft</span>
        </p>
      </footer>
    </div>
  );
}
