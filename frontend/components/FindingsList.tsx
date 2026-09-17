'use client';

import React from 'react';
import type { FindingWithContext } from '@/lib/types';
import FindingCard from './FindingCard';

interface FindingsListProps {
  items: FindingWithContext[];
}

type Sev = 'critical' | 'high' | 'medium' | 'low';

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low'];

function countBySev(items: FindingWithContext[]): Record<Sev, number> {
  const counts: Record<Sev, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of items) {
    const sev = (item.risk?.predicted_severity ?? item.finding.tool_severity) as Sev;
    if (sev in counts) counts[sev]++;
  }
  return counts;
}

const SEV_COLORS: Record<Sev, string> = {
  critical: '#ff4757',
  high: '#ff7f50',
  medium: '#ffd700',
  low: '#2ed573',
};

export default function FindingsList({ items }: FindingsListProps) {
  // Sort by ML risk probability descending (highest risk first)
  const sorted = [...items].sort((a, b) => {
    const ra = a.risk?.risk_probability ?? 0.5;
    const rb = b.risk?.risk_probability ?? 0.5;
    return rb - ra;
  });

  const counts = countBySev(items);
  const total = items.length;

  return (
    <section id="findings-list" aria-label={`${total} finding${total !== 1 ? 's' : ''} detected`}>
      {/* ── Summary header ─────────────────────────────────────────────────── */}
      <div
        className="glass-card-elevated p-4 mb-4 animate-fade-in"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🛡️</span>
            <div>
              <h2 className="text-base font-bold" style={{ color: '#f0f0f8' }}>
                {total} issue{total !== 1 ? 's' : ''} found
              </h2>
              <p className="text-xs" style={{ color: '#8a8ea8' }}>
                Sorted by ML risk score — highest first
              </p>
            </div>
          </div>

          {/* Severity breakdown pills */}
          <div className="flex items-center gap-2 flex-wrap" aria-label="Severity breakdown">
            {SEV_ORDER.map((sev) => {
              if (counts[sev] === 0) return null;
              return (
                <div
                  key={sev}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: `${SEV_COLORS[sev]}18`,
                    color: SEV_COLORS[sev],
                    border: `1px solid ${SEV_COLORS[sev]}30`,
                  }}
                  aria-label={`${counts[sev]} ${sev} severity`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: SEV_COLORS[sev] }}
                    aria-hidden="true"
                  />
                  {counts[sev]} {sev}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mini risk bar */}
        <div className="mt-3" aria-label="Risk distribution bar">
          <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            {SEV_ORDER.map((sev) => {
              const pct = total > 0 ? (counts[sev] / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={sev}
                  style={{ width: `${pct}%`, background: SEV_COLORS[sev] }}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Cards ──────────────────────────────────────────────────────────── */}
      <div className="space-y-3 stagger-children">
        {sorted.map((item, i) => (
          <FindingCard key={item.finding.id} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}
