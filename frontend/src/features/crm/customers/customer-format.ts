import type { Contact, Customer, CustomerListItem } from './customers.api';

/** Etiquetas y formatos de la presentación de clientes y contactos. */

const LOCALE = 'es-MX';
const EMPTY = '—';

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });

/** Etiquetas de los campos del cliente, compartidas por formulario, ficha y errores. */
export const CUSTOMER_FIELD_LABELS = {
  customerCode: 'Código de cliente',
  crmCode: 'Código CRM',
  legalName: 'Razón social',
  tradeName: 'Nombre comercial',
  taxId: 'NIT',
  countryId: 'País',
  city: 'Ciudad',
  address: 'Dirección',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  companyTypeId: 'Tipo de empresa',
  statusId: 'Estado',
  ratingId: 'Calificación',
  salesOwnerId: 'Responsable de ventas',
} as const;

/** Etiqueta del identificador fiscal del país (`taxIdLabel`), "NIT" si no se conoce. */
export function taxIdLabelOf(country: { taxIdLabel?: string | null } | null | undefined): string {
  return country?.taxIdLabel?.trim() || CUSTOMER_FIELD_LABELS.taxId;
}

/** Texto o "—" si está vacío. */
export function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : EMPTY;
}

export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return EMPTY;
  }
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? EMPTY : dateTimeFormatter.format(date);
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return EMPTY;
  }
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? EMPTY : dateFormatter.format(date);
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

/** "Ciudad, País" sin huecos cuando falta alguno. */
export function formatLocation(city: string | null | undefined, countryName: string | null | undefined): string {
  const parts = [city?.trim(), countryName?.trim()].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : EMPTY;
}

/** "CLI-000123 · Razón social". */
export function customerLabel(customer: Pick<CustomerListItem, 'crmCode' | 'legalName'>): string {
  return `${customer.crmCode} · ${customer.legalName}`;
}

/** Nombre completo del contacto; usa `fullName` del backend si viene. */
export function contactFullName(contact: Pick<Contact, 'firstName' | 'lastName'> & { fullName?: string }): string {
  return contact.fullName?.trim() || [contact.firstName, contact.lastName].map((part) => part.trim()).filter(Boolean).join(' ');
}

export interface StatusView {
  label: string;
  /** `false` = cliente desactivado: el chip se atenúa (con texto, nunca sólo color). */
  isActive: boolean;
}

export function customerStatusView(customer: Pick<Customer, 'status'> | Pick<CustomerListItem, 'status'>): StatusView {
  return { label: customer.status.label, isActive: customer.status.isActive };
}

/** Origen del registro si vino de una carga masiva (Módulo 6). */
export function sourceImportLabel(customer: Pick<Customer, 'sourceImport'>): string | null {
  return customer.sourceImport ? `Carga masiva ${customer.sourceImport.code}` : null;
}
