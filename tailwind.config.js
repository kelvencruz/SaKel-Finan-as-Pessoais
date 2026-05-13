/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Cores via CSS tokens ──────────────────────────────
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          secondary: 'var(--bg-secondary)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          hover: 'var(--surface-hover)',
        },
        border: {
          DEFAULT: 'var(--border)',
          md: 'var(--border-md)',
          strong: 'var(--border-strong)',
        },
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          light: 'var(--primary-light)',
          dark: 'var(--primary-dark)',
          glow: 'var(--primary-glow)',
        },
        success: {
          DEFAULT: 'var(--success)',
          light: 'var(--success-light)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          light: 'var(--danger-light)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          light: 'var(--warning-light)',
        },
        info: {
          DEFAULT: 'var(--info)',
          light: 'var(--info-light)',
        },
      },

      // ── Border radius via CSS tokens ──────────────────────
      borderRadius: {
        xs:   'var(--radius-xs)',
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        '2xl':'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },

      // ── Box shadow via CSS tokens ─────────────────────────
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        card: 'var(--card-shadow)',
        'card-md': 'var(--card-shadow-md)',
        'card-lg': 'var(--card-shadow-lg)',
        'glow-primary': '0 0 16px var(--primary-glow)',
      },

      // ── Font family ───────────────────────────────────────
      fontFamily: {
        main:   ['var(--font-main)'],
        arcade: ['var(--font-arcade)'],
      },

      // ── Animações ─────────────────────────────────────────
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition:  '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 4px var(--primary-glow)' },
          '50%':      { boxShadow: '0 0 16px var(--primary-glow)' },
        },
      },
      animation: {
        'fade-up':    'fadeUp .25s ease both',
        'fade-in':    'fadeIn .2s ease both',
        'scale-in':   'scaleIn .2s ease both',
        'shimmer':    'shimmer 1.4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
