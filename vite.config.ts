import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The insights API (server/) holds tokens and secrets; the browser only talks to /api.
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 8787}` },
  },
  build: {
    // Recharts (with its d3 dependencies) is the largest piece; it is cached separately.
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|zustand)\//.test(id)) return 'react';
          if (/node_modules\/(recharts|d3-|victory-vendor|lodash|react-smooth|recharts-scale|decimal\.js|eventemitter3|internmap|fast-equals|tiny-invariant|clsx)/.test(id)) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
