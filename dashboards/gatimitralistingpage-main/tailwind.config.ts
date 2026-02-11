import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          mint: "#3FE0C5",
          dark: "#1A9B85",
          light: "#E8F9F6",
        },
        accent: {
          blue: "#4A6FFF",
          purple: "#9D4EDD",
          orange: "#FF7B3A",
          red: "#FF5A7C",
        },
        neutral: {
          dark: "#1E293B",
          gray: "#64748B",
          light: "#F1F5F9",
        },
        gati: {
          primary: "#2E8B57",
          "primary-light": "#3CB371",
          "primary-dark": "#228B22",
          "primary-super-light": "#f0f9f5",
          secondary: "#FF6B6B",
          background: "#F8F9FA",
          "card-background": "#FFFFFF",
          "text-primary": "#333333",
          "text-secondary": "#666666",
          "text-light": "#888888",
          "border-color": "#E0E0E0",
          "border-light": "#f0f0f0",
          success: "#28A745",
          warning: "#FFC107",
          error: "#DC3545",
          info: "#17A2B8",
        },
      },
      boxShadow: {
        light: "0 2px 8px rgba(0, 0, 0, 0.08)",
        medium: "0 2px 12px rgba(0, 0, 0, 0.12)",
        default: "0 4px 20px rgba(0, 0, 0, 0.08)",
        hover: "0 8px 30px rgba(0, 0, 0, 0.12)",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Courier New"', 'monospace'],
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease',
        slideUp: 'slideUp 0.4s ease',
      },
      keyframes: {
        fadeIn: {
          'from': { opacity: '0', transform: 'translateY(-10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          'from': { opacity: '0', transform: 'translateY(50px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;


