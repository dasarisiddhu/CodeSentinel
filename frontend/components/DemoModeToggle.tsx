'use client';

import React from 'react';

interface DemoModeToggleProps {
  isDemo: boolean;
  onToggle: (value: boolean) => void;
}

export default function DemoModeToggle({ isDemo, onToggle }: DemoModeToggleProps) {
  return (
    <div
      id="demo-mode-toggle"
      role="group"
      aria-label="Data source toggle"
      className="flex items-center gap-1 p-1 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <button
        id="btn-live-mode"
        onClick={() => onToggle(false)}
        aria-pressed={!isDemo}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200"
        style={
          !isDemo
            ? {
                background: 'linear-gradient(135deg, rgba(46,213,115,0.2), rgba(46,213,115,0.1))',
                color: '#2ed573',
                border: '1px solid rgba(46,213,115,0.3)',
              }
            : { color: '#50546a', border: '1px solid transparent' }
        }
      >
        {/* Live pulsing dot */}
        <span className="relative flex h-2 w-2">
          {!isDemo && (
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full"
              style={{ background: '#2ed573', opacity: 0.6 }}
            />
          )}
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: !isDemo ? '#2ed573' : '#50546a' }}
          />
        </span>
        LIVE
      </button>

      <button
        id="btn-demo-mode"
        onClick={() => onToggle(true)}
        aria-pressed={isDemo}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200"
        style={
          isDemo
            ? {
                background: 'linear-gradient(135deg, rgba(124,111,247,0.25), rgba(124,111,247,0.12))',
                color: '#a89cf8',
                border: '1px solid rgba(124,111,247,0.35)',
              }
            : { color: '#50546a', border: '1px solid transparent' }
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        DEMO
      </button>
    </div>
  );
}
