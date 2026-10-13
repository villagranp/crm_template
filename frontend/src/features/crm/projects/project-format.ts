import { formatPercent } from '@/features/crm/common/decimal';

import type {
  CommercialStatus,
  ConversionScope,
  ProjectCommercialStatusKind,
  ProjectDateField,
  ProjectHistoryKind,
  TonnageMode,
} from './projects.api';

/**
 * Etiquetas y formatos de la presentación de proyectos (03 §E): estado
 * comercial, fase, ubicación, fechas de calendario, modos de tonelaje y
 * tipos del historial. Los decimales se formatean con `crm/common/decimal.ts`.
 */

const LOCALE = 'es-GT';
const EMPTY = '—';

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** Etiquetas de los campos del proyecto, compartidas por formularios, ficha, filtros y errores. */
export const PROJECT_FIELD_LABELS = {
  code: 'Código',
  name: 'Nombre del proyecto',
  customerId: 'Cliente',
  countryId: 'País',
  city: 'Ciudad o ubicación',
  address: 'Dirección',
  description: 'Descripción',
  estimatedStartDate: 'Inicio estimado',
  estimatedEndDate: 'Fin estimado',
  estimatedDecisionDate: 'Decisión estimada',
  ownerId: 'Asesor responsable',
  projectTypeId: 'Tipo de proyecto',
  sectorId: 'Sector o uso',
  measureUnitId: 'Unidad de medida',
  estimatedQuantity: 'Cantidad estimada',
  manualTonnage: 'Tonelaje estimado',
  tonnageMode: 'Estimación del tonelaje',
  phaseId: 'Fase',
  progress: 'Porcentaje de avance',
  comment: 'Comentario',
  stageId: 'Etapa de oportunidad',
  commercialStatus: 'Estado comercial',
  active: 'Situación',
  dateField: 'Campo de fecha',
  dateFrom: 'Desde',
  dateTo: 'Hasta',
  teamId: 'Equipo',
  lastActivityFrom: 'Actualizado desde',
  lastActivityTo: 'Actualizado hasta',
  productId: 'Producto',
  quantity: 'Cantidad',
  unitId: 'Unidad',
  statusId: 'Estado',
  notes: 'Notas',
  opportunityId: 'Oportunidad',
} as const;

export const PROJECT_DATE_FIELD_LABELS: Record<ProjectDateField, string> = {
  estimatedDecisionDate: 'Decisión estimada',
  estimatedStartDate: 'Inicio estimado',
  estimatedEndDate: 'Fin estimado',
  createdAt: 'Fecha de alta',
  lastActivityAt: 'Última actualización',
};

/** Texto o "—" si está vacío. */
export function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : EMPTY;
}

/** Instante ISO → fecha y hora locales. */
export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return EMPTY;
  }
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? EMPTY : dateTimeFormatter.format(date);
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha de calendario de la API (`YYYY-MM-DD`, DM-31) sin desplazamiento de
 * zona: `new Date('2026-12-01')` es medianoche UTC y en Guatemala (UTC-6) se
 * mostraría el 30 de noviembre. Se construye la fecha local con sus partes.
 */
export function formatCalendarDate(value: string | null | undefined): string {
  const match = value ? CALENDAR_DATE.exec(value) : null;
  if (!match) {
    return EMPTY;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getDate() === Number(day) ? dateFormatter.format(date) : EMPTY;
}

/** `true` si `value` es una fecha de calendario `YYYY-MM-DD` real. */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS_LIMIT = 30;

/**
 * "hace 3 horas", "ayer", "hace 5 días"; a partir de un mes, la fecha. Para la
 * última actualización de la vista de equipo (03 §E.6), que también muestra la
 * fecha completa.
 */
export function formatRelativeDateTime(isoDate: string | null | undefined, now: Date = new Date()): string {
  if (!isoDate) {
    return EMPTY;
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return EMPTY;
  }
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE_MS) {
    return 'hace un momento';
  }
  if (elapsed < HOUR_MS) {
    return relativeFormatter.format(-Math.floor(elapsed / MINUTE_MS), 'minute');
  }
  if (elapsed < DAY_MS) {
    return relativeFormatter.format(-Math.floor(elapsed / HOUR_MS), 'hour');
  }
  const days = Math.floor(elapsed / DAY_MS);
  return days <= RELATIVE_DAYS_LIMIT ? relativeFormatter.format(-days, 'day') : dateFormatter.format(date);
}

/** "Ciudad, País" sin huecos cuando falta alguno. */
export function formatLocation(city: string | null | undefined, countryName: string | null | undefined): string {
  const parts = [city?.trim(), countryName?.trim()].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : EMPTY;
}

/** "PRY-2026-00042 · Torre Norte". */
export function projectLabel(project: { code: string; name: string }): string {
  return `${project.code} · ${project.name}`;
}

/** "VAR-3 · Varilla corrugada #3". */
export function productLabel(product: { sku: string; description: string }): string {
  return `${product.sku} · ${product.description}`;
}

/** "Diseño · 10%". */
export function formatPhase(phase: { label: string; progress: string }): string {
  return `${phase.label} · ${formatPercent(phase.progress)}`;
}

/** Tono del chip de estado comercial (siempre con su texto, nunca sólo color). */
export type StatusTone = 'info' | 'success' | 'error' | 'default';

export const COMMERCIAL_STATUS_TONES: Record<ProjectCommercialStatusKind, StatusTone> = {
  OPEN_STAGE: 'info',
  WON: 'success',
  LOST: 'error',
  NO_OPPORTUNITIES: 'default',
};

/** Etiqueta del estado comercial: la etapa abierta tal cual o las fijas de DEF-B. */
export function commercialStatusText(status: CommercialStatus): string {
  return status.kind === 'OPEN_STAGE' ? `En ${status.stage?.label ?? status.label}` : status.label;
}

export const TONNAGE_MODE_LABELS: Record<TonnageMode, string> = {
  RULE: 'Por regla',
  MANUAL: 'Manual',
  NONE: 'Sin estimación',
};

export const CONVERSION_SCOPE_LABELS: Record<ConversionScope, string> = {
  GLOBAL: 'General',
  PRODUCT_FAMILY: 'Por familia de producto',
  PRODUCT: 'Por producto',
  PROJECT_TYPE: 'Por tipo de proyecto',
};

export const HISTORY_KIND_LABELS: Record<ProjectHistoryKind, string> = {
  PHASE: 'Fase',
  STAGE: 'Etapa',
  RESULT: 'Resultado',
  PROJECT_DATA: 'Datos',
  CLASSIFICATION: 'Clasificación',
  PRODUCT: 'Productos',
  FORECAST: 'Forecast',
  ATTACHMENT: 'Adjuntos',
  OPPORTUNITY_DATA: 'Oportunidad',
};

/** Etiqueta de un campo del historial; si no se conoce, el nombre técnico. */
export function historyFieldLabel(field: string): string {
  return (PROJECT_FIELD_LABELS as Record<string, string>)[field] ?? field;
}

/** Valor de un cambio del historial como texto ("—" si no hay). */
export function historyValueText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY;
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (typeof value === 'string' && CALENDAR_DATE.test(value)) {
    return formatCalendarDate(value);
  }
  return String(value);
}

/**
 * Valor numérico de una barra de progreso a partir del porcentaje decimal
 * (`"75.50"` → 75). Sólo para el ancho visual de la barra: el texto que se lee
 * es `formatPercent` sobre la cadena original.
 */
export function progressBarValue(progress: string | null | undefined): number {
  const integer = /^(\d{1,3})/.exec(progress ?? '')?.[1];
  const value = integer ? Number.parseInt(integer, 10) : 0;
  return Math.min(Math.max(value, 0), 100);
}

export type DataScope = 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';

/**
 * Alcance efectivo en texto para la vista de equipo (03 §E.6, AC-03.26). Sale
 * del perfil (`GET /me`, alcance más amplio de sus roles); la lista que ve lo
 * decide el backend en cualquier caso.
 */
export function scopeDescription(scope: DataScope, teamNames: readonly string[] = []): string {
  switch (scope) {
    case 'OWN':
      return 'Ves tus proyectos.';
    case 'TEAM':
      return teamNames.length > 0
        ? `Ves los proyectos de tus equipos (${teamNames.join(', ')}) y sus subequipos.`
        : 'Ves los proyectos de tus equipos y sus subequipos.';
    case 'COUNTRY':
      return 'Ves los proyectos de tu país.';
    case 'ORGANIZATION':
      return 'Ves todos los proyectos.';
  }
}
