import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': 'var(--color-bg)',
        'dark-surface': 'var(--color-surface)',
        'light-primary': 'var(--color-text-primary)',
        'light-secondary': 'var(--color-text-secondary)',
        'accent': 'var(--color-text-accent)',
        'success': 'var(--color-status-success)',
        'warning': 'var(--color-status-warning)',
        'danger': 'var(--color-status-danger)',
        'info': 'var(--color-status-info)',
        'neutral': 'var(--color-status-neutral)',
      },
      boxShadow: {
        'card': '0 4px 6px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;