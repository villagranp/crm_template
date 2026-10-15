import { z } from 'zod';

/**
 * Composición del panel de Inicio (Ajustes 1, AJ1-1; RN-AJ1.1–RN-AJ1.4, RN-AJ1.6).
 *
 * UNA sola definición de las listas cerradas de claves: la usan la regla del parámetro
 * `ui.inicio.tarjetas` (composición por defecto, `parameter-rules.registry.ts`), el
 * validador de la preferencia del usuario (`access/user-preferences.service.ts`) y el
 * editor del frontend, que las recibe por `GET /parameters` (`allowedValues` y
 * `editorOptions`) sin copiarlas. Sin acceso a datos ni dependencias de Nest.
 */

/** Clave del parámetro con la composición por defecto (RN-AJ1.1, D-AJ1.11); también la de la preferencia del usuario. */
export const DASHBOARD_PARAMETER_KEY = 'ui.inicio.tarjetas';

/** Bloques de Inicio (RN-AJ1.2). El orden de esta lista es el orden por defecto (RN-AJ1.6). */
export const DASHBOARD_BLOCK_KEYS = ['safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity', 'access'] as const;
/** Indicadores K1–K9 (RN-AJ1.2), en su orden actual. */
export const DASHBOARD_KPI_KEYS = [
  'projects-active',
  'opportunities-open',
  'opportunities-won',
  'opportunities-lost',
  'forecast',
  'visits-pending',
  'activities-pending',
  'activities-overdue',
  'targets',
] as const;
/** Bloques que no se pueden ocultar (D-AJ1.10, RN-AJ1.3): su `visible` siempre es `true`. */
export const DASHBOARD_ALWAYS_VISIBLE_BLOCKS = ['safety-minute'] as const;

export type DashboardBlockKey = (typeof DASHBOARD_BLOCK_KEYS)[number];
export type DashboardKpiKey = (typeof DASHBOARD_KPI_KEYS)[number];

export interface DashboardCardEntry<K extends string = string> {
  readonly key: K;
  readonly visible: boolean;
}

export interface DashboardCards {
  readonly blocks: ReadonlyArray<DashboardCardEntry<DashboardBlockKey>>;
  readonly kpis: ReadonlyArray<DashboardCardEntry<DashboardKpiKey>>;
}

/** Lista de la composición a la que pertenece una clave (`details[].field` de los errores). */
export type DashboardCardList = 'blocks' | 'kpis';

const LISTS: Readonly<Record<DashboardCardList, readonly string[]>> = {
  blocks: DASHBOARD_BLOCK_KEYS,
  kpis: DASHBOARD_KPI_KEYS,
};

/** Composición actual de Inicio: todo visible, en el orden de las listas (RN-AJ1.6). */
export const DEFAULT_DASHBOARD_CARDS: DashboardCards = {
  blocks: DASHBOARD_BLOCK_KEYS.map((key) => ({ key, visible: true })),
  kpis: DASHBOARD_KPI_KEYS.map((key) => ({ key, visible: true })),
};

export type DashboardCardsIssueKind = 'unknown_key' | 'duplicated_key' | 'missing_key';

export interface DashboardCardsIssue {
  readonly list: DashboardCardList;
  readonly issue: DashboardCardsIssueKind;
  readonly key: string;
  /** Posición en la lista enviada; `null` si la clave falta. */
  readonly index: number | null;
}

/**
 * Diagnostica una composición estructuralmente correcta (dos arreglos de `{key, visible}`):
 * claves desconocidas, repetidas y faltantes. `[]` = cumple la regla de RN-AJ1.2.
 */
export function diagnoseDashboardCards(input: {
  readonly blocks: ReadonlyArray<{ readonly key: string }>;
  readonly kpis: ReadonlyArray<{ readonly key: string }>;
}): DashboardCardsIssue[] {
  const issues: DashboardCardsIssue[] = [];
  for (const list of ['blocks', 'kpis'] as const) {
    const allowed = new Set(LISTS[list]);
    const seen = new Set<string>();
    input[list].forEach((entry, index) => {
      if (!allowed.has(entry.key)) {
        issues.push({ list, issue: 'unknown_key', key: entry.key, index });
      } else if (seen.has(entry.key)) {
        issues.push({ list, issue: 'duplicated_key', key: entry.key, index });
      } else {
        seen.add(entry.key);
      }
    });
    for (const key of LISTS[list]) {
      if (!seen.has(key)) issues.push({ list, issue: 'missing_key', key, index: null });
    }
  }
  return issues;
}

/** Fuerza `visible = true` en los bloques no ocultables (RN-AJ1.3, D-AJ1.10). */
export function enforceAlwaysVisible(cards: DashboardCards): DashboardCards {
  const locked = new Set<string>(DASHBOARD_ALWAYS_VISIBLE_BLOCKS);
  return {
    blocks: cards.blocks.map((entry) => (locked.has(entry.key) && !entry.visible ? { key: entry.key, visible: true } : entry)),
    kpis: cards.kpis,
  };
}

const ISSUE_MESSAGE: Record<DashboardCardsIssueKind, string> = {
  unknown_key: 'Clave no admitida',
  duplicated_key: 'Clave repetida',
  missing_key: 'Falta la clave',
};

const entrySchema = z.object({ key: z.string().min(1).max(50), visible: z.boolean() }).strict();

/**
 * Esquema estricto (zod) de la composición: la regla del parámetro `ui.inicio.tarjetas`.
 * Las claves se comprueban con `diagnoseDashboardCards`, que distingue desconocida,
 * repetida y faltante (el mismo criterio de `422 INVALID_DASHBOARD_CARDS`). Escribir
 * (PATCH del parámetro, PUT de la preferencia) exige cumplirlo; el lector tolerante es
 * `normalizeDashboardCards`.
 */
export const dashboardCardsSchema = z
  .object({
    blocks: z.array(entrySchema).max(DASHBOARD_BLOCK_KEYS.length * 2),
    kpis: z.array(entrySchema).max(DASHBOARD_KPI_KEYS.length * 2),
  })
  .strict()
  .superRefine((value, context) => {
    for (const issue of diagnoseDashboardCards(value)) {
      context.addIssue({
        code: 'custom',
        message: `${ISSUE_MESSAGE[issue.issue]}: ${issue.key}`,
        path: issue.index === null ? [issue.list] : [issue.list, issue.index, 'key'],
      });
    }
  });

/** Forma canónica que se guarda: solo `key`/`visible` y los bloques no ocultables visibles. */
export function canonicalDashboardCards(value: unknown): DashboardCards {
  const parsed = value as DashboardCards;
  return enforceAlwaysVisible({
    blocks: parsed.blocks.map((entry) => ({ key: entry.key, visible: entry.visible })),
    kpis: parsed.kpis.map((entry) => ({ key: entry.key, visible: entry.visible })),
  });
}

export type DashboardCardsRepair = 'unknown_key' | 'duplicated_key' | 'invalid_entry' | 'missing_key' | 'forced_visible';

export interface NormalizedDashboardCards {
  readonly cards: DashboardCards;
  /** Reparaciones hechas (para el aviso estructurado, sin valores): vacío = ya era correcta. */
  readonly repairs: readonly DashboardCardsRepair[];
}

function repairList<K extends string>(raw: readonly unknown[], keys: readonly K[], repairs: Set<DashboardCardsRepair>): Array<DashboardCardEntry<K>> {
  const allowed = new Set<string>(keys);
  const seen = new Set<string>();
  const output: Array<DashboardCardEntry<K>> = [];
  for (const entry of raw) {
    const candidate = entry as { key?: unknown; visible?: unknown } | null;
    if (typeof candidate !== 'object' || candidate === null || typeof candidate.key !== 'string' || typeof candidate.visible !== 'boolean') {
      repairs.add('invalid_entry');
    } else if (!allowed.has(candidate.key)) {
      repairs.add('unknown_key');
    } else if (seen.has(candidate.key)) {
      repairs.add('duplicated_key');
    } else {
      seen.add(candidate.key);
      output.push({ key: candidate.key as K, visible: candidate.visible });
    }
  }
  for (const key of keys) {
    if (!seen.has(key)) {
      repairs.add('missing_key');
      output.push({ key, visible: true });
    }
  }
  return output;
}

/**
 * Lector tolerante (RN-AJ1.4): descarta claves desconocidas, repetidas y entradas mal
 * formadas, añade al final como **visibles** las que faltan (p. ej. un indicador nuevo de
 * una versión futura) y fuerza visibles los bloques no ocultables. Nunca lanza.
 * Devuelve `null` si el valor es ilegible (no es un objeto con los dos arreglos): quien
 * llama cae a la composición por defecto.
 */
export function normalizeDashboardCards(value: unknown): NormalizedDashboardCards | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as { blocks?: unknown; kpis?: unknown };
  if (!Array.isArray(record.blocks) || !Array.isArray(record.kpis)) return null;

  const repairs = new Set<DashboardCardsRepair>();
  const repaired: DashboardCards = {
    blocks: repairList(record.blocks as unknown[], DASHBOARD_BLOCK_KEYS, repairs),
    kpis: repairList(record.kpis as unknown[], DASHBOARD_KPI_KEYS, repairs),
  };
  const cards = enforceAlwaysVisible(repaired);
  if (cards.blocks.some((entry, index) => entry.visible !== repaired.blocks[index]?.visible)) repairs.add('forced_visible');
  return { cards, repairs: [...repairs] };
}
