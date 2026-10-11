/**
 * Archivos elegidos en el alta de un cliente que se suben después del `201`
 * (D-02.15), ya en la ficha, para que el progreso y el error de cada archivo se
 * vean allí sin deshacer el alta.
 *
 * Vive en memoria (no en el historial ni en `localStorage`): si se recarga la
 * página antes de llegar a la ficha, los archivos se pierden y no se suben dos
 * veces. Sólo lo usan el alta (deja) y la ficha (recoge).
 */
const pendingByCustomer = new Map<string, File[]>();

export function stashPendingUploads(customerId: string, files: readonly File[]): void {
  if (files.length > 0) {
    pendingByCustomer.set(customerId, [...files]);
  }
}

/** Devuelve y olvida los archivos pendientes del cliente (una sola vez). */
export function takePendingUploads(customerId: string): File[] {
  const files = pendingByCustomer.get(customerId) ?? [];
  pendingByCustomer.delete(customerId);
  return files;
}
