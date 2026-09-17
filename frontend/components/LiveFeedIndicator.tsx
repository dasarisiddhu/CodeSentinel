'use client';

import React, { useEffect, useState } from 'react';
import type { LiveFeedEvent } from '@/lib/types';

interface LiveFeedIndicatorProps {
  events: LiveFeedEvent[];
  isDemo?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function LiveFeedIndicator({ events, isDemo = false }: LiveFeedIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const latest = events[events.length - 1];

  useEffect(() => {
    if (latest) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(t);
    }
  }, [latest?.timestamp]);

  if (!latest) return null;

  return (
    <div
      id="live-feed-indicator"
      aria-live="polite"
      aria-label={`Live code received from ${latest.source}`}
      className="animate-slide-in-right"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs"
        style={{
          background: 'rgba(46,213,115,0.08)',
          border: '1px solid rgba(46,213,115,0.2)',
        }}
      >
        {/* Pulsing dot */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full"
            style={{ background: '#2ed573', opacity: 0.5 }}
          />
          <span
            className="relative inline-flex rounded-full h-2.5 w-2.5"
            style={{ background: '#2ed573' }}
          />
        </span>

        <span style={{ color: '#2ed573', fontWeight: 600 }}>
          {isDemo ? 'DEMO' : 'LIVE'}
        </span>

        <span style={{ color: '#8a8ea8' }}>
          Code received from{' '}
          <span style={{ color: '#f0f0f8', fontFamily: 'JetBrains Mono, monospace' }}>
            {latest.filename.split('/').pop()}
          </span>
          {' '}via{' '}
          <span style={{ color: '#f0f0f8' }}>
            {latest.source === 'watcher' ? 'File Watcher' : 'GitHub Webhook'}
          </span>
          {' '}at{' '}
          <span style={{ color: '#f0f0f8', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(latest.timestamp)}
          </span>
        </span>
      </div>
    </div>
  );
}
