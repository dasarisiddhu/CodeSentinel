'use client';

import React, { useId } from 'react';

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
];

interface CodeInputProps {
  code: string;
  language: string;
  filename: string;
  isLoading: boolean;
  onCodeChange: (code: string) => void;
  onLanguageChange: (lang: string) => void;
  onFilenameChange: (name: string) => void;
  onAnalyze: () => void;
}

export default function CodeInput({
  code,
  language,
  filename,
  isLoading,
  onCodeChange,
  onLanguageChange,
  onFilenameChange,
  onAnalyze,
}: CodeInputProps) {
  const textareaId = useId();
  const langId = useId();
  const fileId = useId();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading && code.trim()) onAnalyze();
    }
    // Tab key inserts spaces instead of changing focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = code.substring(0, start) + '    ' + code.substring(end);
      onCodeChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <section
      id="code-input-section"
      aria-label="Code input panel"
      className="glass-card-elevated p-5"
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label
            htmlFor={fileId}
            className="block text-xs font-medium mb-1.5"
            style={{ color: '#8a8ea8' }}
          >
            Filename
          </label>
          <input
            id={fileId}
            type="text"
            value={filename}
            onChange={(e) => onFilenameChange(e.target.value)}
            placeholder="config.py"
            className="w-full px-3 py-2 rounded-md text-sm font-mono"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#c9d1d9',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(124,111,247,0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            disabled={isLoading}
          />
        </div>

        <div className="w-40">
          <label
            htmlFor={langId}
            className="block text-xs font-medium mb-1.5"
            style={{ color: '#8a8ea8' }}
          >
            Language
          </label>
          <div className="relative">
            <select
              id={langId}
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-md text-sm appearance-none pr-8"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#c9d1d9',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value} style={{ background: '#161821' }}>
                  {l.label}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8ea8" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <label htmlFor={textareaId} className="sr-only">
          Paste source code to analyze
        </label>
        <textarea
          id={textareaId}
          className="code-textarea w-full"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`# Paste your source code here, or wait for a file to arrive from BrokenApp…\n# Tip: Ctrl+Enter to analyze`}
          disabled={isLoading}
          spellCheck={false}
          rows={14}
          aria-describedby="code-input-hint"
        />
        {/* Line count badge */}
        {code.trim() && (
          <span
            aria-hidden="true"
            className="absolute bottom-3 right-3 text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#50546a' }}
          >
            {lineCount}L
          </span>
        )}
      </div>

      <p id="code-input-hint" className="sr-only">
        Press Ctrl+Enter or click Analyze to submit. Tab key inserts 4 spaces.
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
        {/* Stats */}
        <div className="flex items-center gap-4">
          {code.trim() ? (
            <>
              <span className="text-xs" style={{ color: '#50546a' }}>
                {code.length.toLocaleString()} chars · {lineCount} lines
              </span>
              <button
                onClick={() => onCodeChange('')}
                className="text-xs"
                style={{ color: '#50546a', background: 'none', border: 'none', cursor: 'pointer' }}
                disabled={isLoading}
                aria-label="Clear code input"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-xs" style={{ color: '#50546a' }}>
              Paste code or wait for BrokenApp to push
            </span>
          )}
        </div>

        {/* Analyze button */}
        <button
          id="analyze-button"
          onClick={onAnalyze}
          disabled={isLoading || !code.trim()}
          className="btn-primary"
          aria-label="Analyze code for vulnerabilities"
        >
          {isLoading ? (
            <>
              <span
                className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                aria-hidden="true"
              />
              Analyzing…
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Analyze
            </>
          )}
        </button>
      </div>
    </section>
  );
}
