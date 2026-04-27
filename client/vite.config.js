import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(platformRoot, '..');
/** Sibling: ../GA_Cashflow_V1_React (embedded in vault — not iframe /v1). */
const gaV1Src = path.join(workspaceRoot, 'GA_Cashflow_V1_React', 'src');
const api = 'http://127.0.0.1:3020';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: { '@gaV1': gaV1Src },
    dedupe: ['react', 'react-dom']
  },
  server: {
    host: true,
    port: 5180,
    fs: { allow: [platformRoot, workspaceRoot, gaV1Src] },
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/legacy': { target: api, changeOrigin: true }
    }
  },
  preview: {
    host: true,
    port: 5180,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/legacy': { target: api, changeOrigin: true }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 }
});
