import type { UnitDimension } from './products.api';

/** Etiquetas de `unit_dimension` (00 §2.1). */
export const DIMENSION_LABELS: Readonly<Record<UnitDimension, string>> = {
  MASS: 'Masa',
  LENGTH: 'Longitud',
  AREA: 'Área',
  VOLUME: 'Volumen',
  COUNT: 'Conteo',
  OTHER: 'Otra',
};

/**
 * Chips del filtro de estado (`isActive` = `true` | `false` | `all`). Sin el
 * filtro (`''`) el backend devuelve sólo los activos, así que «Activos» es el defecto.
 */
export const ACTIVE_FILTER_CHIPS = [
  { value: '', label: 'Activos' },
  { value: 'false', label: 'Inactivos' },
  { value: 'all', label: 'Todos' },
] as const;
