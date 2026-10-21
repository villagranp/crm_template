import { ROUTE_PATHS } from '@/routes/route-paths';

/**
 * Ruta de retorno del inicio de sesión por redirección (Entra ID).
 *
 * Con un proveedor de redirección la página se descarga al ir a Microsoft, así que el estado de
 * React Router (`location.state.from`) se pierde. La ruta pedida se guarda en `sessionStorage`
 * ANTES de redirigir y `AuthCallbackPage` la recupera al volver.
 *
 * - Sólo se aceptan rutas internas (nada de redirecciones abiertas), al guardar y al leer: el
 *   almacenamiento puede haber sido manipulado.
 * - No guarda secretos: es una ruta de la propia aplicación.
 * - Un cierre de sesión voluntario la borra (`clearReturnPath`): quien entre después puede ser otra
 *   persona con otros permisos y debe empezar en el inicio.
 * - Todo acceso al almacenamiento está protegido: puede lanzar (modo privado, datos bloqueados) y
 *   entonces sencillamente no hay ruta de retorno.
 */

export const RETURN_PATH_STORAGE_KEY = 'auth.returnPath';

/** Rutas a las que nunca se vuelve: pantallas del propio flujo de acceso. */
const NON_RETURNABLE_PATHS: readonly string[] = [
  ROUTE_PATHS.login,
  ROUTE_PATHS.authCallback,
  ROUTE_PATHS.changePassword,
];

/** Origen ficticio para resolver la ruta y comprobar que no sale de él. */
const PROBE_ORIGIN = 'http://return-path.invalid';

const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * `true` si `value` es una ruta interna segura y a la que tiene sentido volver:
 * empieza por una sola `/`, sin esquema ni host, sin `\` ni caracteres de control, y no es una
 * pantalla del flujo de acceso.
 */
export function isSafeReturnPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return false;
  }
  if (CONTROL_OR_BACKSLASH.test(value)) {
    return false;
  }
  try {
    const resolved = new URL(value, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) {
      return false;
    }
    return !NON_RETURNABLE_PATHS.includes(resolved.pathname);
  } catch {
    return false;
  }
}

export function saveReturnPath(path: string): void {
  if (!isSafeReturnPath(path)) {
    clearReturnPath();
    return;
  }
  try {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, path);
  } catch {
    // Sin almacenamiento no hay ruta de retorno: se vuelve al inicio.
  }
}

/** Lee la ruta guardada sin borrarla; `null` si no hay o no es segura. */
export function readReturnPath(): string | null {
  try {
    const stored = sessionStorage.getItem(RETURN_PATH_STORAGE_KEY);
    return isSafeReturnPath(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearReturnPath(): void {
  try {
    sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}

/** Lee la ruta guardada y la borra: se usa una sola vez. */
export function consumeReturnPath(): string | null {
  const path = readReturnPath();
  clearReturnPath();
  return path;
}
