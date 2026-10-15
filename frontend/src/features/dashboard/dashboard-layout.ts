import {
  DASHBOARD_BLOCK_KEYS,
  type DashboardBlockKey,
  type DashboardCardEntry,
  type DashboardKpiKey,
} from '@/services/ui-settings';

import type { DashboardAccess } from './dashboard.permissions';

/**
 * Composición del panel de Inicio (Ajustes 1, RN-AJ1.2 a RN-AJ1.5): lógica pura que combina el
 * orden y la visibilidad configurados con el permiso de cada elemento y produce las áreas de la
 * rejilla. Nada de esto concede acceso: el backend vuelve a exigir cada permiso.
 */

/** Nombres legibles de los bloques (el editor y el diálogo de personalización). */
export const BLOCK_LABELS: Readonly<Record<DashboardBlockKey, string>> = {
  'safety-minute': 'Minuto de seguridad',
  hero: 'Saludo',
  mine: 'Mi acceso',
  kpis: 'Indicadores',
  alerts: 'Alertas y pendientes',
  activity: 'Visitas y actividad reciente',
  access: 'Accesos',
};

/** Nombres legibles de los indicadores K1–K9. */
export const KPI_LABELS: Readonly<Record<DashboardKpiKey, string>> = {
  'projects-active': 'Proyectos activos',
  'opportunities-open': 'Oportunidades abiertas',
  'opportunities-won': 'Oportunidades ganadas',
  'opportunities-lost': 'Oportunidades perdidas',
  forecast: 'Forecast',
  'visits-pending': 'Visitas pendientes',
  'activities-pending': 'Actividades pendientes',
  'activities-overdue': 'Actividades vencidas',
  targets: 'Metas y cumplimiento',
};

/** Bloques que no se pueden ocultar (D-AJ1.10): sólo se reordenan. */
export const LOCKED_BLOCK_KEYS: readonly DashboardBlockKey[] = ['safety-minute'];

/** Bloques de media fila en `md` o más (RN-AJ1.5); `kpis` y `access` ocupan la fila completa. */
const HALF_ROW_BLOCKS: ReadonlySet<DashboardBlockKey> = new Set([
  'safety-minute',
  'hero',
  'mine',
  'alerts',
  'activity',
]);

/** Permiso (ya resuelto en `DashboardAccess`) que habilita cada indicador. */
const KPI_ACCESS: Readonly<Record<DashboardKpiKey, keyof DashboardAccess>> = {
  'projects-active': 'projects',
  'opportunities-open': 'opportunities',
  'opportunities-won': 'opportunities',
  'opportunities-lost': 'opportunities',
  forecast: 'forecast',
  'visits-pending': 'visits',
  'activities-pending': 'activities',
  'activities-overdue': 'activities',
  targets: 'targets',
};

/** `true` si la sesión puede ver el indicador por permiso. */
export function isKpiPermitted(key: DashboardKpiKey, access: DashboardAccess): boolean {
  return access[KPI_ACCESS[key]];
}

/** Indicadores visibles por preferencia **y** por permiso, en el orden configurado. */
export function visibleKpiKeys(
  kpis: readonly DashboardCardEntry<DashboardKpiKey>[],
  access: DashboardAccess,
): DashboardKpiKey[] {
  return kpis.filter((kpi) => kpi.visible && isKpiPermitted(kpi.key, access)).map((kpi) => kpi.key);
}

/** Bloques a los que la sesión tiene acceso por permiso (los que lista «Personalizar panel»). */
export function isBlockPermitted(key: DashboardBlockKey, access: DashboardAccess): boolean {
  switch (key) {
    case 'alerts':
      return access.alerts;
    case 'activity':
      return access.visits || access.recentActivity;
    default:
      return true;
  }
}

/** Qué bloques tienen algo que pintar ahora (permiso y datos). */
export type BlockAvailability = Readonly<Record<DashboardBlockKey, boolean>>;

/**
 * Bloques visibles en pantalla, en orden: visible por preferencia (el minuto de seguridad siempre,
 * RN-AJ1.3) y con algo que mostrar. Descarta claves desconocidas y repetidas.
 */
export function visibleBlockKeys(
  blocks: readonly DashboardCardEntry<DashboardBlockKey>[],
  available: BlockAvailability,
): DashboardBlockKey[] {
  const seen = new Set<DashboardBlockKey>();
  const result: DashboardBlockKey[] = [];
  for (const block of blocks) {
    if (!DASHBOARD_BLOCK_KEYS.includes(block.key) || seen.has(block.key)) {
      continue;
    }
    seen.add(block.key);
    const visible = block.visible || LOCKED_BLOCK_KEYS.includes(block.key);
    if (visible && available[block.key]) {
      result.push(block.key);
    }
  }
  return result;
}

export type DashboardGridAreas = {
  /** `grid-template-areas` en una columna. */
  xs: string;
  /** `grid-template-areas` en `md` o más (dos columnas). */
  md: string;
};

/**
 * Áreas de la rejilla. Un bloque de media fila se empareja con el siguiente sólo si éste también es
 * de media fila (se respeta el orden configurado); si queda solo, ocupa la fila completa. `kpis` y
 * `access` siempre ocupan la fila completa.
 */
export function buildGridAreas(order: readonly DashboardBlockKey[]): DashboardGridAreas {
  const rows: string[] = [];
  let index = 0;
  while (index < order.length) {
    const current = order[index] as DashboardBlockKey;
    const next = order[index + 1];
    if (HALF_ROW_BLOCKS.has(current) && next !== undefined && HALF_ROW_BLOCKS.has(next)) {
      rows.push(`${current} ${next}`);
      index += 2;
    } else {
      rows.push(`${current} ${current}`);
      index += 1;
    }
  }
  return {
    xs: order.map((key) => `"${key}"`).join(' '),
    md: rows.map((row) => `"${row}"`).join(' '),
  };
}

/**
 * Aplica a la lista completa el nuevo orden y los valores de un subconjunto de sus claves: los
 * elementos del subconjunto ocupan, en el nuevo orden, las posiciones que ya ocupaban; el resto
 * (p. ej. lo que el usuario no puede ver) no se mueve ni se pierde.
 */
export function mergeSubset<TKey extends string>(
  full: readonly DashboardCardEntry<TKey>[],
  subset: readonly DashboardCardEntry<TKey>[],
): DashboardCardEntry<TKey>[] {
  const replacements = [...subset];
  const subsetKeys = new Set(subset.map((entry) => entry.key));
  return full.map((entry) => {
    if (!subsetKeys.has(entry.key)) {
      return entry;
    }
    return replacements.shift() ?? entry;
  });
}

/** Mueve el elemento `index` una posición (`-1` sube, `1` baja); devuelve una copia. */
export function moveEntry<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const copy = [...items];
  const [moved] = copy.splice(index, 1);
  copy.splice(target, 0, moved as T);
  return copy;
}
