import type { RouteObject } from 'react-router-dom';

import { ADMIN_ROUTES } from '@/features/admin/admin-routes';
import { CRM_ROUTES } from '@/features/crm/crm-routes';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { collectNavigablePaths } from '@/routes/route-tree';

/**
 * Rutas navegables del shell calculadas **sin importar ninguna página**: el
 * mismo resultado que `getShellNavigablePaths()` de `app-routes.tsx`, pero
 * sin su árbol de elementos.
 *
 * Existe para que una pantalla pueda preguntar si una ruta está registrada
 * (el Panel de control, 01 §E.7, `features/dashboard/source-routes.ts`) sin
 * un import circular: `app-routes.tsx` importa la propia `HomePage`, y el
 * ciclo dejaba `HomePage` sin definir al construir `shellRoutes`.
 *
 * `route-registry.spec.ts` comprueba que coincide exactamente con
 * `getShellNavigablePaths()`: si se añade una ruta al shell fuera de
 * `ADMIN_ROUTES`/`CRM_ROUTES`, hay que añadirla también aquí.
 */
const SHELL_PATH_TREE: RouteObject[] = [
  { index: true },
  ...[...ADMIN_ROUTES, ...CRM_ROUTES].map(({ path }) => ({ path })),
  { path: '*' },
];

export function getShellNavigablePathsWithoutPages(): string[] {
  return collectNavigablePaths(SHELL_PATH_TREE, ROUTE_PATHS.home);
}
