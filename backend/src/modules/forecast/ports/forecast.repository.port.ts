import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type { ConversionScopeCode, UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

export const FORECAST_REPOSITORY = Symbol('FORECAST_REPOSITORY');

/** Lista blanca de orden de las filas (03 F.3). */
export const FORECAST_SORT_FIELDS = ['projectCode', 'productSku', 'updatedAt'] as const;
export type ForecastSortField = (typeof FORECAST_SORT_FIELDS)[number];

export interface ForecastUnit {
  readonly id: string;
  readonly code: string;
  readonly symbol: string;
  readonly dimension: UnitDimensionCode;
}

export interface ForecastUserRef {
  readonly id: string;
  readonly displayName: string;
}

export interface ForecastPair {
  readonly projectId: string;
  readonly productId: string;
}

export interface ForecastLineKey extends ForecastPair, YearMonth {}

/**
 * Filtros ya normalizados por el servicio (03 F.3). Visibilidad (00 §4.2, DM-13, H.1), con
 * el alcance de `forecast.ver`:
 *
 * - Proyecto visible = no eliminado y dentro del alcance (`projectVisibilitySql`).
 * - Línea visible = su proyecto no eliminado y (proyecto visible u `owner_id` en el alcance).
 * - Filas = pares (proyecto, producto) con asociación activa en un proyecto visible ∪ pares
 *   con líneas visibles en `periods`.
 */
export interface ForecastCriteria {
  readonly periods: readonly YearMonth[];
  readonly projectIds: readonly string[];
  readonly productIds: readonly string[];
  /** Asesor: responsable del proyecto **o** de alguna línea visible del par en `periods`. */
  readonly ownerIds: readonly string[];
  /** Normalizado (`normalizeName`): contenido en código o nombre del proyecto, o en el SKU. */
  readonly search: string | null;
}

export interface ForecastRowQuery extends ForecastCriteria, PageRequest {
  readonly sortBy: ForecastSortField;
  readonly sortOrder: 'asc' | 'desc';
}

/** Cabecera de una fila de la matriz (un par proyecto-producto). */
export interface ForecastRowRecord {
  readonly project: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly owner: ForecastUserRef;
    readonly countryId: string;
    readonly projectTypeId: string | null;
    /** Dentro del alcance de `forecast.ver` (si no, la fila se ve solo por líneas propias). */
    readonly visible: boolean;
  };
  readonly product: {
    readonly id: string;
    readonly sku: string;
    readonly description: string;
    readonly family: { readonly id: string; readonly code: string; readonly name: string };
  };
  /** Unidad de la asociación activa (sin oportunidad primero, luego la más antigua) o la base del producto (RN-03.69). */
  readonly defaultUnit: ForecastUnit;
  /** `updatedAt` más reciente de las líneas visibles del par en `periods`. */
  readonly lastUpdatedAt: Date | null;
}

export interface ForecastLineRecord extends ForecastLineKey {
  readonly id: string;
  readonly quantity: DecimalString;
  readonly unit: ForecastUnit & { readonly isActive: boolean };
  readonly conversion: { readonly ruleId: string; readonly scope: ConversionScopeCode; readonly factor: DecimalString } | null;
  readonly tonnage: DecimalString | null;
  readonly owner: ForecastUserRef;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: ForecastUserRef | null;
}

/** Suma exacta (SQL `numeric`) de las líneas de un período y una unidad. */
export interface ForecastTotalsGroup extends YearMonth {
  readonly unit: ForecastUnit;
  readonly quantity: DecimalString;
  /** Suma de los tonelajes no nulos; `null` si ninguna línea del grupo tiene conversión. */
  readonly tonnage: DecimalString | null;
  readonly lines: number;
  readonly linesWithoutConversion: number;
}

/** Proyecto visible que recibe forecast (lo que decide la política y la regla de conversión). */
export interface ForecastProjectRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly countryId: string;
  readonly projectTypeId: string | null;
}

export interface ForecastAssociationUnit extends ForecastPair {
  /** Unidad de la asociación activa preferida (sin oportunidad primero, luego la más antigua). */
  readonly unitId: string;
}

export interface ForecastUnitRecord extends ForecastUnit {
  readonly isActive: boolean;
}

/** Valores de una línea que escribe el caso de uso (regla y factor = foto, RN-03.29). */
export interface ForecastLineWrite {
  readonly quantity: DecimalString;
  readonly unitId: string;
  readonly conversionRuleId: string | null;
  readonly conversionFactor: DecimalString | null;
  readonly tonnage: DecimalString | null;
  readonly ownerId: string;
  readonly notes: string | null;
}

/**
 * Persistencia del forecast (03 F.5, §L.1). Sin reglas de negocio: el alcance llega
 * resuelto (`VisibilityScopeResolver`, permiso `forecast.ver`) y los valores, validados.
 * Nunca hay `DELETE`: la historia se conserva (RN-03.67).
 */
export interface ForecastRepository {
  /** Página de pares; el total cuenta pares (sin JOIN que multiplique filas). */
  listRows(query: ForecastRowQuery, scope: VisibilityScope): Promise<Page<ForecastRowRecord>>;
  /** Líneas **visibles** de los pares indicados en `periods`. */
  listLines(pairs: readonly ForecastPair[], periods: readonly YearMonth[], scope: VisibilityScope): Promise<ForecastLineRecord[]>;
  /** Sumas por período y unidad de todas las líneas visibles de las filas filtradas (no solo una página). */
  totals(criteria: ForecastCriteria, scope: VisibilityScope): Promise<ForecastTotalsGroup[]>;
  /** Proyectos no eliminados y visibles con el alcance; los demás no aparecen. */
  findVisibleProjects(projectIds: readonly string[], scope: VisibilityScope): Promise<ForecastProjectRecord[]>;
  /** Líneas existentes con esas claves (lectura previa, sin bloqueo). */
  findLines(keys: readonly ForecastLineKey[], tx?: TransactionContext): Promise<ForecastLineRecord[]>;
  /** `SELECT … FOR UPDATE` de las líneas existentes con esas claves (orden de `id`). Requiere `tx`. */
  lockLines(keys: readonly ForecastLineKey[], tx: TransactionContext): Promise<ForecastLineRecord[]>;
  /** Unidad preferida de la asociación activa de cada par que la tiene. */
  associationUnits(pairs: readonly ForecastPair[], tx?: TransactionContext): Promise<ForecastAssociationUnit[]>;
  findUnits(unitIds: readonly string[], tx?: TransactionContext): Promise<ForecastUnitRecord[]>;
  createLine(key: ForecastLineKey, write: ForecastLineWrite, actorId: string | null, at: Date, tx: TransactionContext): Promise<string>;
  updateLine(lineId: string, write: ForecastLineWrite, actorId: string | null, at: Date, tx: TransactionContext): Promise<void>;
}
