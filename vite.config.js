import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Local full-stack dev runs through `vercel dev`, which serves this Vite
// app and the /api functions together, so no dev proxy is configured here.
// The exception is MOCK_API=1 (`npm run dev:mock`), which proxies /api to
// the frontend-only stub in scripts/mock-api.js.
const useMockApi = process.env.MOCK_API === '1';
export default defineConfig({
  server: useMockApi ? { proxy: { '/api': 'http://localhost:5174' } } : {},
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'SunuShuttle',
        short_name: 'SunuShuttle',
        description: 'Live shuttle tracking for your campus route',
        theme_color: '#0f2c50',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(.*\.)?(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^\/api\/state/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-state', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
});
