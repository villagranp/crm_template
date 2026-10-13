import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';

/**
 * Qué se copia al duplicar un proyecto (03 C.4, RN-03.20–RN-03.23, D-03.9). Pura:
 * decide los valores del proyecto nuevo a partir del origen, las casillas y lo que
 * el usuario confirma o cambia. El servicio resuelve después reglas de conversión,
 * asesor, código y cliente.
 *
 * Nunca se copia (RN-03.23): id, código, oportunidades (y estimaciones), etapas,
 * resultados, fase y su historial, forecast, visitas, actividades, adjuntos,
 * auditoría, `lastActivityAt`, creación y borrado. No aparecen en el plan.
 */

export type TonnageMode = 'RULE' | 'MANUAL' | 'NONE';

export interface DuplicationSourceClassification {
  readonly projectTypeId: string | null;
  readonly projectTypeActive: boolean;
  readonly sectorId: string | null;
  readonly sectorActive: boolean;
  readonly measureUnitId: string | null;
  readonly measureUnitActive: boolean;
  readonly estimatedQuantity: DecimalString | null;
  readonly mode: TonnageMode;
  readonly estimatedTonnage: DecimalString | null;
}

export interface DuplicationSourceProduct {
  readonly productId: string;
  readonly productActive: boolean;
  readonly unitId: string;
  readonly unitActive: boolean;
  readonly quantity: DecimalString;
}

export interface DuplicationSource {
  readonly name: string;
  readonly customerId: string;
  readonly countryId: string;
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: CalendarDate | null;
  readonly estimatedEndDate: CalendarDate | null;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly classification: DuplicationSourceClassification;
  /** Asociaciones **no eliminadas** del origen, en orden de alta. */
  readonly products: readonly DuplicationSourceProduct[];
}

export interface DuplicationOptions {
  readonly location: boolean;
  readonly description: boolean;
  readonly classification: boolean;
  readonly products: boolean;
}

/** Lo que el diálogo confirma o cambia (RN-03.20). `undefined` = valor del origen; `null` = vaciar. */
export interface DuplicationOverrides {
  readonly name: string;
  readonly customerId?: string;
  readonly estimatedStartDate?: CalendarDate | null;
  readonly estimatedEndDate?: CalendarDate | null;
  readonly estimatedDecisionDate?: CalendarDate | null;
}

export interface PlannedClassification {
  readonly projectTypeId: string | null;
  readonly sectorId: string | null;
  readonly measureUnitId: string | null;
  readonly estimatedQuantity: DecimalString | null;
  /** `RULE`: el servicio resuelve la regla **vigente** (RN-03.21); sin regla, queda `NONE`. */
  readonly mode: TonnageMode;
  readonly manualTonnage: DecimalString | null;
}

export interface DuplicationPlan {
  readonly name: string;
  readonly customerId: string;
  /** `null` = país por defecto (el del cliente), como en el alta. */
  readonly countryId: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: CalendarDate | null;
  readonly estimatedEndDate: CalendarDate | null;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly classification: PlannedClassification | null;
  /** Productos a copiar sin oportunidad y con el estado inicial (RN-03.22). */
  readonly products: readonly { readonly productId: string; readonly unitId: string; readonly quantity: DecimalString }[];
}

function pick<T>(override: T | undefined, source: T): T {
  return override === undefined ? source : override;
}

function planClassification(source: DuplicationSourceClassification): PlannedClassification | null {
  // Un valor de catálogo o una unidad desactivados no se escriben en un registro nuevo (RN-03.11).
  const projectTypeId = source.projectTypeActive ? source.projectTypeId : null;
  const sectorId = source.sectorActive ? source.sectorId : null;
  const measureUnitId = source.measureUnitActive ? source.measureUnitId : null;
  const estimatedQuantity = source.estimatedQuantity;
  let mode: TonnageMode = source.mode;
  if (mode === 'RULE' && (measureUnitId === null || estimatedQuantity === null)) mode = 'NONE';
  const planned: PlannedClassification = {
    projectTypeId,
    sectorId,
    measureUnitId,
    estimatedQuantity,
    mode,
    manualTonnage: mode === 'MANUAL' ? source.estimatedTonnage : null,
  };
  const empty = projectTypeId === null && sectorId === null && measureUnitId === null && estimatedQuantity === null && mode === 'NONE';
  return empty ? null : planned;
}

/**
 * Productos a copiar (RN-03.22): solo asociaciones con producto y unidad activos;
 * como todas pasan a "sin oportunidad", un mismo producto se copia una sola vez (la
 * primera asociación por orden de alta), para respetar RN-03.59.
 */
function planProducts(products: readonly DuplicationSourceProduct[]): DuplicationPlan['products'] {
  const seen = new Set<string>();
  const planned: { productId: string; unitId: string; quantity: DecimalString }[] = [];
  for (const line of products) {
    if (!line.productActive || !line.unitActive || seen.has(line.productId)) continue;
    seen.add(line.productId);
    planned.push({ productId: line.productId, unitId: line.unitId, quantity: line.quantity });
  }
  return planned;
}

export function duplicationPlan(source: DuplicationSource, options: DuplicationOptions, overrides: DuplicationOverrides): DuplicationPlan {
  return {
    name: overrides.name.trim(),
    customerId: overrides.customerId ?? source.customerId,
    countryId: options.location ? source.countryId : null,
    city: options.location ? source.city : null,
    address: options.location ? source.address : null,
    description: options.description ? source.description : null,
    estimatedStartDate: pick(overrides.estimatedStartDate, source.estimatedStartDate),
    estimatedEndDate: pick(overrides.estimatedEndDate, source.estimatedEndDate),
    estimatedDecisionDate: pick(overrides.estimatedDecisionDate, source.estimatedDecisionDate),
    classification: options.classification ? planClassification(source.classification) : null,
    products: options.products ? planProducts(source.products) : [],
  };
}
