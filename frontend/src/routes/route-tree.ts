import type { RouteObject } from 'react-router-dom';

const CATCH_ALL = '*';

function joinPaths(parent: string, child: string): string {
  if (child.startsWith('/')) {
    return child;
  }
  const base = parent.endsWith('/') ? parent : `${parent}/`;
  return `${base}${child}`;
}

/**
 * Rutas navegables (absolutas) de un árbol de rutas, sin renderizar nada.
 *
 * Una ruta `index` cuenta como la de su padre; una ruta con hijas cuenta sólo
 * a través de ellas; el comodín `*` (404) no cuenta. Se usa para
 * comparar el router con el registro de rutas del backend (PLAN-ADMIN D6).
 */
export function collectNavigablePaths(routes: readonly RouteObject[], parentPath = '/'): string[] {
  return routes.flatMap((route) => {
    if (route.path === CATCH_ALL || route.path?.endsWith(`/${CATCH_ALL}`)) {
      return [];
    }
    const ownPath = route.path === undefined ? parentPath : joinPaths(parentPath, route.path);
    if (route.index) {
      return [parentPath];
    }
    // Un layout con hijas sólo es navegable a través de su ruta `index`.
    return route.children ? collectNavigablePaths(route.children, ownPath) : [ownPath];
  });
}
