/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{njk,md,html,js}",
    "./netlify/edge-functions/**/*.ts",
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          50: '#f6f7f8',
          100: '#ebedf0',
          200: '#d3d7de',
          300: '#b0b8c4',
          400: '#8692a3',
          500: '#647080',
          600: '#4a5568',
          700: '#1e2530',
          800: '#13181f',
          900: '#0d1117',
          950: '#080b0f',
        },
        volt: {
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        silver: {
          300: '#c0c7d0',
          400: '#a0aab8',
          500: '#7e8a9a',
        },
        steel: {
          400: '#94a3b8',
          500: '#64748b',
        },
      },
    },
  },
  plugins: [],
};
