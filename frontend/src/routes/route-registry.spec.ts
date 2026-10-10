import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getShellNavigablePaths } from './app-routes';
import { collectNavigablePaths } from './route-tree';

/**
 * PLAN-ADMIN D6: una opción de menú sólo puede apuntar a una ruta registrada
 * en el backend. Si el router tiene una pantalla que no está en el registro,
 * no se le puede crear opción; si el registro tiene una ruta sin pantalla, una
 * opción llevaría a un 404. Esta prueba rompe el CI en ambos casos.
 */
const REGISTRY_PATH = resolve(__dirname, '../../../backend/src/modules/access/app-routes.registry.json');

interface RouteRegistry {
  routes: { path: string; label: string }[];
}

function readRegistryPaths(): string[] {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as RouteRegistry;
  return registry.routes.map((route) => route.path);
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((path) => !rightSet.has(path)).sort();
}

describe('registro de rutas (PLAN-ADMIN D6)', () => {
  it('el router del shell y app-routes.registry.json declaran exactamente las mismas rutas', () => {
    const routerPaths = getShellNavigablePaths();
    const registryPaths = readRegistryPaths();

    const missingInRegistry = difference(routerPaths, registryPaths);
    const missingInRouter = difference(registryPaths, routerPaths);

    const problems = [
      missingInRegistry.length > 0
        ? `Rutas del router que faltan en app-routes.registry.json: ${missingInRegistry.join(', ')}`
        : null,
      missingInRouter.length > 0
        ? `Rutas del registro sin pantalla en app-routes.tsx: ${missingInRouter.join(', ')}`
        : null,
    ].filter((problem): problem is string => problem !== null);

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('el router no declara la misma ruta dos veces', () => {
    const routerPaths = getShellNavigablePaths();
    expect(routerPaths).toHaveLength(new Set(routerPaths).size);
  });
});

describe('collectNavigablePaths', () => {
  it('resuelve index, rutas relativas y absolutas e ignora el comodín 404', () => {
    const paths = collectNavigablePaths(
      [
        { index: true },
        { path: '/absoluta' },
        { path: 'grupo', children: [{ index: true }, { path: 'hija' }, { path: '*' }] },
        { children: [{ path: 'sin-layout' }] },
        { path: '*' },
      ],
      '/',
    );

    expect(paths).toEqual(['/', '/absoluta', '/grupo', '/grupo/hija', '/sin-layout']);
  });
});
