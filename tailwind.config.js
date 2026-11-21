/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#07090E',
        surface: {
          DEFAULT: '#0D111A',
          hover: '#131926',
          card: '#0F1522',
          border: '#1E293B',
          muted: '#182133',
        },
        trade: {
          green: '#00F0A8',
          greenDark: '#059669',
          greenGlow: 'rgba(0, 240, 168, 0.15)',
          red: '#F43F5E',
          redDark: '#BE123C',
          redGlow: 'rgba(244, 63, 94, 0.15)',
          yellow: '#F59E0B',
          blue: '#38BDF8',
          purple: '#A855F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 240, 168, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 240, 168, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
