import type { StageItem } from '../stage-transition-policy';

/** Catálogos de prueba con la semántica de la semilla esencial (00 §3.4). Excluido del build. */
function item(id: string, code: string, metadata: Record<string, unknown>, isActive = true): StageItem {
  return { id, code, label: code, metadata, isActive };
}

export const STAGES = {
  CONTACTADO: item('s-contactado', 'CONTACTADO', { order: 1, isClosed: false, outcome: null }),
  COTIZANDO: item('s-cotizando', 'COTIZANDO', { order: 2, isClosed: false, outcome: null }),
  GANADO: item('s-ganado', 'GANADO', { order: 3, isClosed: true, outcome: 'WON' }),
  PERDIDO: item('s-perdido', 'PERDIDO', { order: 4, isClosed: true, outcome: 'LOST' }),
  NEGOCIANDO: item('s-negociando', 'NEGOCIANDO', { order: 2.5, isClosed: false, outcome: null }),
  ARCHIVADA: item('s-archivada', 'ARCHIVADA', { order: 5, isClosed: false, outcome: null }, false),
} as const;

export const ALL_STAGES: StageItem[] = Object.values(STAGES);

export const DEFAULT_MAP = {
  CONTACTADO: ['COTIZANDO', 'GANADO', 'PERDIDO'],
  COTIZANDO: ['CONTACTADO', 'GANADO', 'PERDIDO'],
  GANADO: [],
  PERDIDO: [],
};

export const OUTCOME_ITEMS: StageItem[] = [
  item('o-won', 'WON', { requiresReason: false, requiresAwardedPercent: false, stageOutcome: 'WON' }),
  item('o-lost', 'LOST', { requiresReason: true, requiresAwardedPercent: false, stageOutcome: 'LOST' }),
  item('o-partial', 'PARTIAL', { requiresReason: false, requiresAwardedPercent: true, stageOutcome: 'WON' }),
];
