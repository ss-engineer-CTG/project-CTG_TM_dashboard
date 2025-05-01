/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // アプリケーションの色を定義 - フラット構造に修正
        background: '#1a1a1a',
        surface: '#2d2d2d',
        'text-primary': '#ffffff',
        'text-secondary': '#b3b3b3',
        'text-accent': '#60cdff',
        'status-success': '#50ff96',
        'status-warning': '#ffeb45',
        'status-danger': '#ff5f5f',
        'status-info': '#60cdff',
        'status-neutral': '#c8c8c8'
      },
      boxShadow: {
        card: '0 4px 6px rgba(0,0,0,0.3)'
      },
      animation: {
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 }
        }
      }
    },
  },
  darkMode: 'class', // ダークモード対応
  plugins: [],
}