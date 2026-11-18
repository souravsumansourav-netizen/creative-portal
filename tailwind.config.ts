import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // deep garnet maroon: primary actions, header, accents
        maroon: {
          50: "#FBF4F5", 100: "#F6E5E7", 200: "#EBC6CB", 300: "#D9969F", 400: "#C06573",
          500: "#A44456", 600: "#8B2D3F", 700: "#7A1F2B", 800: "#631822", 900: "#4A111A",
        },
        // muted antique gold: hairlines, highlights
        gold: { 300: "#E3CB93", 400: "#D1B26B", 500: "#B8903F", 600: "#9A7530" },
        ivory: "#FAF7F2",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(74,17,26,0.05), 0 8px 24px -12px rgba(74,17,26,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
