/** Presentación de los datos de la bitácora. Sin estado: se prueba aparte de la pantalla. */

import type { AuditLogEntry } from './audit.api';

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
const EMPTY = '—';

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? EMPTY : value.map(formatValue).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function isChange(value: unknown): value is { before: unknown; after: unknown } {
  return typeof value === 'object' && value !== null && 'before' in value && 'after' in value;
}

/**
 * Filas de la diferencia `{ campo: { before, after } }`. Devuelve `null` si
 * `changes` no tiene esa forma (registros antiguos o de otro origen): la
 * pantalla lo muestra entonces como JSON tal cual.
 */
export function toChangeRows(changes: unknown): ChangeRow[] | null {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    return null;
  }
  const entries = Object.entries(changes);
  if (!entries.every(([, change]) => isChange(change))) {
    return null;
  }
  return entries.map(([field, change]) => {
    const { before, after } = change as { before: unknown; after: unknown };
    return { field, before: formatValue(before), after: formatValue(after) };
  });
}

/** Metadatos planos como pares clave/valor; `null` si no hay. */
export function toMetadataRows(metadata: unknown): { key: string; value: string }[] | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const entries = Object.entries(metadata);
  return entries.length === 0 ? null : entries.map(([key, value]) => ({ key, value: formatValue(value) }));
}

export function describeActor(entry: { subjectEmail: string | null; subjectId: string | null }): string {
  return entry.subjectEmail ?? entry.subjectId ?? 'Sistema';
}

/**
 * Etiqueta de cada tipo de recurso conocido (07 D-07.10, RN-07.40): los del
 * CRM (`crm.<entidad>`) y los de administración. Un tipo desconocido se
 * muestra tal cual. Si una especificación de módulo fija otro nombre, se
 * actualiza aquí.
 */
export const RESOURCE_TYPE_LABEL: Readonly<Record<string, string>> = {
  'crm.customer': 'Cliente',
  'crm.contact': 'Contacto',
  'crm.project': 'Proyecto',
  'crm.opportunity': 'Oportunidad',
  'crm.opportunity_result': 'Resultado de oportunidad',
  'crm.project_product': 'Producto asociado',
  'crm.forecast_line': 'Línea de forecast',
  'crm.visit': 'Visita',
  'crm.activity': 'Actividad',
  'crm.customer_import': 'Importación de clientes',
  'crm.attachment': 'Adjunto',
  'crm.product': 'Producto',
  'crm.product_family': 'Familia de productos',
  'crm.unit_of_measure': 'Unidad de medida',
  'crm.unit_conversion_rule': 'Regla de conversión',
  'crm.exchange_rate': 'Tipo de cambio',
  user: 'Usuario',
  role: 'Rol',
  team: 'Equipo',
  menu_option: 'Opción de menú',
  catalog: 'Catálogo',
  catalog_item: 'Elemento de catálogo',
  system_parameter: 'Parámetro',
  audit_log: 'Bitácora de auditoría',
};

/** Tipos para el selector de Entidad, ordenados por etiqueta. */
export const KNOWN_RESOURCE_TYPES: readonly string[] = Object.keys(RESOURCE_TYPE_LABEL).sort((a, b) =>
  (RESOURCE_TYPE_LABEL[a] ?? a).localeCompare(RESOURCE_TYPE_LABEL[b] ?? b, 'es'),
);

export function resourceTypeLabel(resourceType: string | null): string {
  if (!resourceType) {
    return EMPTY;
  }
  return RESOURCE_TYPE_LABEL[resourceType] ?? resourceType;
}

/**
 * Etiqueta de los campos más comunes de `changes` (nombres del DTO,
 * RN-07.40). Los demás se muestran por su nombre. Los valores enmascarados
 * (DM-29) se muestran tal cual: el enmascarado ocurre al escribir.
 */
export const FIELD_LABEL: Readonly<Record<string, string>> = {
  name: 'Nombre',
  displayName: 'Nombre visible',
  firstName: 'Nombres',
  lastName: 'Apellidos',
  email: 'Correo',
  phone: 'Teléfono',
  jobTitle: 'Puesto',
  status: 'Estado',
  isActive: 'Activo',
  description: 'Descripción',
  code: 'Código',
  label: 'Etiqueta',
  key: 'Clave',
  value: 'Valor',
  metadata: 'Datos de semántica',
  sortOrder: 'Orden',
  employeeCode: 'Código de colaborador',
  countryId: 'País',
  country: 'País',
  roles: 'Roles',
  roleIds: 'Roles',
  teams: 'Equipos',
  teamIds: 'Equipos',
  members: 'Miembros',
  managerId: 'Responsable',
  parentId: 'Depende de',
  dataScope: 'Alcance de datos',
  permissions: 'Permisos',
  permissionCodes: 'Permisos',
  menuOptions: 'Opciones de menú',
  ownerId: 'Responsable',
  customerId: 'Cliente',
  projectId: 'Proyecto',
  opportunityId: 'Oportunidad',
  phaseId: 'Fase',
  stageId: 'Etapa',
  statusId: 'Estado',
  priorityId: 'Prioridad',
  typeId: 'Tipo',
  taxId: 'NIT',
  legalName: 'Razón social',
  tradeName: 'Nombre comercial',
  estimatedAmount: 'Monto estimado',
  estimatedAmountUsd: 'Monto estimado (USD)',
  currencyCode: 'Moneda',
  effectiveDate: 'Fecha de vigencia',
  ratePerUsd: 'Tasa por USD',
  source: 'Fuente',
  notes: 'Notas',
  factor: 'Factor',
  scheduledAt: 'Fecha programada',
  dueAt: 'Vencimiento',
  result: 'Resultado',
};

export function fieldLabel(field: string | null): string {
  if (!field) {
    return EMPTY;
  }
  return FIELD_LABEL[field] ?? field;
}

/** Una fila de la vista por campo (07 E.6): un campo cambiado de un evento. */
export interface AuditFieldRow {
  /** Clave estable de la fila (evento + campo). */
  key: string;
  entry: AuditLogEntry;
  /** `true` en la primera fila de cada evento: ahí se pintan sus datos comunes. */
  isFirstOfEvent: boolean;
  field: string | null;
  before: string;
  after: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Vista por campo (RN-07.42): una fila por campo de `changes`, en el orden
 * guardado, igual que la exportación `layout=fields` del backend. Un valor
 * sin la forma `{ before, after }` va como JSON en «Valor nuevo»; un evento
 * sin cambios, en una fila sin campo. Con `onlyField`, sólo ese campo.
 */
export function toFieldRows(entries: readonly AuditLogEntry[], onlyField?: string): AuditFieldRow[] {
  return entries.flatMap((entry) => {
    const { changes } = entry;
    let rows: Omit<AuditFieldRow, 'key' | 'entry' | 'isFirstOfEvent'>[];
    if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
      rows = [
        {
          field: null,
          before: EMPTY,
          after: isPlainObject(changes) || changes === null || changes === undefined ? EMPTY : JSON.stringify(changes),
        },
      ];
    } else {
      rows = Object.entries(changes)
        .filter(([field]) => !onlyField || field === onlyField)
        .map(([field, value]) =>
          isChange(value)
            ? { field, before: formatValue(value.before), after: formatValue(value.after) }
            : { field, before: EMPTY, after: JSON.stringify(value) },
        );
    }
    return rows.map((row, index) => ({
      ...row,
      key: `${entry.id}:${row.field ?? ''}:${index}`,
      entry,
      isFirstOfEvent: index === 0,
    }));
  });
}
