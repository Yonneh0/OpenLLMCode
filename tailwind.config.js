/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}', './electron/**/*.ts'],
  theme: {
    extend: {
      colors: {
        // VS Code-inspired dark palette
        bg: '#1e1e2e',
        'bg-subtle': '#181825',
        'bg-surface': '#313244',
        border: '#45475a',
        text: '#cdd6f4',
        'text-muted': '#a6adc8',
        accent: '#cba6f7', // Purple (LavaCat)
        success: '#a6e3a1',
        warning: '#f9e2af',
        error: '#f38ba8',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
    },
  },
  plugins: [],
};