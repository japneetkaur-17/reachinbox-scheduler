import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies /api and /admin to the Express backend so the browser
 * only ever talks to one origin. The auth cookie is therefore first-party and
 * no CORS dance is needed in development.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
      '/admin': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
});
