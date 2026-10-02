/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite configuration.
 *
 * The dev server proxies `/api` to the backend so that local development uses
 * the same relative base URL as the NGINX-fronted deployment. This keeps
 * `VITE_API_BASE_URL` identical across environments and avoids CORS in dev.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.DEV_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // JUnit output is always produced so that the Azure DevOps test tab works
    // with the generic `pnpm run test` step used by templates/verify.yml.
    reporters: ['default', ['junit', { outputFile: './junit-frontend.xml' }]],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/test/**', '**/*.d.ts', 'src/main.tsx'],
    },
  },
});
