import type { DataScope } from './ports/access.repository.port';

/**
 * Descriptor neutral del alcance de datos de un usuario para un permiso
 * (00 §4.2, 02 H.1). Lo produce `VisibilityScopeResolver` y lo traducen a
 * predicados los adaptadores de cada repositorio (nunca el cliente HTTP):
 *
 * ```text
 * kind = ALL       → sin filtro
 * kind = FILTERED  → owner_id IN (:ownerIds) OR country_id IN (:countryIds)
 *                    (listas vacías no casan nada; ambas vacías = no ve nada)
 * ```
 *
 * `teamIds` es informativo (equipos alcanzados, incluidos los subequipos): los
 * filtros usan `ownerIds`, que ya contiene a sus miembros y responsables.
 */
export type VisibilityScope = AllVisibilityScope | FilteredVisibilityScope;

/** Alcance efectivo; `NONE` = el usuario no tiene el permiso (o no tiene cuenta local). */
export type EffectiveDataScope = DataScope | 'NONE';

export interface AllVisibilityScope {
  readonly kind: 'ALL';
  readonly userId: string;
  readonly dataScope: 'ORGANIZATION';
}

export interface FilteredVisibilityScope {
  readonly kind: 'FILTERED';
  /** Usuario local resuelto; `null` solo con `dataScope = NONE` sin cuenta local. */
  readonly userId: string | null;
  readonly dataScope: Exclude<EffectiveDataScope, 'ORGANIZATION'>;
  /** Dueños visibles (`sales_owner_id`, `owner_id`…). Siempre incluye al propio usuario salvo en `NONE`. */
  readonly ownerIds: readonly string[];
  /** Equipos alcanzados por `TEAM`, con subequipos. Vacío en los demás alcances. */
  readonly teamIds: readonly string[];
  /** Países visibles por `COUNTRY` (uno por usuario, DM-14). Vacío en los demás alcances. */
  readonly countryIds: readonly string[];
}

/** Dueño y país de un registro, para evaluar el alcance en memoria. */
export interface ScopedRecordRef {
  readonly ownerId: string | null;
  readonly countryId: string | null;
}

/**
 * ¿El registro cae dentro del alcance? Misma regla que el predicado SQL de los
 * adaptadores, para políticas puras (p. ej. acceso `DIRECT` frente a `INHERITED`,
 * 02 H.1). No evalúa herencia: esa la decide cada módulo.
 */
export function isWithinScope(scope: VisibilityScope, record: ScopedRecordRef): boolean {
  if (scope.kind === 'ALL') {
    return true;
  }
  return (
    (record.ownerId !== null && scope.ownerIds.includes(record.ownerId)) ||
    (record.countryId !== null && scope.countryIds.includes(record.countryId))
  );
}

/** Alcance que no ve nada: sin permiso o sin cuenta local (deny-by-default). */
export function noVisibility(userId: string | null): FilteredVisibilityScope {
  return { kind: 'FILTERED', userId, dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] };
}
