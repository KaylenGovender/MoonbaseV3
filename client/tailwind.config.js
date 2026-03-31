/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#04091a',
          900: '#0a1628',
          800: '#0d1f3c',
          700: '#112240',
          600: '#1a3357',
          500: '#1e3a5f',
        },
        oxygen:  { DEFAULT: '#7dd3fc', dark: '#0284c7' },
        water:   { DEFAULT: '#3b82f6', dark: '#1d4ed8' },
        iron:    { DEFAULT: '#fb923c', dark: '#c2410c' },
        helium:  { DEFAULT: '#ef4444', dark: '#b91c1c' },
        neon:    { blue: '#38bdf8', green: '#4ade80', yellow: '#facc15' },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 5px #38bdf8, 0 0 10px #38bdf8' },
          '100%': { boxShadow: '0 0 20px #38bdf8, 0 0 40px #38bdf8' },
        },
      },
    },
  },
  plugins: [],
};
