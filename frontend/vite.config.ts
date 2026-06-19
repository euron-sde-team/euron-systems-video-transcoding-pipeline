import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPA talks to the pipeline API cross-origin (CORS already echoes the origin),
// so no dev proxy is needed. VITE_API_BASE only seeds the settings store on first run.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // shaka-player is inherently large (~680 kB) and already lazy-loaded into its
    // own chunk via the player route, so raise the warning bar above it.
    chunkSizeWarningLimit: 800,
  },
});
