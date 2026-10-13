import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';

import type { CustomerImportDetailRecord, CustomerImportRecord } from './ports/customer-imports.repository.port';

/** Permisos de la carga masiva (00 §5.2, 06 H.1). */
export const IMPORT_PERMISSIONS = {
  view: 'importaciones.ver',
  create: 'importaciones.crear',
  /** Crea clientes: se exige además en subir y confirmar (06 H.1). */
  customersCreate: 'clientes.crear',
} as const;

/**
 * Alcances del actor sobre las cargas (06 H.4, D-06.10): cada operación evalúa
 * el alcance **de su propio permiso**. Una carga es visible para quien la inició
 * y, con alcance `ORGANIZATION` de `importaciones.ver`, para todos; confirmarla o
 * cancelarla exige ser su autor o alcance `ORGANIZATION` de `importaciones.crear`.
 * Los alcances `OWN`, `TEAM` y `COUNTRY` no amplían nada (00 §4.2: las cargas
 * no tienen dueño comercial ni país).
 */
export interface ImportActorScopes {
  readonly viewAll: boolean;
  readonly manageAll: boolean;
}

function isAuthor(actor: CustomerActor, record: CustomerImportRecord): boolean {
  return actor.userId !== null && record.startedBy.id === actor.userId;
}

export function canViewImport(actor: CustomerActor, scopes: ImportActorScopes, record: CustomerImportRecord): boolean {
  return actor.permissions.has(IMPORT_PERMISSIONS.view) && (isAuthor(actor, record) || scopes.viewAll);
}

/** Autor o alcance `ORGANIZATION` de `importaciones.crear` (RN-06.19, D-06.10). */
export function canManageImport(actor: CustomerActor, scopes: ImportActorScopes, record: CustomerImportRecord): boolean {
  return actor.permissions.has(IMPORT_PERMISSIONS.create) && (isAuthor(actor, record) || scopes.manageAll);
}

export interface ImportCapabilities {
  readonly canConfirm: boolean;
  readonly canCancel: boolean;
  readonly hasErrorFile: boolean;
}

/** Lo que el usuario puede hacer con la carga, con la **misma** regla que autoriza las operaciones. */
export function importCapabilities(
  actor: CustomerActor,
  scopes: ImportActorScopes,
  record: CustomerImportDetailRecord,
  enabled: boolean,
): ImportCapabilities {
  const pending = record.status === 'VALIDATED' && enabled && canManageImport(actor, scopes, record);
  return {
    canConfirm: pending && actor.permissions.has(IMPORT_PERMISSIONS.customersCreate) && record.validRows > 0 && !record.stats.isPurged,
    canCancel: pending,
    hasErrorFile: record.stats.notImportedRows > 0 && !record.stats.isPurged,
  };
}
