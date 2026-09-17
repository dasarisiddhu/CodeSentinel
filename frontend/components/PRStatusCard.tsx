'use client';

import React from 'react';
import type { PRStatus } from '@/lib/types';

interface PRStatusCardProps {
  pr: PRStatus;
}

export default function PRStatusCard({ pr }: PRStatusCardProps) {
  return (
    <div
      id="pr-status-card"
      className="glass-card animate-slide-up p-4"
      role="region"
      aria-label="Pull request status"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: Icon + info */}
        <div className="flex items-start gap-3">
          {/* GitHub-style merge icon */}
          <div
            className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(124,111,247,0.15)', border: '1px solid rgba(124,111,247,0.25)' }}
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c6ff7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: '#f0f0f8' }}>
                {pr.pr_number ? `PR #${pr.pr_number} Opened` : 'Pull Request Ready'}
              </span>
              {pr.mocked && (
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{
                    background: 'rgba(255,215,0,0.10)',
                    color: '#ffd700',
                    border: '1px solid rgba(255,215,0,0.2)',
                  }}
                >
                  MOCKED
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8ea8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span
                className="text-xs font-mono"
                style={{ color: '#8a8ea8' }}
              >
                {pr.branch}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Link */}
        {pr.pr_url ? (
          <a
            id="pr-link"
            href={pr.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs flex items-center gap-1.5"
            aria-label={`Open pull request ${pr.pr_number} on GitHub`}
          >
            View PR
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ) : (
          <span
            className="text-xs px-2 py-1 rounded-md"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#50546a' }}
          >
            No URL (mocked)
          </span>
        )}
      </div>
    </div>
  );
}
