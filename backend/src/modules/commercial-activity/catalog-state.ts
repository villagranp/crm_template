/**
 * Lectura de la semántica de los catálogos de estado del módulo (00 §3.3, RN-04.4).
 * La lógica nunca compara etiquetas ni UUID: pregunta por los indicadores de
 * `metadata` (`isOpen`, `isPending`, `isRescheduled`…). Funciones puras.
 */

export type CatalogMetadata = Readonly<Record<string, unknown>> | null;

/** Elemento de un catálogo de estados, tal como lo necesita la elección del estado destino. */
export interface CatalogStateItem {
  readonly id: string;
  readonly code: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly metadata: CatalogMetadata;
}

/** `true` solo si el indicador es exactamente `true` (ausente, `null` u otro tipo = `false`). */
export function metadataFlag(metadata: CatalogMetadata, key: string): boolean {
  return metadata !== null && metadata[key] === true;
}

/** Número de `metadata` (p. ej. `weight` de `crm.prioridad`); `fallback` si falta o no es finito. */
export function metadataNumber(metadata: CatalogMetadata, key: string, fallback = 0): number {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Elemento **activo** que cumple `predicate` con menor `sortOrder` (desempate por
 * `code`), o `null`. Es la regla de "estado inicial" de 00 §3.3 punto 2 (RN-04.8).
 */
export function lowestActive(items: readonly CatalogStateItem[], predicate: (item: CatalogStateItem) => boolean): CatalogStateItem | null {
  const candidates = items.filter((item) => item.isActive && predicate(item));
  candidates.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  return candidates[0] ?? null;
}
