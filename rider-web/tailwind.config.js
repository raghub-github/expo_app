/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5f5',
          100: '#ffe5e5',
          200: '#ffcccc',
          300: '#ff9999',
          400: '#ff6666',
          500: '#FF4D4D',
          600: '#e63946',
          700: '#cc2e3a',
          800: '#b32a37',
          900: '#99232f',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(to right, #FF4D4D, #FF8A4D, #FFD24D)',
        'gradient-brand-reverse': 'linear-gradient(135deg, #FF4D4D 0%, #FF8A4D 50%, #FFD24D 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
