import type { ReportFilterOption } from './ReportFilterBar';
import type { ReportCatalogOption, ReportNamedRef, ReportUserRef } from './report-types';

/**
 * Opciones de los selectores de filtro a partir de `GET /reports/filter-options` (05 E.1: nunca
 * listas fijas). Los catálogos van en su `order` (si lo tienen) y luego por etiqueta; los
 * inactivos se ofrecen marcados para consultar históricos (P-05.7).
 */

const COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

export function ownerOptions(owners: readonly ReportUserRef[] | undefined): ReportFilterOption[] {
  return [...(owners ?? [])].sort((a, b) => COLLATOR.compare(a.displayName, b.displayName)).map((owner) => ({ value: owner.id, label: owner.displayName }));
}

export function namedOptions(items: readonly ReportNamedRef[] | undefined): ReportFilterOption[] {
  return [...(items ?? [])].sort((a, b) => COLLATOR.compare(a.name, b.name)).map((item) => ({ value: item.id, label: item.name }));
}

export function catalogOptions<T extends ReportCatalogOption & { order?: number }>(items: readonly T[] | undefined): ReportFilterOption[] {
  return [...(items ?? [])]
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || (a.order ?? 0) - (b.order ?? 0) || COLLATOR.compare(a.label, b.label))
    .map((item) => ({ value: item.id, label: item.label, inactive: !item.isActive }));
}

/** Opciones de un enumerado del contrato con sus etiquetas en español. */
export function enumOptions<T extends string>(values: readonly T[], labels: Readonly<Record<T, string>>): ReportFilterOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
