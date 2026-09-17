/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base dark palette
        bg: {
          900: '#0a0b0f',
          800: '#0f1117',
          700: '#161821',
          600: '#1e2130',
          500: '#252840',
        },
        // Accent — electric violet/blue
        accent: {
          DEFAULT: '#7c6ff7',
          light: '#a89cf8',
          dark: '#5a4fd4',
          glow: 'rgba(124,111,247,0.35)',
        },
        // Severity tokens
        severity: {
          critical: '#ff4757',
          'critical-bg': 'rgba(255,71,87,0.12)',
          high: '#ff7f50',
          'high-bg': 'rgba(255,127,80,0.12)',
          medium: '#ffd700',
          'medium-bg': 'rgba(255,215,0,0.10)',
          low: '#2ed573',
          'low-bg': 'rgba(46,213,115,0.10)',
        },
        // Glass surface
        glass: 'rgba(255,255,255,0.04)',
        'glass-border': 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'radial-glow': 'radial-gradient(ellipse at 50% 0%, rgba(124,111,247,0.15) 0%, transparent 70%)',
        'grid': "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(255 255 255 / 0.03)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e\")",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.35s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'glow-accent': '0 0 24px rgba(124,111,247,0.4)',
        'glow-critical': '0 0 16px rgba(255,71,87,0.35)',
        'glow-high': '0 0 16px rgba(255,127,80,0.3)',
        'glow-low': '0 0 16px rgba(46,213,115,0.25)',
        'glass': '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
};
