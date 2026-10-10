/**
 * Exclusión mutua para las operaciones que rotan la cookie de refresco.
 *
 * El backend revoca **todas** las sesiones del usuario si recibe dos veces el
 * mismo refresh token ya rotado (PLAN-AUTH-LOCAL D4). Dos pestañas que
 * renuevan a la vez envían la misma cookie y provocarían exactamente eso. Por
 * eso login, refresh, cambio de contraseña y logout pasan por este cerrojo:
 * la segunda pestaña espera y, cuando entra, el navegador ya le envía la
 * cookie nueva.
 *
 * - Con Web Locks API (`navigator.locks`) el cerrojo es compartido por todas
 *   las pestañas del mismo origen.
 * - Sin ella (navegadores antiguos, algunos entornos embebidos) se degrada a
 *   una cola dentro de la pestaña. Queda el riesgo entre pestañas, acotado a
 *   navegadores que no soportan la API.
 *
 * Los cerrojos no son reentrantes: una tarea que se ejecuta aquí dentro no
 * puede volver a pedirlo (se quedaría esperándose a sí misma).
 */

export const SESSION_LOCK_NAME = 'auth-refresh';

let inTabQueue: Promise<unknown> = Promise.resolve();

function runInTabQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = inTabQueue.then(task, task);
  // La cola sólo ordena; el error de una tarea no debe bloquear a la siguiente.
  inTabQueue = run.catch(() => undefined);
  return run;
}

function getLockManager(): LockManager | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) {
    return null;
  }
  return navigator.locks;
}

export function runWithSessionLock<T>(task: () => Promise<T>): Promise<T> {
  const lockManager = getLockManager();

  if (!lockManager) {
    return runInTabQueue(task);
  }

  return lockManager.request(SESSION_LOCK_NAME, { mode: 'exclusive' }, () => task()) as Promise<T>;
}
