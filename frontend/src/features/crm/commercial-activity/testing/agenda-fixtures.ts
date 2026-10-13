import { vi } from 'vitest';

import { jsonResponse } from '@/test/api-mocks';

import type { AgendaItem } from '../common/commercial-activity.api';

import { AGENDA_ITEM, OTHER_USER, PROJECT_REF } from './fixtures';

/**
 * Datos y ayudantes de las pruebas de la agenda (04 §E.2). Datos ficticios,
 * nunca de clientes reales. Las horas se construyen en la zona local de la
 * máquina (`localIso`) para que las pruebas no dependan de ella.
 */

/** Instante ISO de una hora local. `month` en base 1. */
export function localIso(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0, ms = 0): string {
  return new Date(year, month - 1, day, hours, minutes, seconds, ms).toISOString();
}

/** Fin de un día local (23:59:59.999), como lo envía el calendario. */
export function localEndOfDayIso(year: number, month: number, day: number): string {
  return localIso(year, month, day, 23, 59, 59, 999);
}

/** Actividad abierta (llamada) el jueves 15 de octubre de 2026 a las 10:00 locales. */
export const AGENDA_ACTIVITY: AgendaItem = {
  ...AGENDA_ITEM,
  date: localIso(2026, 10, 15, 10, 0),
  endDate: localIso(2026, 10, 15, 10, 30),
};

/** Visita cancelada y reprogramada, con proyecto, adjuntos y recordatorio, el lunes 12 de octubre de 2026 a las 09:00. */
export const AGENDA_VISIT: AgendaItem = {
  ...AGENDA_ITEM,
  kind: 'VISIT',
  id: 'v-7',
  code: 'VIS-2026-00007',
  date: localIso(2026, 10, 12, 9, 0),
  endDate: null,
  typeLabel: 'Visita',
  typeId: null,
  subject: 'Presentar catálogo',
  project: PROJECT_REF,
  owner: OTHER_USER,
  status: { id: 'sv-canc', code: 'CANCELADA', label: 'Cancelada', group: 'CANCELLED' },
  isRescheduled: true,
  hasReminder: true,
  attachmentCount: 2,
  detailPath: '/actividad/visitas/v-7',
};

/** Evento con cambios sobre `AGENDA_ACTIVITY`. */
export function agendaItem(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return { ...AGENDA_ACTIVITY, ...overrides };
}

/** Respuesta de `GET /agenda/calendar`. */
export function calendarResponse(items: AgendaItem[], truncated = false): Response {
  return jsonResponse({ data: items, truncated });
}

/** Respuesta de `GET /customers/form-options` con la lista de países del filtro. */
export function countriesResponse(): Response {
  return jsonResponse({
    countries: [
      { id: 'co-gt', name: 'Guatemala' },
      { id: 'co-mx', name: 'México' },
    ],
  });
}

/** Respuesta de `GET /customers/{id}` para el chip del filtro de cliente. */
export function customerLookupResponse(): Response {
  return jsonResponse({ id: AGENDA_ITEM.customer.id, crmCode: AGENDA_ITEM.customer.crmCode, legalName: AGENDA_ITEM.customer.legalName, country: { id: 'co-gt' } });
}

/** jsdom no implementa `matchMedia`: pantalla estrecha (`< md`, móvil). */
export function simulateNarrowScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
