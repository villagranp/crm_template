/**
 * Archivos elegidos en el alta de un proyecto que se suben después del `201`
 * (03 §E.3, dos pasos), ya en la ficha (sección Adjuntos), para que el progreso
 * y el error de cada archivo se vean allí sin deshacer el alta.
 *
 * Vive en memoria (no en el historial ni en `localStorage`): si se recarga la
 * página antes de llegar a la ficha, los archivos se pierden y no se suben dos
 * veces. Sólo lo usan el alta (deja) y la ficha (recoge).
 */
const pendingByProject = new Map<string, File[]>();

export function stashPendingUploads(projectId: string, files: readonly File[]): void {
  if (files.length > 0) {
    pendingByProject.set(projectId, [...files]);
  }
}

/** Devuelve y olvida los archivos pendientes del proyecto (una sola vez). */
export function takePendingUploads(projectId: string): File[] {
  const files = pendingByProject.get(projectId) ?? [];
  pendingByProject.delete(projectId);
  return files;
}
