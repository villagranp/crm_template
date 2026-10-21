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
    // Sin mapas de código fuente en el build de producción (ASVS 5.0 G-17): NGINX
    // sirve todo lo que hay en `dist`, y un `.map` publica el código original.
    // Vía opcional para una herramienta de monitorización de errores:
    // `FRONTEND_BUILD_SOURCEMAP=hidden pnpm build` genera los `.map` SIN la referencia
    // `sourceMappingURL` en los bundles; el pipeline debe subirlos a esa herramienta
    // y BORRARLOS de `dist` antes de empaquetar. Apagado por defecto.
    sourcemap: process.env.FRONTEND_BUILD_SOURCEMAP === 'hidden' ? 'hidden' : false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Las pruebas de formularios de MUI en jsdom tardan varios segundos con la
    // máquina cargada (CI, suites en paralelo). 5 s por defecto daba falsos
    // rojos, y 15 s también con la suite completa (160+ archivos en paralelo): una
    // prueba colgada sigue fallando, solo que a los 30 s.
    testTimeout: 30_000,
    // JUnit output is always produced so that the Azure DevOps test tab works
    // with the generic `pnpm run test` step used by templates/verify.yml.
    reporters: ['default', ['junit', { outputFile: './junit-frontend.xml' }]],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    // `@mui/x-charts` (ADR-023) publica ESM que importa `@mui/material/styles` como directorio,
    // lo que el cargador ESM de Node rechaza (ERR_UNSUPPORTED_DIR_IMPORT). Procesarlo con Vite
    // (como hace el build) lo resuelve; no afecta al bundle de producción.
    server: { deps: { inline: [/@mui\/x-charts/, /@mui\/x-internals/] } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/test/**', '**/*.d.ts', 'src/main.tsx'],
    },
  },
});
