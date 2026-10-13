import {
  catalogOrder,
  COMMERCIAL_STATUS_LABELS,
  type CommercialStatus,
  type CommercialStatusKind,
  isOpenStage,
  type SemanticCatalogItem,
} from '@/modules/commercial-metrics/metric-definitions';

/**
 * DEF-B (RN-03.14) a partir del **agregado por proyecto** que calcula el adaptador
 * con una subconsulta (nunca un `JOIN` que multiplique filas). Equivale a
 * `commercialStatus()` de `metric-definitions.ts` (lo comprueba la prueba unitaria
 * con todas las combinaciones); aquí solo se materializa el resultado.
 */
export interface CommercialStatusAggregate {
  /** Etapa abierta de mayor rango (`openStageRanking`), o `null` si no hay oportunidades abiertas. */
  readonly leadingOpenStage: { readonly id: string; readonly code: string; readonly label: string } | null;
  /** Oportunidades no eliminadas. */
  readonly opportunityCount: number;
  /** Alguna oportunidad no eliminada con resultado `WON` o `PARTIAL`. */
  readonly hasWon: boolean;
}

export function commercialStatusFromAggregate(aggregate: CommercialStatusAggregate): CommercialStatus {
  if (aggregate.leadingOpenStage) {
    const { id, code, label } = aggregate.leadingOpenStage;
    return { kind: 'OPEN_STAGE', label, stage: { id, code, label } };
  }
  if (aggregate.opportunityCount === 0) {
    return { kind: 'NO_OPPORTUNITIES', label: COMMERCIAL_STATUS_LABELS.NO_OPPORTUNITIES, stage: null };
  }
  return aggregate.hasWon
    ? { kind: 'WON', label: COMMERCIAL_STATUS_LABELS.WON, stage: null }
    : { kind: 'LOST', label: COMMERCIAL_STATUS_LABELS.LOST, stage: null };
}

/**
 * Ids de las etapas abiertas ordenados como desempata DEF-B (mayor `metadata.order`
 * primero; empate, `code` menor). El adaptador toma la de menor posición en esta lista.
 */
export function openStageRanking(stages: readonly SemanticCatalogItem[]): string[] {
  return stages
    .filter(isOpenStage)
    .sort((a, b) => catalogOrder(b) - catalogOrder(a) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((stage) => stage.id);
}

/** Filtro `commercialStatus` de la búsqueda (03 F.1): `OPEN_STAGE[:<stageId>]`, `WON`, `LOST`, `NO_OPPORTUNITIES`. */
export interface CommercialStatusFilter {
  readonly kind: CommercialStatusKind;
  /** Solo con `OPEN_STAGE:<stageId>`; `null` = cualquier etapa abierta. */
  readonly stageId: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: readonly CommercialStatusKind[] = ['OPEN_STAGE', 'WON', 'LOST', 'NO_OPPORTUNITIES'];

/** Interpreta un valor del filtro; `null` si no es válido. */
export function parseCommercialStatusFilter(value: string): CommercialStatusFilter | null {
  const [kind, stageId, ...rest] = value.trim().split(':');
  if (rest.length > 0 || !kind || !KINDS.includes(kind as CommercialStatusKind)) return null;
  if (stageId === undefined) return { kind: kind as CommercialStatusKind, stageId: null };
  return kind === 'OPEN_STAGE' && UUID_PATTERN.test(stageId) ? { kind: 'OPEN_STAGE', stageId: stageId.toLowerCase() } : null;
}
