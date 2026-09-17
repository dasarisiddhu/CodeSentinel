import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CodeSentinel — AI Code Review & Vulnerability Detection',
  description:
    'Deterministic scanner finds it. A trained risk model prioritizes it. The LLM only explains and drafts a fix for what the first two already confirmed. Zero hallucinated vulnerabilities.',
  keywords: ['code review', 'vulnerability detection', 'static analysis', 'security', 'AI'],
  authors: [{ name: 'CodeSentinel Team' }],
  openGraph: {
    title: 'CodeSentinel',
    description: 'AI Code Review & Vulnerability Detection Agent',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-900 text-white antialiased">
        {/* Radial ambient glow behind hero */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(124,111,247,0.18) 0%, transparent 70%)',
          }}
        />
        {/* Dot-grid texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 opacity-40"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(255 255 255 / 0.03)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e\")",
          }}
        />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
