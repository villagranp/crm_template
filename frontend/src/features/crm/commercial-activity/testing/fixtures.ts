import { vi } from 'vitest';

import type { MenuModule } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse } from '@/test/api-mocks';

import type { ActivityDetail, ActivityFormOptions, ActivityListItem, PendingActivity } from '../activities/activities.api';
import type { AgendaItem, FollowUpTrace, Interaction } from '../common/commercial-activity.api';

/**
 * Datos y ayudantes de las pruebas de Actividad comercial. Datos ficticios
 * (dominios `.example`), nunca de clientes reales.
 */

export const ME = { id: 'u-1', displayName: 'Ana Asesora' };
export const OTHER_USER = { id: 'u-2', displayName: 'Luis Gerente' };
export const CUSTOMER_REF = { id: 'c-1', crmCode: 'CLI-000001', legalName: 'Constructora Peña S.A.' };
export const PROJECT_REF = { id: 'p-1', code: 'PRY-2026-00001', name: 'Torre Norte' };

export const TYPE_CALL = {
  id: 't-call',
  code: 'LLAMADA',
  label: 'Llamada',
  sortOrder: 1,
  fields: ['scheduledAt', 'durationMinutes', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'],
  isInteraction: true,
};
export const TYPE_EMAIL = {
  id: 't-mail',
  code: 'CORREO',
  label: 'Correo',
  sortOrder: 3,
  fields: ['scheduledAt', 'participants', 'summary', 'resultId', 'resultNotes', 'nextAction', 'nextActionDate'],
  isInteraction: true,
};
export const TYPE_TASK = { id: 't-task', code: 'TAREA', label: 'Tarea', sortOrder: 4, fields: ['scheduledAt', 'resultId', 'resultNotes'], isInteraction: false };

export const STATUS_PENDING = { id: 's-pend', code: 'PENDIENTE', label: 'Pendiente', sortOrder: 1, group: 'OPEN' as const };
export const STATUS_IN_PROGRESS = { id: 's-proc', code: 'EN_PROCESO', label: 'En proceso', sortOrder: 2, group: 'OPEN' as const };
export const STATUS_DONE = { id: 's-done', code: 'COMPLETADA', label: 'Completada', sortOrder: 3, group: 'COMPLETED' as const };
export const STATUS_CANCELLED = { id: 's-canc', code: 'CANCELADA', label: 'Cancelada', sortOrder: 4, group: 'CANCELLED' as const };

export const PRIORITY_HIGH = { id: 'pr-alta', code: 'ALTA', label: 'Alta', sortOrder: 1, weight: 30 };
export const PRIORITY_MEDIUM = { id: 'pr-media', code: 'MEDIA', label: 'Media', sortOrder: 2, weight: 20 };
export const RESULT_OK = { id: 'r-ok', code: 'INTERESADO', label: 'Interesado', sortOrder: 1 };

/**
 * Zona del navegador de la máquina de pruebas: los `form-options` la publican
 * como zona del usuario y de negocio para que las pruebas que comparan con
 * `new Date('…T00:00')` sigan valiendo en cualquier máquina. Las pruebas de
 * zona fijan otra explícitamente.
 */
export const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Límites de adjuntos de los `form-options` del módulo (D.5). */
export const ATTACHMENT_OPTIONS = { enabled: true, maxMb: 1, allowedTypes: ['application/pdf', 'image/png'] };

/** Contexto común de los `form-options` del módulo (`CommercialFormContextDto`). */
export const FORM_CONTEXT = { timeZone: BROWSER_TIME_ZONE, businessTimeZone: BROWSER_TIME_ZONE, attachments: ATTACHMENT_OPTIONS };

export const FORM_OPTIONS: ActivityFormOptions = {
  ...FORM_CONTEXT,
  types: [TYPE_CALL, TYPE_EMAIL, TYPE_TASK],
  statuses: [STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_DONE, STATUS_CANCELLED],
  priorities: [PRIORITY_HIGH, PRIORITY_MEDIUM],
  results: [RESULT_OK],
  defaults: { priorityId: PRIORITY_MEDIUM.id, statusId: STATUS_PENDING.id },
  requiredFields: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'],
  dueSoonHours: 48,
};

function typeRef(type: typeof TYPE_CALL) {
  return { id: type.id, code: type.code, label: type.label, fields: type.fields, isInteraction: type.isInteraction };
}

export const ACTIVITY_DETAIL: ActivityDetail = {
  id: 'a-1',
  code: 'ACT-2026-000001',
  type: typeRef(TYPE_CALL),
  subject: 'Llamar para cotización',
  description: 'Preguntar por el volumen.',
  customer: CUSTOMER_REF,
  project: null,
  opportunity: null,
  owner: ME,
  status: { id: STATUS_PENDING.id, code: STATUS_PENDING.code, label: STATUS_PENDING.label, group: 'PENDING' },
  priority: { id: PRIORITY_HIGH.id, code: PRIORITY_HIGH.code, label: PRIORITY_HIGH.label, weight: PRIORITY_HIGH.weight },
  scheduledAt: '2026-10-12T15:00:00.000Z',
  dueAt: '2026-10-13T15:00:00.000Z',
  dueBucket: 'DUE_SOON',
  durationMinutes: 30,
  participants: [{ id: 'pa-1', role: 'INVITED', kind: 'EXTERNAL', contactId: null, userId: null, displayName: 'Pedro Externo' }],
  summary: null,
  result: null,
  resultNotes: null,
  nextAction: null,
  nextActionDate: null,
  completion: null,
  cancelledAt: null,
  attachmentCount: 0,
  access: 'DIRECT',
  allowedActions: ['EDIT', 'COMPLETE', 'CANCEL', 'DELETE'],
  createdAt: '2026-10-01T15:00:00.000Z',
  createdBy: ME,
  updatedAt: '2026-10-02T15:00:00.000Z',
  updatedBy: ME,
};

export const ACTIVITY_LIST_ITEM: ActivityListItem = {
  id: ACTIVITY_DETAIL.id,
  code: ACTIVITY_DETAIL.code,
  type: ACTIVITY_DETAIL.type,
  subject: ACTIVITY_DETAIL.subject,
  customer: CUSTOMER_REF,
  project: PROJECT_REF,
  opportunity: null,
  owner: ME,
  status: ACTIVITY_DETAIL.status,
  priority: ACTIVITY_DETAIL.priority,
  scheduledAt: ACTIVITY_DETAIL.scheduledAt,
  dueAt: ACTIVITY_DETAIL.dueAt,
  dueBucket: 'DUE_SOON',
  result: null,
  attachmentCount: 2,
  allowedActions: ['EDIT', 'COMPLETE', 'CANCEL', 'DELETE'],
};

export function pendingItem(overrides: Partial<PendingActivity> = {}): PendingActivity {
  return {
    id: 'a-1',
    code: 'ACT-2026-000001',
    type: typeRef(TYPE_CALL),
    subject: 'Llamar para cotización',
    dueAt: '2026-10-10T15:00:00.000Z',
    scheduledAt: null,
    bucket: 'OVERDUE',
    priority: ACTIVITY_DETAIL.priority,
    owner: ME,
    customer: CUSTOMER_REF,
    project: null,
    status: { ...ACTIVITY_DETAIL.status, group: 'OVERDUE' },
    allowedActions: ['EDIT', 'COMPLETE', 'CANCEL', 'DELETE'],
    ...overrides,
  };
}

export const INTERACTION: Interaction = {
  sourceType: 'VISIT',
  sourceId: 'v-1',
  sourceCode: 'VIS-2026-00001',
  occurredAt: '2026-10-05T16:00:00.000Z',
  typeLabel: 'Visita',
  typeId: null,
  user: ME,
  customer: CUSTOMER_REF,
  project: PROJECT_REF,
  opportunity: null,
  subject: 'Presentar catálogo',
  summary: 'Interesados en la línea premium.',
  result: { id: RESULT_OK.id, code: RESULT_OK.code, label: RESULT_OK.label },
  nextAction: 'Enviar cotización',
  nextActionDate: '2026-10-20',
  sourcePath: '/actividad/visitas/v-1',
};

export const AGENDA_ITEM: AgendaItem = {
  kind: 'ACTIVITY',
  id: 'a-9',
  code: 'ACT-2026-000009',
  date: '2026-10-15T15:00:00.000Z',
  endDate: null,
  typeLabel: 'Llamada',
  typeId: TYPE_CALL.id,
  subject: 'Seguimiento de cotización',
  customer: CUSTOMER_REF,
  project: null,
  owner: ME,
  status: { id: STATUS_PENDING.id, code: STATUS_PENDING.code, label: STATUS_PENDING.label, group: 'PENDING' },
  isRescheduled: false,
  isUnregistered: false,
  hasReminder: false,
  attachmentCount: 0,
  detailPath: '/actividad/actividades/a-9',
};

export const TRACE: FollowUpTrace = {
  row: {
    customer: CUSTOMER_REF,
    project: null,
    lastInteraction: {
      sourceType: 'VISIT',
      sourceId: 'v-1',
      sourceCode: 'VIS-2026-00001',
      occurredAt: INTERACTION.occurredAt,
      typeLabel: 'Visita',
      summary: INTERACTION.summary,
    },
    nextAction: 'Enviar cotización',
    nextActionDate: '2026-10-20',
    nextActionSource: { sourceType: 'VISIT', sourceId: 'v-1', sourceCode: 'VIS-2026-00001' },
    responsible: ME,
    notes: INTERACTION.summary,
    attachmentCount: 3,
  },
  interactions: [INTERACTION],
  upcoming: [AGENDA_ITEM],
  attachments: [],
};

export function page<T>(items: T[], totalItems = items.length) {
  return jsonResponse({ data: items, pagination: { page: 1, pageSize: 20, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 20)) } });
}

export function menu(optionKeys: string[]): MenuModule[] {
  return [
    {
      key: 'crm',
      label: 'CRM',
      icon: null,
      order: 10,
      isSystem: false,
      options: optionKeys.map((key) => ({ id: `o-${key}`, key, label: key, icon: null, path: `/${key}`, order: 1, requiredPermission: null, children: [] })),
    },
  ];
}

export const ASESOR_PERMISSIONS = [
  'clientes.ver',
  'contactos.ver',
  'actividades.ver',
  'actividades.crear',
  'actividades.editar',
  'actividades.cerrar',
  'visitas.ver',
  'visitas.crear',
];

export function signInWith(permissions: string[]): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: ME.id, displayName: ME.displayName, email: 'ana@example.test', roles: ['asesor'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

export function signOut(): void {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
}

/** jsdom no implementa `matchMedia`: pantalla ancha (tablas, no tarjetas). */
export function simulateWideScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
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

/** Cuerpo JSON enviado en una llamada registrada por `mockApi`. */
export function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

/** Parámetros de la última llamada a una ruta (sin el prefijo `/api/v1`). */
export function lastQuery(fetchMock: { mock: { calls: unknown[][] } }, path: string): URLSearchParams {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.replace(/^\/api\/v1/, '') === path);
  return urls[urls.length - 1]?.searchParams ?? new URLSearchParams();
}
