import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
