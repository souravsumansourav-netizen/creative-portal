import type { Config } from "tailwindcss";

// Apple-style system stacks: SF Pro on Apple devices, Inter (loaded via next/font) everywhere else.
const SYSTEM = ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "var(--font-sans)", "system-ui", "sans-serif"];
const DISPLAY = ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', "var(--font-sans)", "system-ui", "sans-serif"];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // the single accent: a clean, slightly brighter maroon (reads crisp on white)
        maroon: {
          50: "#FDF3F5", 100: "#FBE4E8", 200: "#F5C7D0", 300: "#E99AAA", 400: "#D2677D",
          500: "#B8344D", 600: "#A82540", 700: "#9B1C31", 800: "#7E1627", 900: "#5E101D",
        },
        // Apple's neutral greys and ink: overrides Tailwind's stone so every existing class follows
        stone: {
          50: "#FAFAFA", 100: "#F5F5F7", 200: "#E8E8ED", 300: "#D2D2D7", 400: "#86868B",
          500: "#6E6E73", 600: "#515154", 700: "#424245", 800: "#2C2C2E", 900: "#1D1D1F",
        },
        // system status colours (fills) and their darker text-safe inks
        apple: { green: "#34C759", orange: "#FF9500", blue: "#007AFF", purple: "#AF52DE", red: "#FF3B30", gray: "#8E8E93" },
        ink: { green: "#1F8A3B", orange: "#B25E00", blue: "#0058B8", purple: "#8944AB", red: "#C4001A" },
        gold: { 300: "#E3CB93", 400: "#D1B26B", 500: "#B8903F", 600: "#9A7530" },
        ivory: "#F5F5F7", // Apple's neutral canvas
      },
      fontFamily: { sans: SYSTEM, display: DISPLAY },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -10px rgba(0,0,0,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
