'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FeatureWeight } from '@/lib/types';

interface FeatureImportanceChartProps {
  features: FeatureWeight[];
  title?: string;
}

// Aggregate feature weights across all findings — sum and normalize
function aggregateFeatures(features: FeatureWeight[]): FeatureWeight[] {
  const map = new Map<string, number>();
  for (const f of features) {
    map.set(f.feature, (map.get(f.feature) ?? 0) + f.weight);
  }
  const sorted = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxW = sorted[0]?.[1] ?? 1;
  return sorted.map(([feature, weight]) => ({
    feature: feature.replace(/_/g, ' '),
    weight: weight / maxW,
  }));
}

function getBarColor(weight: number): string {
  if (weight >= 0.8) return '#ff4757';
  if (weight >= 0.6) return '#ff7f50';
  if (weight >= 0.35) return '#ffd700';
  return '#7c6ff7';
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: FeatureWeight }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      className="px-3 py-2 rounded-lg text-xs"
      style={{
        background: '#1e2130',
        border: '1px solid rgba(255,255,255,0.10)',
        color: '#f0f0f8',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <p className="font-semibold mb-0.5" style={{ color: '#a89cf8' }}>
        {d.payload.feature}
      </p>
      <p>Relative weight: <strong>{Math.round(d.value * 100)}%</strong></p>
    </div>
  );
}

export default function FeatureImportanceChart({
  features,
  title = 'Top ML Risk Factors',
}: FeatureImportanceChartProps) {
  if (!features || features.length === 0) return null;

  const data = aggregateFeatures(features);

  return (
    <div
      id="feature-importance-chart"
      className="glass-card-elevated p-5 animate-fade-in"
      role="region"
      aria-label={title}
    >
      <div className="flex items-center gap-2 mb-1">
        <span aria-hidden="true" className="text-base">🤖</span>
        <h3 className="text-sm font-bold" style={{ color: '#f0f0f8' }}>
          {title}
        </h3>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'rgba(124,111,247,0.12)',
            color: '#a89cf8',
            border: '1px solid rgba(124,111,247,0.2)',
          }}
        >
          XGBoost
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: '#50546a' }}>
        Relative feature contribution to risk score — aggregated across all findings
      </p>

      <div style={{ width: '100%', height: data.length * 36 + 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            barSize={14}
          >
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: '#50546a', fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="feature"
              width={170}
              tick={{ fontSize: 11, fill: '#8a8ea8', fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={getBarColor(entry.weight)}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap" aria-label="Severity color legend">
        {[
          { label: 'Critical', color: '#ff4757' },
          { label: 'High', color: '#ff7f50' },
          { label: 'Medium', color: '#ffd700' },
          { label: 'Low/ML', color: '#7c6ff7' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: '#50546a' }}>
            <span className="w-3 h-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
