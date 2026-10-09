import registry from './app-routes.registry.json';

/**
 * Rutas del frontend a las que puede apuntar una opción de menú `LINK`
 * (PLAN-ADMIN, D6). Una opción hacia una ruta sin pantalla llevaría a un 404.
 *
 * La lista vive en `app-routes.registry.json`; una prueba del frontend falla si
 * el router y el registro divergen.
 */
export interface RegisteredRoute {
  path: string;
  label: string;
}

const ROUTES: readonly RegisteredRoute[] = registry.routes;
const PATHS = new Set(ROUTES.map((route) => route.path));

export function listRegisteredRoutes(): readonly RegisteredRoute[] {
  return ROUTES;
}

export function isRegisteredRoute(path: string): boolean {
  return PATHS.has(path);
}
