'use client';

import React, { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import type { FindingWithContext } from '@/lib/types';

// ── Severity helpers ───────────────────────────────────────────────────────────

type Sev = 'critical' | 'high' | 'medium' | 'low';

const SEV_CONFIG: Record<Sev, { label: string; chip: string; icon: string; dot: string }> = {
  critical: { label: 'Critical', chip: 'chip-critical', icon: '🔴', dot: '#ff4757' },
  high: { label: 'High', chip: 'chip-high', icon: '🟠', dot: '#ff7f50' },
  medium: { label: 'Medium', chip: 'chip-medium', icon: '🟡', dot: '#ffd700' },
  low: { label: 'Low', chip: 'chip-low', icon: '🟢', dot: '#2ed573' },
};

const TOOL_TO_PREDICTED: Record<string, Sev> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function SeverityChip({ severity, label }: { severity: Sev; label?: string }) {
  const cfg = SEV_CONFIG[severity] ?? SEV_CONFIG.low;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.chip}`}
      role="img"
      aria-label={`Severity: ${cfg.label}`}
    >
      <span aria-hidden="true">{cfg.icon}</span>
      {label ?? cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, string> = {
    security: 'chip-critical',
    bug: 'chip-high',
    code_smell: 'chip-info',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[category] ?? 'chip-info'}`}>
      {category.replace('_', ' ')}
    </span>
  );
}

// ── Diff view (inline, color-coded) ──────────────────────────────────────────

function DiffView({ diff, verified }: { diff: string; verified: boolean }) {
  const lines = diff.split('\n');
  return (
    <div>
      {/* Verified badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={
            verified
              ? { background: 'rgba(46,213,115,0.12)', color: '#2ed573', border: '1px solid rgba(46,213,115,0.25)' }
              : { background: 'rgba(255,215,0,0.08)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.2)' }
          }
          aria-label={verified ? 'Fix verified: patch applies cleanly' : 'Fix unverified: needs manual review'}
        >
          {verified ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified fix
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Unverified — review manually
            </>
          )}
        </span>
      </div>

      {/* Diff lines */}
      <div className="code-surface overflow-x-auto" role="region" aria-label="Code diff">
        <pre className="p-3 text-xs leading-relaxed">
          {lines.map((line, i) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
            return (
              <div
                key={i}
                style={{
                  background: isAdd
                    ? 'rgba(46,213,115,0.10)'
                    : isDel
                    ? 'rgba(255,71,87,0.10)'
                    : isHeader
                    ? 'rgba(124,111,247,0.08)'
                    : 'transparent',
                  color: isAdd
                    ? '#2ed573'
                    : isDel
                    ? '#ff4757'
                    : isHeader
                    ? '#7c6ff7'
                    : '#c9d1d9',
                  padding: '0 4px',
                  borderLeft: isAdd
                    ? '2px solid #2ed573'
                    : isDel
                    ? '2px solid #ff4757'
                    : '2px solid transparent',
                  marginLeft: '-4px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {line || ' '}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

// ── Main FindingCard ──────────────────────────────────────────────────────────

interface FindingCardProps {
  item: FindingWithContext;
  index: number;
}

export default function FindingCard({ item, index }: FindingCardProps) {
  const { finding, risk, explanation } = item;
  const [expanded, setExpanded] = useState(index === 0);
  const [showDiff, setShowDiff] = useState(false);

  const toolSev = (finding.tool_severity as Sev) ?? 'low';
  const mlSev = (risk?.predicted_severity as Sev) ?? TOOL_TO_PREDICTED[finding.tool_severity] ?? 'low';

  const cardId = `finding-card-${finding.id}`;
  const toggleId = `finding-toggle-${finding.id}`;
  const bodyId = `finding-body-${finding.id}`;

  return (
    <article
      id={cardId}
      className="glass-card animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
      aria-labelledby={toggleId}
    >
      {/* ── Header (always visible) ─────────────────────────────────────────── */}
      <button
        id={toggleId}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        {/* Severity dot */}
        <span
          className="flex-shrink-0 w-2 h-2 rounded-full mt-2"
          style={{ background: SEV_CONFIG[mlSev]?.dot ?? '#50546a' }}
          aria-hidden="true"
        />

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <CategoryBadge category={finding.category} />
            <span
              className="text-xs font-mono"
              style={{ color: '#50546a' }}
              aria-label={`Rule: ${finding.rule_id}`}
            >
              {finding.rule_id.split('.').pop()}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug" style={{ color: '#f0f0f8' }}>
            {finding.message}
          </p>
          <p className="text-xs mt-1 font-mono" style={{ color: '#50546a' }}>
            {finding.file}:{finding.line_start}
            {finding.line_end !== finding.line_start && `–${finding.line_end}`}
          </p>
        </div>

        {/* Severity chips — ALWAYS show both, side by side */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5" aria-label="Severity scores">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: '#50546a' }}>Scanner</span>
            <SeverityChip severity={toolSev} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: '#7c6ff7' }}>ML</span>
            <SeverityChip severity={mlSev} />
          </div>
          {risk && (
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: SEV_CONFIG[mlSev]?.dot ?? '#50546a' }}
              aria-label={`Risk probability: ${Math.round(risk.risk_probability * 100)}%`}
            >
              {Math.round(risk.risk_probability * 100)}%
            </span>
          )}
        </div>

        {/* Chevron */}
        <span
          className="flex-shrink-0 mt-1 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#50546a" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* ── Expandable body ─────────────────────────────────────────────────── */}
      {expanded && (
        <div
          id={bodyId}
          className="px-4 pb-4 space-y-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
        >
          {/* Code snippet */}
          <div className="pt-3">
            <p className="text-xs font-semibold mb-2" style={{ color: '#8a8ea8' }}>
              ⚠ Flagged code
            </p>
            <div className="code-surface overflow-hidden">
              <SyntaxHighlighter
                language="python"
                style={atomOneDark}
                customStyle={{
                  background: 'transparent',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.6',
                }}
                showLineNumbers={false}
              >
                {finding.code_snippet}
              </SyntaxHighlighter>
            </div>
          </div>

          {/* Explanation */}
          {explanation && (
            <div className="space-y-3">
              <div
                className="p-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p className="text-xs font-semibold mb-1.5" style={{ color: '#8a8ea8' }}>
                  📖 What this means
                </p>
                <p className="text-sm leading-relaxed" style={{ color: '#c9d1d9' }}>
                  {explanation.plain_english_explanation}
                </p>
              </div>

              {explanation.severity_rationale && (
                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'rgba(124,111,247,0.05)', border: '1px solid rgba(124,111,247,0.12)' }}
                >
                  <p className="text-xs font-semibold mb-1" style={{ color: '#7c6ff7' }}>
                    🧠 Why this severity?
                  </p>
                  <p className="text-sm" style={{ color: '#c9d1d9' }}>
                    {explanation.severity_rationale}
                  </p>
                </div>
              )}

              {explanation.fix_suggestion && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#8a8ea8' }}>
                    💡 Suggested fix
                  </p>
                  <p className="text-sm mb-3" style={{ color: '#c9d1d9' }}>
                    {explanation.fix_suggestion}
                  </p>

                  {explanation.fix_diff && (
                    <>
                      <button
                        id={`diff-toggle-${finding.id}`}
                        onClick={() => setShowDiff((v) => !v)}
                        className="btn-ghost text-xs mb-2"
                        aria-expanded={showDiff}
                        aria-controls={`diff-${finding.id}`}
                      >
                        {showDiff ? '▲ Hide diff' : '▼ Show diff'}
                      </button>

                      {showDiff && (
                        <div id={`diff-${finding.id}`}>
                          <DiffView diff={explanation.fix_diff} verified={explanation.verified} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ML feature importance for this finding */}
          {risk?.top_contributing_features && risk.top_contributing_features.length > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{ background: 'rgba(124,111,247,0.04)', border: '1px solid rgba(124,111,247,0.10)' }}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: '#7c6ff7' }}>
                🤖 ML risk factors
              </p>
              <div className="space-y-1.5">
                {risk.top_contributing_features.map((f) => (
                  <div key={f.feature} className="flex items-center gap-2">
                    <span
                      className="text-xs font-mono flex-1 truncate"
                      style={{ color: '#8a8ea8' }}
                      title={f.feature}
                    >
                      {f.feature.replace(/_/g, ' ')}
                    </span>
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.round(f.weight * 80)}px`,
                        background: `rgba(124,111,247,${0.3 + f.weight * 0.7})`,
                        minWidth: '8px',
                      }}
                      aria-label={`Weight: ${Math.round(f.weight * 100)}%`}
                    />
                    <span
                      className="text-xs font-mono w-9 text-right"
                      style={{ color: '#50546a' }}
                    >
                      {Math.round(f.weight * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
