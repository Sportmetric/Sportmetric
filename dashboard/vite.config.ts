import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the built app working when opened from any folder or static host.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, open: false },
  build: {
    // Older iPhones / Android WebViews
    target: ["es2019", "safari13", "chrome80"],
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          motion: ["framer-motion"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
