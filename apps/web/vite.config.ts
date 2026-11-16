import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same origin as production: /api is routed to the API container by Traefik.
    proxy: { "/api": "http://localhost:3000" },
  },
});
