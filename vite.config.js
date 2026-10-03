import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Replaces the hand-rolled sw.js: hashed asset names make the old ?v=N cache
    // busting unnecessary, and autoUpdate swaps in a new build on next load.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.json is linked from index.html as before
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff2}'],
        // The HEIC converter and PDF.js are large and only loaded when a photo
        // or PDF needs them, so they're cached on first use instead (below).
        globIgnores: ['**/heic2any-*.js', '**/pdf*.mjs', '**/pdf*.js'],
        navigateFallback: '/index.html',
        // The old worker answered every GET network-first with a cache fallback,
        // so the app still opened offline with the last data it saw. Keep that.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/(heic2any|pdf).*\.m?js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'strpal-lazy-libs', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/'),
            handler: 'CacheFirst',
            options: { cacheName: 'strpal-photos', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'strpal-data', networkTimeoutSeconds: 8 },
          },
        ],
      },
    }),
  ],
});
