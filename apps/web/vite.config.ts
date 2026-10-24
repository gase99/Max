import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * The calculation engine is consumed from source so that a fresh clone can run
 * `npm run dev`, the tests and the production build without first having to
 * generate `packages/engine/dist`. The published `dist` build is still produced
 * by `npm run build:engine` for type declarations and external consumers.
 */
const engineSource = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@cabinet/engine': engineSource } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The Arena preview proxies through https://<port>-<id>.e2b.app
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true,
  },
  // Relative asset URLs. The production bundle is loaded both over http
  // (web/preview) and over file:// inside the Electron shell; with the default
  // absolute base ('/'), the file:// build resolves /assets/... against the
  // filesystem root and the application never mounts. See
  // docs/07-windows-release.md for the incident.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
