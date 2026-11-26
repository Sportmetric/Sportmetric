/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Unbounded"', '"Syncopate"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        navy: { 950: "#0B1033", 900: "#141A4A" },
        plum: { 800: "#2A1260", 600: "#5B2A9E" },
        glow: { cyan: "#5EE7FF", violet: "#A78BFA", pink: "#F472B6", mint: "#5EF2B5", amber: "#FFC56B", rose: "#FF6B8B" },
      },
      boxShadow: {
        glass: "0 10px 40px -10px rgba(5, 8, 40, 0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
        glow: "0 0 0 1px rgba(167,139,250,0.45), 0 8px 30px -6px rgba(167,139,250,0.55)",
      },
    },
  },
  plugins: [],
};
