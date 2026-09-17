'use client';

import React from 'react';

interface RiskGaugeProps {
  probability: number; // 0.0 – 1.0
  size?: number;
}

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

function getRiskLevel(p: number): RiskLevel {
  if (p >= 0.8) return 'critical';
  if (p >= 0.6) return 'high';
  if (p >= 0.35) return 'medium';
  return 'low';
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; glow: string }> = {
  critical: { label: 'Critical Risk', color: '#ff4757', glow: 'rgba(255,71,87,0.4)' },
  high: { label: 'High Risk', color: '#ff7f50', glow: 'rgba(255,127,80,0.35)' },
  medium: { label: 'Medium Risk', color: '#ffd700', glow: 'rgba(255,215,0,0.3)' },
  low: { label: 'Low Risk', color: '#2ed573', glow: 'rgba(46,213,115,0.25)' },
};

export default function RiskGauge({ probability, size = 160 }: RiskGaugeProps) {
  const level = getRiskLevel(probability);
  const { label, color, glow } = RISK_CONFIG[level];

  const pct = Math.max(0, Math.min(1, probability));
  const pctDisplay = Math.round(pct * 100);

  // Arc geometry — 240° sweep starting at 150° (bottom-left)
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.72;
  const strokeWidth = size * 0.075;
  const sweepDeg = 240;
  const startAngle = 150; // degrees, 0 = right

  function polarToXY(angleDeg: number, radius: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  function describeArc(startDeg: number, endDeg: number, radius: number) {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const trackPath = describeArc(startAngle, startAngle + sweepDeg, r);
  const fillEndAngle = startAngle + pct * sweepDeg;
  const fillPath = pct > 0 ? describeArc(startAngle, Math.min(fillEndAngle, startAngle + sweepDeg - 0.01), r) : '';

  // Needle endpoint
  const needleAngle = startAngle + pct * sweepDeg;
  const needleEnd = polarToXY(needleAngle, r * 0.62);

  return (
    <div
      id="risk-gauge"
      role="img"
      aria-label={`Overall risk score: ${pctDisplay}% — ${label}`}
      className="flex flex-col items-center gap-1 animate-fade-in"
    >
      <svg
        width={size}
        height={size * 0.75}
        viewBox={`0 0 ${size} ${size * 0.75}`}
        className="gauge-svg overflow-visible"
        aria-hidden="true"
      >
        {/* Glow filter */}
        <defs>
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Fill arc */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        )}

        {/* Needle dot */}
        {pct > 0 && (
          <circle
            cx={needleEnd.x}
            cy={needleEnd.y}
            r={strokeWidth * 0.55}
            fill={color}
            filter="url(#gauge-glow)"
          />
        )}

        {/* Center text */}
        <text
          x={cx}
          y={cy * 0.98}
          textAnchor="middle"
          fontSize={size * 0.2}
          fontWeight="700"
          fill={color}
          fontFamily="Inter, sans-serif"
        >
          {pctDisplay}%
        </text>
        <text
          x={cx}
          y={cy * 0.98 + size * 0.14}
          textAnchor="middle"
          fontSize={size * 0.09}
          fill="#8a8ea8"
          fontFamily="Inter, sans-serif"
        >
          risk score
        </text>
      </svg>

      {/* Label pill */}
      <span
        className="text-xs font-bold px-3 py-1 rounded-full"
        style={{
          background: `${color}18`,
          color,
          border: `1px solid ${color}30`,
          boxShadow: `0 0 12px ${glow}`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
