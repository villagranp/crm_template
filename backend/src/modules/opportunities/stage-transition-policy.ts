import { catalogOrder, isClosedStage, isOpenStage, type SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';

/**
 * Política de transiciones de etapa (03 RN-03.40–RN-03.43, DM-6, D-03.8). Pura.
 *
 * - **Mapa** `crm.oportunidades.transiciones_etapa` (por **código**): si la etapa
 *   origen figura como clave, sus destinos son exactamente los listados (lista vacía =
 *   ninguno). Los destinos inactivos o inexistentes en el catálogo se ignoran.
 * - **Respaldo** (RN-03.41) para una etapa origen que no figura en el mapa: desde una
 *   abierta, cualquier etapa activa; desde una cerrada, ninguna.
 * - **Reabrir** (RN-03.42) — de cerrada a abierta — está **fuera** del mapa: destino
 *   cualquier etapa abierta activa (lo autoriza `administrar` y exige comentario, fuera
 *   de esta función).
 * - Ir a la misma etapa nunca es una transición (`STAGE_UNCHANGED`, RN-03.43).
 */

export type StageTransitionMap = Readonly<Record<string, readonly string[]>>;

export interface StageItem extends SemanticCatalogItem {
  readonly isActive: boolean;
}

export type StageChangeKind = 'UNCHANGED' | 'REOPEN' | 'TRANSITION' | 'NOT_ALLOWED';

/** Etapas por `metadata.order` y, a igualdad, por código (orden determinista). */
export function sortStages<T extends SemanticCatalogItem>(stages: readonly T[]): T[] {
  return [...stages].sort((a, b) => catalogOrder(a) - catalogOrder(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** Destinos del mapa (o del respaldo) desde `from`, sin la propia etapa y solo activos. */
export function mappedTargets(from: StageItem, stages: readonly StageItem[], map: StageTransitionMap): StageItem[] {
  const active = stages.filter((stage) => stage.isActive && stage.id !== from.id);
  if (Object.prototype.hasOwnProperty.call(map, from.code)) {
    const codes = new Set(map[from.code] ?? []);
    return sortStages(active.filter((stage) => codes.has(stage.code)));
  }
  return isOpenStage(from) ? sortStages(active) : [];
}

/** Destinos de una reapertura: cualquier etapa abierta activa (solo desde una cerrada). */
export function reopenTargets(from: StageItem, stages: readonly StageItem[]): StageItem[] {
  if (!isClosedStage(from)) return [];
  return sortStages(stages.filter((stage) => stage.isActive && isOpenStage(stage)));
}

/**
 * Clasifica un cambio `from → to` (el destino ya se validó como elemento activo del
 * catálogo): misma etapa, reapertura (cerrada → abierta), transición del mapa o no
 * permitida.
 */
export function classifyStageChange(from: StageItem, to: StageItem, stages: readonly StageItem[], map: StageTransitionMap): StageChangeKind {
  if (from.id === to.id) return 'UNCHANGED';
  if (isClosedStage(from) && isOpenStage(to)) return 'REOPEN';
  return mappedTargets(from, stages, map).some((stage) => stage.id === to.id) ? 'TRANSITION' : 'NOT_ALLOWED';
}

export interface TransitionAbilities {
  readonly canEdit: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
}

/**
 * `allowedTransitions` del detalle (E.7 `StageChangeDialog`): destinos válidos **para
 * este usuario ahora**. Sin `editar`, ninguno; las etapas cerradas solo con `cerrar`;
 * las reaperturas solo con `administrar`.
 */
export function allowedTransitions(
  from: StageItem,
  stages: readonly StageItem[],
  map: StageTransitionMap,
  abilities: TransitionAbilities,
): StageItem[] {
  if (!abilities.canEdit) return [];
  const targets = new Map<string, StageItem>();
  for (const stage of mappedTargets(from, stages, map)) {
    const closing = isClosedStage(stage);
    // Una cerrada hacia una abierta es reapertura, nunca transición del mapa.
    if (isClosedStage(from) && !closing) continue;
    if (closing && !abilities.canClose) continue;
    targets.set(stage.id, stage);
  }
  if (abilities.canReopen) {
    for (const stage of reopenTargets(from, stages)) targets.set(stage.id, stage);
  }
  return sortStages([...targets.values()]);
}

export interface StageChangeRequestState {
  /** Etapa vigente (leída con la fila bloqueada). */
  readonly from: StageItem;
  /** Destino ya validado como elemento activo del catálogo. */
  readonly to: StageItem;
  readonly hasComment: boolean;
  readonly hasResult: boolean;
  /** La oportunidad ya tiene resultado vigente. */
  readonly currentResult: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
}

export type StageChangeRejection =
  | 'STAGE_UNCHANGED'
  | 'INVALID_STAGE_TRANSITION'
  | 'REOPEN_FORBIDDEN'
  | 'COMMENT_REQUIRED'
  | 'CLOSE_FORBIDDEN'
  | 'RESULT_REQUIRED'
  | 'RESULT_NOT_ALLOWED';

export type StageChangePlan =
  | { readonly kind: 'REJECT'; readonly reason: StageChangeRejection }
  /** RN-03.42: cerrada → abierta; anula el resultado vigente y limpia `closedAt`. */
  | { readonly kind: 'REOPEN' }
  /** Abierta → abierta. */
  | { readonly kind: 'ADVANCE' }
  /** → cerrada, con resultado (RN-03.46). `replacesResult` solo de cerrada a cerrada (si el mapa lo permite). */
  | { readonly kind: 'CLOSE'; readonly replacesResult: boolean };

/**
 * Algoritmo de `stage-changes` (03 F.2, pasos 2–5), en este orden: misma etapa →
 * reapertura (permiso, comentario, sin resultado) → transición del mapa → cierre
 * (permiso `cerrar`, resultado obligatorio) o avance (sin resultado). El llamador
 * aplica antes el `403` de edición y después las reglas del resultado (RN-03.47–50).
 */
export function planStageChange(state: StageChangeRequestState, stages: readonly StageItem[], map: StageTransitionMap): StageChangePlan {
  const kind = classifyStageChange(state.from, state.to, stages, map);
  if (kind === 'UNCHANGED') return { kind: 'REJECT', reason: 'STAGE_UNCHANGED' };
  if (kind === 'REOPEN') {
    if (!state.canReopen) return { kind: 'REJECT', reason: 'REOPEN_FORBIDDEN' };
    if (!state.hasComment) return { kind: 'REJECT', reason: 'COMMENT_REQUIRED' };
    if (state.hasResult) return { kind: 'REJECT', reason: 'RESULT_NOT_ALLOWED' };
    return { kind: 'REOPEN' };
  }
  if (kind === 'NOT_ALLOWED') return { kind: 'REJECT', reason: 'INVALID_STAGE_TRANSITION' };
  if (isClosedStage(state.to)) {
    if (!state.canClose) return { kind: 'REJECT', reason: 'CLOSE_FORBIDDEN' };
    if (!state.hasResult) return { kind: 'REJECT', reason: 'RESULT_REQUIRED' };
    return { kind: 'CLOSE', replacesResult: state.currentResult };
  }
  if (state.hasResult) return { kind: 'REJECT', reason: 'RESULT_NOT_ALLOWED' };
  return { kind: 'ADVANCE' };
}
