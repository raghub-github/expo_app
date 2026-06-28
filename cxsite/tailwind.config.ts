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
        mint: "#16c2a5",
        "mint-light": "#e8fffb",
        purple: "#4b2ad4",
        "purple-light": "#f0edff",
        pink: "#ff4d8d",
        gold: "#ffc107",
        bg: "#f6f8fb",
        border: "#dcd6ff",
        text: "#1e1e2f",
        "text-light": "#5a5a7a",
        white: "#ffffff",
        "nav-bg": "rgba(255, 255, 255, 0.95)",
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
        roboto: ['Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

