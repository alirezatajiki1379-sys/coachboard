import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        board: {
          navy: "#13202F",
          charcoal: "#20262E",
          green: "#2E8B57",
          line: "#DCE5DF",
          grass: "#28764A",
          paper: "#F7FAF8"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(19, 32, 47, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
