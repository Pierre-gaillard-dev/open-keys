import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const THEME_COLOR = "#0B0E13";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The update is applied on demand (UpdateBanner): never reload during practice.
      registerType: "prompt",
      // Registered by the app (virtual:pwa-register/react): no inline script, compatible with the CSP.
      injectRegister: false,
      manifest: {
        id: "/",
        name: "Open Keys",
        short_name: "Open Keys",
        description: "Apprendre le piano en mode falling notes",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell and piano samples (about 2 MB): the player starts without the network.
        // Manifest icons are added by the plugin. Fonts: only the Latin subsets, the others on first use.
        globPatterns: [
          "**/*.{js,css,html}",
          "icons/icon.svg",
          "assets/*-latin-*.woff2",
          "assets/*-latin-ext-*.woff2",
          "samples/**/*.mp3",
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        // The API is never answered by the Service Worker (offline data: phase 4, Dexie and outbox).
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && url.pathname.endsWith(".woff2"),
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: {
    // Same origin as production: /api is routed to the API container by Traefik.
    proxy: { "/api": "http://localhost:3000" },
  },
});
