import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * PF-05.47 (arquitectura, ADR-023, AC-05.47): `@mui/x-charts` sólo en su edición **Community**,
 * cargada en **diferido**, y el embudo con barras horizontales (nunca `FunnelChart`, que es Pro).
 * Lee el código fuente: falla si alguien importa la edición Pro/Premium, el `FunnelChart`, o la
 * librería fuera de las tres implementaciones que sólo `LazyCharts` carga con `import()`.
 */

/** Vitest corre desde la raíz del paquete del frontend (también con `pnpm test` en la raíz del monorepo). */
const FRONTEND_ROOT = process.cwd();
const SRC = join(FRONTEND_ROOT, 'src');
const CHARTS_DIR = 'src/features/crm/reports/charts';
const IMPLEMENTATIONS = ['ReportBarChart.tsx', 'ReportLineChart.tsx', 'ReportComboChart.tsx'].map((file) => `${CHARTS_DIR}/${file}`);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [path] : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({ path: relative(FRONTEND_ROOT, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }));
const STATIC_IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function staticImports(text: string): string[] {
  return [...text.matchAll(STATIC_IMPORT)].map((match) => match[1] as string);
}

describe('PF-05.47: @mui/x-charts Community en diferido (ADR-023)', () => {
  it('package.json fija @mui/x-charts exacta y no declara las ediciones Pro/Premium', () => {
    const pkg = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('@app/frontend');
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all['@mui/x-charts']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(all).filter((name) => /^@mui\/x-charts-(pro|premium)/.test(name))).toEqual([]);
  });

  it('ningún archivo importa la edición Pro/Premium ni el FunnelChart', () => {
    const offenders = FILES.filter(({ text }) => /@mui\/x-charts-(pro|premium)/.test(text) || /\bFunnelChart\b[^;]*from\s+['"]@mui\/x-charts/.test(text) || /@mui\/x-charts[^'"]*\/FunnelChart/.test(text));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it('sólo las tres implementaciones importan @mui/x-charts, y sólo LazyCharts las carga (con import() diferido)', () => {
    const importers = FILES.filter(({ text }) => staticImports(text).some((source) => source.startsWith('@mui/x-charts'))).map((file) => file.path);
    expect(importers.sort()).toEqual([...IMPLEMENTATIONS].sort());

    const implementationNames = IMPLEMENTATIONS.map((path) => path.split('/').pop()?.replace(/\.tsx$/, '') as string);
    const staticUsers = FILES.filter(({ path, text }) => !IMPLEMENTATIONS.includes(path) && staticImports(text).some((source) => implementationNames.some((name) => source.endsWith(`/${name}`))));
    expect(staticUsers.map((file) => file.path)).toEqual([]);

    const lazyCharts = FILES.find((file) => file.path === `${CHARTS_DIR}/LazyCharts.tsx`);
    const dynamic = [...(lazyCharts?.text ?? '').matchAll(DYNAMIC_IMPORT)].map((match) => match[1]);
    expect(dynamic).toEqual(['./ReportBarChart', './ReportLineChart', './ReportComboChart']);
  });

  it('el embudo usa la barra con layout="horizontal" y las páginas de dashboard y embudo son lazy en sus rutas', () => {
    const funnel = FILES.find((file) => file.path === 'src/features/crm/reports/funnel/FunnelChart.tsx')?.text ?? '';
    expect(funnel).toContain('LazyBarChart');
    expect(funnel).toMatch(/layout="horizontal"/);

    const routes = FILES.find((file) => file.path === 'src/features/crm/reports/reports-routes.ts')?.text ?? '';
    expect(routes).toMatch(/lazy\(\(\) => import\('\.\/dashboard\/CommercialDashboardPage'\)/);
    expect(routes).toMatch(/lazy\(\(\) => import\('\.\/funnel\/SalesFunnelPage'\)/);
    expect(staticImports(routes).some((source) => /dashboard|funnel|charts/.test(source))).toBe(false);
  });
});
