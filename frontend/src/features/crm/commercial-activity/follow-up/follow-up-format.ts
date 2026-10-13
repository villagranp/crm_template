import { activityDetailPath } from '../activities/activity-format';
import type { FollowUpSourceRef, RecordKind } from '../common/commercial-activity.api';
import { visitDetailPath } from '../common/commercial-paths';

/** Ruta del detalle de la visita o actividad de origen (las filas de `/follow-ups` no traen `sourcePath`). */
export function sourceDetailPath(source: FollowUpSourceRef): string {
  return source.sourceType === 'VISIT' ? visitDetailPath(source.sourceId) : activityDetailPath(source.sourceId);
}

/** "Ver visita VIS-…" / "Ver actividad ACT-…" (mismo texto que la línea de tiempo). */
export function sourceLinkText(sourceType: RecordKind, sourceCode: string): string {
  return sourceType === 'VISIT' ? `Ver visita ${sourceCode}` : `Ver actividad ${sourceCode}`;
}

/** Caracteres de las notas que se muestran antes de "Ver más". */
export const NOTES_PREVIEW_LENGTH = 80;

/** Resumen truncado por palabra completa con "…"; `null` si el texto ya es corto. */
export function truncateNotes(notes: string, length = NOTES_PREVIEW_LENGTH): string | null {
  const text = notes.trim();
  if (text.length <= length) {
    return null;
  }
  const cut = text.slice(0, length);
  // Si el corte cae justo antes de un espacio, la última palabra está completa.
  const lastSpace = /\s/.test(text.charAt(length)) ? length : cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
