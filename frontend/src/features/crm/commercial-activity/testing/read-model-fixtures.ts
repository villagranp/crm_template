import type { FollowUpRow, FollowUpTrace, Interaction, TraceAttachment } from '../common/commercial-activity.api';

import { CUSTOMER_REF, INTERACTION, ME, OTHER_USER, PROJECT_REF, TRACE, TYPE_CALL } from './fixtures';

/**
 * Datos de prueba de los modelos de lectura de seguimiento (E.4) e historial
 * (E.5). Ficticios (dominios `.example`), nunca de clientes reales.
 */

/** "Hoy" fijo de las pruebas que comparan fechas de calendario (mediodía UTC: el mismo día en casi cualquier zona). */
export const FROZEN_NOW = new Date('2026-10-12T12:00:00.000Z');

export const OTHER_CUSTOMER_REF = { id: 'c-2', crmCode: 'CLI-000002', legalName: 'Aceros del Norte S.A.' };

/** Interacción de una actividad completada (llamada). */
export const ACTIVITY_INTERACTION: Interaction = {
  sourceType: 'ACTIVITY',
  sourceId: 'a-1',
  sourceCode: 'ACT-2026-000001',
  occurredAt: '2026-10-07T17:30:00.000Z',
  typeLabel: TYPE_CALL.label,
  typeId: TYPE_CALL.id,
  user: OTHER_USER,
  customer: OTHER_CUSTOMER_REF,
  project: null,
  opportunity: { id: 'o-1', code: 'OPO-2026-00001' },
  subject: 'Llamar para cotización',
  summary: 'Pidió precios por volumen.',
  result: null,
  nextAction: null,
  nextActionDate: null,
  sourcePath: '/actividad/actividades/a-1',
};

export function interaction(overrides: Partial<Interaction> = {}): Interaction {
  return { ...INTERACTION, ...overrides };
}

export const LONG_NOTES =
  'Interesados en la línea premium para la torre norte; piden muestras de acabados, plazos de entrega por fase y condiciones de crédito a 90 días.';

/** Fila por cliente: última interacción = visita, próxima acción vencida. */
export function followUpRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    customer: CUSTOMER_REF,
    project: null,
    lastInteraction: {
      sourceType: 'VISIT',
      sourceId: 'v-1',
      sourceCode: 'VIS-2026-00001',
      occurredAt: '2026-10-05T16:00:00.000Z',
      typeLabel: 'Visita',
      summary: LONG_NOTES,
    },
    nextAction: 'Enviar cotización',
    nextActionDate: '2026-10-01',
    nextActionSource: { sourceType: 'VISIT', sourceId: 'v-1', sourceCode: 'VIS-2026-00001' },
    responsible: ME,
    notes: LONG_NOTES,
    attachmentCount: 3,
    ...overrides,
  };
}

/** Fila de otro cliente: última interacción = actividad, próxima acción hoy. */
export const ACTIVITY_FOLLOW_UP_ROW: FollowUpRow = followUpRow({
  customer: OTHER_CUSTOMER_REF,
  lastInteraction: {
    sourceType: 'ACTIVITY',
    sourceId: 'a-1',
    sourceCode: 'ACT-2026-000001',
    occurredAt: '2026-10-07T17:30:00.000Z',
    typeLabel: 'Llamada',
    summary: 'Pidió precios por volumen.',
  },
  nextAction: 'Llamar de nuevo',
  nextActionDate: '2026-10-12',
  nextActionSource: { sourceType: 'ACTIVITY', sourceId: 'a-1', sourceCode: 'ACT-2026-000001' },
  responsible: OTHER_USER,
  notes: 'Pidió precios por volumen.',
  attachmentCount: 0,
});

/** Fila de la vista por proyecto. */
export const PROJECT_FOLLOW_UP_ROW: FollowUpRow = followUpRow({ project: PROJECT_REF, nextActionDate: '2026-10-20' });

/** Ruta de descarga del adjunto de la trazabilidad: relativa a la base de la API, con ids reales (uuid). */
export const TRACE_CONTENT_PATH = '/visits/0b6e1c2a-0000-4000-8000-000000000001/attachments/0b6e1c2a-0000-4000-8000-0000000000a1/content';

export const TRACE_ATTACHMENT: TraceAttachment = {
  id: 'att-1',
  fileName: 'acta de visita.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  description: null,
  createdAt: '2026-10-05T17:00:00.000Z',
  createdBy: ME,
  ownerType: 'VISIT',
  sourceId: 'v-1',
  sourceCode: 'VIS-2026-00001',
  eventId: null,
  contentPath: TRACE_CONTENT_PATH,
  sourcePath: '/actividad/visitas/v-1',
};

/** Trazabilidad completa del cliente `c-1`: timeline, próximos y adjuntos. */
export const FULL_TRACE: FollowUpTrace = {
  ...TRACE,
  row: followUpRow(),
  interactions: [INTERACTION, interaction({ sourceId: 'v-0', sourceCode: 'VIS-2026-00000', occurredAt: '2026-09-28T15:00:00.000Z', sourcePath: '/actividad/visitas/v-0' })],
  attachments: [TRACE_ATTACHMENT],
};
