'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Review, PRStatus, LiveFeedEvent, FindingWithContext, FeatureWeight } from '@/lib/types';
import {
  postAnalyze, pollReview, openPR, getDemoReview,
  fetchLiveEvents, MOCK_LIVE_EVENT,
} from '@/lib/api';

import CodeInput from '@/components/CodeInput';
import DemoModeToggle from '@/components/DemoModeToggle';
import { LoadingState, ErrorState, EmptyState, IdleState } from '@/components/StatusStates';
import FindingCard from '@/components/FindingCard';
import RiskGauge from '@/components/RiskGauge';
import LiveFeedIndicator from '@/components/LiveFeedIndicator';

type AppState = 'idle' | 'loading' | 'done' | 'error';
type Sev = 'critical' | 'high' | 'medium' | 'low';

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low'];
const SEV_COLORS: Record<Sev, string> = {
  critical: '#8C2F2F', high: '#B5622A', medium: '#A88324', low: '#4B5D67',
};
const SEV_BG: Record<Sev, string> = {
  critical: 'rgba(140,47,47,0.08)', high: 'rgba(181,98,42,0.08)',
  medium: 'rgba(168,131,36,0.08)', low: 'rgba(75,93,103,0.08)',
};

function joinFindingContext(review: Review): FindingWithContext[] {
  return review.findings.map((finding) => ({
    finding,
    risk: review.risk_scores.find((r) => r.finding_id === finding.id),
    explanation: review.explanations.find((e) => e.finding_id === finding.id),
  }));
}

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
PORT = int(os.getenv("PORT", 5000))`;

// ── Notify helper ────────────────────────────────────────────────────────────

async function postNotify(reviewId: string, email: string): Promise<void> {
  await fetch(`/api/notify/${reviewId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

// ── Severity breakdown pill ──────────────────────────────────────────────────

function SevPill({ sev, count }: { sev: Sev; count: number }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.05em',
        color: SEV_COLORS[sev], background: SEV_BG[sev],
        border: `1px solid ${SEV_COLORS[sev]}40`,
        borderRadius: 2, padding: '2px 8px',
      }}
    >
      {count} {sev}
    </span>
  );
}

// ── Rail: dense finding list ─────────────────────────────────────────────────

function RailRow({
  item, active, onClick,
}: { item: FindingWithContext; active: boolean; onClick: () => void }) {
  const sev = (item.risk?.predicted_severity ?? item.finding.tool_severity) as Sev;
  const isConfirmed = !!item.explanation?.verified;
  const prob = item.risk?.risk_probability ?? 0;

  return (
    <button
      onClick={onClick}
      className={`cs-finding-row sev-${sev}${active ? ' active' : ''}`}
      aria-pressed={active}
    >
      {/* Severity token */}
      <span className={`sev-token sev-${sev}${isConfirmed ? ' just-confirmed' : ' predicted'}`}>
        {sev.toUpperCase().slice(0, 4)}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cs-finding-row-title" title={item.finding.message}>
          {item.finding.message}
        </div>
        <div className="cs-finding-row-meta">
          {item.finding.file}:{item.finding.line_start}
          {prob > 0 && (
            <span style={{ marginLeft: 6, color: SEV_COLORS[sev], opacity: isConfirmed ? 1 : 0.5 }}>
              {Math.round(prob * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* confirmed / predicted badge */}
      <span className={`confirmed-badge${isConfirmed ? ' is-confirmed' : ''}`} style={{ flexShrink: 0 }}>
        {isConfirmed ? '✓ confirmed' : '~ predicted'}
      </span>
    </button>
  );
}

// ── Risk distribution bar ────────────────────────────────────────────────────

function RiskBar({ items }: { items: FindingWithContext[] }) {
  const counts: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) {
    const s = (item.risk?.predicted_severity ?? item.finding.tool_severity) as Sev;
    if (s in counts) counts[s]++;
  }
  const total = items.length;
  return (
    <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--paper-dim)' }}>
      {SEV_ORDER.map((sev) => {
        const pct = total > 0 ? (counts[sev] / total) * 100 : 0;
        return pct > 0 ? (
          <div key={sev} style={{ width: `${pct}%`, background: SEV_COLORS[sev] }} />
        ) : null;
      })}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [filename, setFilename] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [pr, setPr] = useState<PRStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [liveEvents, setLiveEvents] = useState<LiveFeedEvent[]>([]);
  const [items, setItems] = useState<FindingWithContext[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [notifySent, setNotifySent] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [showNotifyInput, setShowNotifyInput] = useState(false);

  // Live events polling
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isDemo) {
      liveRef.current = setInterval(async () => {
        const evts = await fetchLiveEvents();
        if (evts.length > 0) setLiveEvents(evts);
      }, 5000);
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [isDemo]);

  const handleDemoToggle = useCallback(async () => {
    const next = !isDemo;
    setIsDemo(next);
    if (next) {
      setAppState('loading');
      const r = await getDemoReview();
      setReview(r);
      const joined = joinFindingContext(r);
      const sorted = [...joined].sort((a, b) =>
        (b.risk?.risk_probability ?? 0) - (a.risk?.risk_probability ?? 0)
      );
      setItems(sorted);
      setSelectedIdx(0);
      setAppState('done');
      setLiveEvents([MOCK_LIVE_EVENT]);
    }
  }, [isDemo]);

  const loadSample = useCallback(() => {
    setCode(BROKEN_APP_SAMPLE);
    setFilename('broken-app/app/config.py');
    setLanguage('python');
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) return;
    setIsLoading(true);
    setAppState('loading');
    setLoadingStage('Submitting to scanner...');
    setReview(null);
    setItems([]);
    setPr(null);
    setNotifySent(false);
    setShowNotifyInput(false);
    try {
      const { review_id } = await postAnalyze({ code, language, filename });
      setLoadingStage('Detection agent running...');
      const r = await pollReview(review_id, (s) => setLoadingStage(`Pipeline: ${s}`));
      setReview(r);
      const joined = joinFindingContext(r);
      const sorted = [...joined].sort((a, b) =>
        (b.risk?.risk_probability ?? 0) - (a.risk?.risk_probability ?? 0)
      );
      setItems(sorted);
      setSelectedIdx(0);
      setAppState('done');
    } catch (e) {
      setErrorMsg((e as Error).message);
      setAppState('error');
    } finally {
      setIsLoading(false);
    }
  }, [code, language, filename]);

  const handleRetry = useCallback(() => {
    setAppState('idle');
    setErrorMsg('');
  }, []);

  const handleOpenPR = useCallback(async () => {
    if (!review) return;
    try {
      const p = await openPR(review.review_id);
      setPr(p);
      showToast('Pull request opened');
    } catch { showToast('PR open failed'); }
  }, [review]);

  const handleNotify = useCallback(async () => {
    if (!review || !notifyEmail.trim()) return;
    try {
      await postNotify(review.review_id, notifyEmail.trim());
      setNotifySent(true);
      setShowNotifyInput(false);
      showToast('Report emailed ✓');
    } catch { showToast('Email send failed'); }
  }, [review, notifyEmail]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }

  const selectedItem = items[selectedIdx];

  // Count by severity for rail header
  const counts: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) {
    const s = (item.risk?.predicted_severity ?? item.finding.tool_severity) as Sev;
    if (s in counts) counts[s]++;
  }

  return (
    <>
      {/* SEO */}
      <title>CodeSentinel — AI Code Review & Vulnerability Detection</title>
      <meta name="description" content="3-agent pipeline: deterministic scanner → ML risk scoring → LLM-verified fix suggestions. HackForge × Microsoft PS1." />

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header id="main-header" role="banner" className="cs-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="cs-logo-mark" aria-hidden="true">🛡</div>
            <div>
              <div className="cs-wordmark">CodeSentinel</div>
              <div className="cs-submark">scanner · ml · llm · verify</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Pipeline indicator */}
            <div className="cs-pipeline" aria-label="Analysis pipeline">
              {['Detection', 'ML Score', 'LLM Fix', 'Verify'].map((step, i, arr) => (
                <React.Fragment key={step}>
                  <span className={`cs-pipeline-step${appState === 'done' ? ' done' : ''}`}>
                    {step}
                  </span>
                  {i < arr.length - 1 && <span className="cs-pipeline-sep">›</span>}
                </React.Fragment>
              ))}
            </div>

            <LiveFeedIndicator events={liveEvents} isDemo={isDemo} />
            <DemoModeToggle isDemo={isDemo} onToggle={handleDemoToggle} />
          </div>
        </header>

        {/* ── Split-pane layout ──────────────────────────────────────────────── */}
        <div className="cs-layout" style={{ flex: 1 }}>

          {/* LEFT RAIL ─────────────────────────────────────────────────────── */}
          <aside className="cs-rail" aria-label="Findings list">

            {/* Input section at top of rail */}
            <div style={{ borderBottom: '1px solid var(--paper-border)' }}>
              <div className="cs-rail-header">
                <div className="cs-rail-title">Submit code</div>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Meta row */}
                <div className="cs-meta-row">
                  <input
                    className="cs-meta-input"
                    placeholder="filename.py"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    aria-label="Filename"
                  />
                  <select
                    className="cs-meta-input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="Language"
                    style={{ flex: 'none', width: 90 }}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JS</option>
                    <option value="typescript">TS</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                  </select>
                </div>

                <textarea
                  className="code-textarea"
                  style={{ minHeight: 160 }}
                  placeholder="Paste code here for analysis..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Code to analyze"
                />

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    id="analyze-button"
                    className="btn-primary"
                    style={{ flex: 1 }}
                    disabled={isLoading || !code.trim()}
                    onClick={handleAnalyze}
                    aria-label="Analyze code"
                  >
                    {isLoading ? (
                      <><span className="spin">⟳</span> Analyzing…</>
                    ) : (
                      <>Analyze</>
                    )}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={loadSample}
                    aria-label="Load broken-app sample"
                    title="Load BrokenApp sample"
                  >
                    Sample
                  </button>
                </div>
              </div>
            </div>

            {/* Findings list header */}
            {appState === 'done' && items.length > 0 && (
              <>
                <div className="cs-rail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="cs-rail-title">Findings</span>
                  <span className="cs-finding-count">{items.length} total</span>
                </div>

                {/* Severity pills */}
                <div style={{ padding: '6px 16px 8px', display: 'flex', gap: 5, flexWrap: 'wrap', borderBottom: '1px solid var(--paper-border)' }}>
                  {SEV_ORDER.filter(s => counts[s] > 0).map(s => (
                    <SevPill key={s} sev={s} count={counts[s]} />
                  ))}
                </div>

                {/* Risk bar */}
                <div style={{ padding: '0 16px 10px' }}>
                  <RiskBar items={items} />
                </div>
              </>
            )}

            {/* State-driven content in rail */}
            {appState === 'idle' && !items.length && (
              <div className="cs-empty">
                <div className="cs-empty-icon">⬡</div>
                <div className="cs-empty-title">No analysis yet</div>
                <div className="cs-empty-body">
                  Paste code or load the broken-app sample, then click Analyze.
                </div>
              </div>
            )}
            {appState === 'loading' && (
              <div className="cs-loading">
                <div className="cs-loading-stage">
                  <span className="spin">⟳</span>
                  {loadingStage || 'Running pipeline…'}
                </div>
              </div>
            )}
            {appState === 'error' && (
              <div className="cs-empty">
                <div className="cs-empty-title" style={{ color: 'var(--critical)' }}>Error</div>
                <div className="cs-empty-body">{errorMsg}</div>
                <button className="btn-secondary" onClick={handleRetry}>Retry</button>
              </div>
            )}
            {appState === 'done' && items.length === 0 && (
              <div className="cs-empty">
                <div className="cs-empty-icon">✓</div>
                <div className="cs-empty-title">No issues found</div>
                <div className="cs-empty-body">The scanner, ML model, and LLM found nothing to flag.</div>
              </div>
            )}

            {/* Finding rows */}
            {items.map((item, i) => (
              <RailRow
                key={item.finding.id}
                item={item}
                active={i === selectedIdx}
                onClick={() => setSelectedIdx(i)}
              />
            ))}

            {/* Risk gauge + actions at bottom of rail */}
            {review && appState === 'done' && (
              <div style={{ padding: '16px', borderTop: '1px solid var(--paper-border)', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Aggregate Risk
                    </div>
                    <div className="cs-risk-meter">
                      <div className="cs-risk-bar-track">
                        <div
                          className="cs-risk-bar-fill"
                          style={{
                            width: `${Math.round((review.overall_risk ?? 0) * 100)}%`,
                            background: review.overall_risk > 0.7 ? 'var(--critical)' : review.overall_risk > 0.4 ? 'var(--high)' : 'var(--medium)',
                          }}
                        />
                      </div>
                      <span className="cs-risk-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>
                        {Math.round((review.overall_risk ?? 0) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 'var(--text-xs)', flex: 1 }}
                    onClick={handleOpenPR}
                    id="open-pr-button"
                  >
                    Open PR
                  </button>

                  {!showNotifyInput && !notifySent && (
                    <button
                      className="btn-notify"
                      onClick={() => setShowNotifyInput(true)}
                      id="notify-button"
                    >
                      ✉ Notify owner
                    </button>
                  )}
                  {notifySent && (
                    <span className="btn-notify sent">✓ Report sent</span>
                  )}
                </div>

                {showNotifyInput && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="cs-meta-input"
                      type="email"
                      placeholder="owner@example.com"
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleNotify()}
                      autoFocus
                      aria-label="Owner email address"
                    />
                    <button className="btn-secondary" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }} onClick={handleNotify}>
                      Send
                    </button>
                  </div>
                )}

                {pr && (
                  <div className="cs-pr-card">
                    <div className="cs-pr-header">Pull Request</div>
                    <div className="cs-pr-body">
                      {pr.pr_url ? (
                        <a className="cs-pr-link" href={pr.pr_url} target="_blank" rel="noreferrer">
                          PR #{pr.pr_number} · {pr.branch}
                        </a>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>
                          {pr.mocked ? '(mocked) ' : ''}branch: {pr.branch}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* RIGHT PANE ─────────────────────────────────────────────────────── */}
          <main id="main-content" role="main" className="cs-pane">
            {appState === 'done' && selectedItem ? (
              <FindingCard item={selectedItem} index={selectedIdx} />
            ) : appState === 'loading' ? (
              <LoadingState stage={loadingStage} />
            ) : appState === 'error' ? (
              <ErrorState message={errorMsg} onRetry={handleRetry} />
            ) : (
              <IdleState />
            )}
          </main>
        </div>

        {/* Demo banner */}
        {isDemo && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '8px 20px',
              background: 'var(--paper-dim)',
              borderTop: '1px solid var(--paper-border)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-3)',
            }}
          >
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--medium)', flexShrink: 0 }} />
            Demo mode — cached results. Toggle to LIVE to analyze real code.
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="cs-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </>
  );
}
