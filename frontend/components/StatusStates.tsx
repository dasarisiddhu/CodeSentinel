'use client';

import React from 'react';

// ── Loading ────────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'semgrep', label: 'Running Semgrep & Bandit…', icon: '🔍' },
  { key: 'ml', label: 'Scoring risk with ML model…', icon: '🤖' },
  { key: 'llm', label: 'Drafting explanations & fixes…', icon: '✍️' },
  { key: 'verify', label: 'Verifying fix patches…', icon: '✅' },
];

interface LoadingStateProps {
  stage?: string;
}

export function LoadingState({ stage }: LoadingStateProps) {
  const currentIdx = stage === 'pending' ? 0 : 0;

  return (
    <div
      id="loading-state"
      role="status"
      aria-live="polite"
      aria-label="Analysis in progress"
      className="glass-card-elevated p-8 flex flex-col items-center gap-6 animate-fade-in"
    >
      {/* Spinner ring */}
      <div className="relative w-16 h-16">
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            background: 'conic-gradient(from 0deg, #7c6ff7, transparent)',
          }}
        />
        <div
          className="absolute inset-1 rounded-full"
          style={{ background: '#0f1117' }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl"
          aria-hidden="true"
        >
          🛡️
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold mb-1" style={{ color: '#f0f0f8' }}>
          Analyzing your code
        </h2>
        <p className="text-sm" style={{ color: '#8a8ea8' }}>
          Running the full pipeline — typically 5–15s
        </p>
      </div>

      {/* Stage progress */}
      <div className="w-full max-w-sm space-y-2.5">
        {STAGES.map((s, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div
              key={s.key}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
              style={{
                background: isActive
                  ? 'rgba(124,111,247,0.10)'
                  : isDone
                  ? 'rgba(46,213,115,0.06)'
                  : 'rgba(255,255,255,0.02)',
                border: isActive
                  ? '1px solid rgba(124,111,247,0.25)'
                  : '1px solid transparent',
                opacity: i > currentIdx + 1 ? 0.35 : 1,
              }}
            >
              <span className="text-base w-5 text-center" aria-hidden="true">
                {isDone ? '✅' : s.icon}
              </span>
              <span
                className="text-sm"
                style={{
                  color: isActive ? '#a89cf8' : isDone ? '#2ed573' : '#50546a',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {s.label}
              </span>
              {isActive && (
                <span className="ml-auto">
                  <span
                    className="w-3.5 h-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin block"
                    style={{ borderTopColor: '#7c6ff7', borderColor: 'rgba(124,111,247,0.2)' }}
                    aria-hidden="true"
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Skeleton preview */}
      <div className="w-full space-y-2" aria-hidden="true">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
      </div>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      id="error-state"
      role="alert"
      aria-live="assertive"
      className="glass-card-elevated p-8 flex flex-col items-center gap-5 animate-fade-in text-center"
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.25)' }}
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2" style={{ color: '#ff4757' }}>
          Analysis failed
        </h2>
        <p
          className="text-sm max-w-md font-mono px-3 py-2 rounded-lg"
          style={{
            color: '#c9d1d9',
            background: 'rgba(255,71,87,0.06)',
            border: '1px solid rgba(255,71,87,0.15)',
          }}
        >
          {message}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button id="retry-button" className="btn-primary" onClick={onRetry} aria-label="Retry analysis">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Retry
        </button>
        <span className="text-xs" style={{ color: '#50546a' }}>
          or switch to Demo Mode ↑
        </span>
      </div>
    </div>
  );
}

// ── Empty (no issues found) ────────────────────────────────────────────────────

export function EmptyState() {
  return (
    <div
      id="empty-state"
      role="status"
      aria-live="polite"
      className="glass-card-elevated p-10 flex flex-col items-center gap-4 animate-fade-in text-center"
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(46,213,115,0.12)', border: '1px solid rgba(46,213,115,0.25)' }}
        aria-hidden="true"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2ed573" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: '#2ed573' }}>
          No issues found
        </h2>
        <p className="text-sm" style={{ color: '#8a8ea8' }}>
          Semgrep, Bandit, and Radon found nothing to flag in this code.
        </p>
        <p className="text-xs mt-1" style={{ color: '#50546a' }}>
          This is a legitimate result — a clean file should say so clearly.
        </p>
      </div>
    </div>
  );
}

// ── Idle (initial) ────────────────────────────────────────────────────────────

export function IdleState() {
  return (
    <div
      id="idle-state"
      aria-label="Waiting for code input"
      className="glass-card p-10 flex flex-col items-center gap-4 text-center border-dashed"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div aria-hidden="true" className="text-4xl opacity-30">🛡️</div>
      <div>
        <p className="text-sm font-medium" style={{ color: '#50546a' }}>
          Paste code above and click <strong style={{ color: '#8a8ea8' }}>Analyze</strong>
        </p>
        <p className="text-xs mt-1" style={{ color: '#50546a' }}>
          Or enable the BrokenApp file-watcher and code will arrive automatically.
        </p>
      </div>
    </div>
  );
}
