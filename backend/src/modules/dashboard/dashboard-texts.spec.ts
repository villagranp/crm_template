import { eventSummary, truncate } from './dashboard-activity.service';
import { alertDescription } from './dashboard-alerts.service';
import type { AlertRecord } from './ports/alerts-read-model.port';

const DETAIL = { subject: null, fromLabel: null, toLabel: null, outcome: null, action: null, progress: null };

describe('resúmenes de la actividad reciente (01 D.5, RN-01.21, RN-01.23)', () => {
  it.each([
    ['ACTIVIDAD_REGISTRADA', 'ACTIVITY', { subject: 'Preparar propuesta' }, 'Actividad registrada: Preparar propuesta'],
    ['INTERACCION', 'VISIT', { subject: 'Revisar obra' }, 'Visita: Revisar obra'],
    ['INTERACCION', 'ACTIVITY', { subject: 'Llamada' }, 'Interacción: Llamada'],
    ['OPORTUNIDAD_ETAPA', 'OPPORTUNITY', { fromLabel: 'Contactado', toLabel: 'Cotizando' }, 'Contactado → Cotizando'],
    ['OPORTUNIDAD_ETAPA', 'OPPORTUNITY', { fromLabel: 'Ganado', toLabel: 'Cotizando', action: 'CLEARED' }, 'Ganado → Cotizando · resultado anulado'],
    ['OPORTUNIDAD_CERRADA', 'OPPORTUNITY', { fromLabel: 'Cotizando', toLabel: 'Ganado', outcome: 'WON' }, 'Cotizando → Ganado · Ganada'],
    ['OPORTUNIDAD_RESULTADO', 'OPPORTUNITY', { action: 'CHANGED', outcome: 'PARTIAL' }, 'Resultado modificado: Ganada parcial'],
    ['OPORTUNIDAD_RESULTADO', 'OPPORTUNITY', { action: 'CLEARED' }, 'Resultado eliminado'],
    ['PROYECTO_FASE', 'PROJECT', { fromLabel: 'Diseño', toLabel: 'Construcción', progress: '40.00' }, 'Diseño → Construcción (40.00 %)'],
    ['OPORTUNIDAD_CREADA', 'OPPORTUNITY', {}, 'Oportunidad OPO-1 creada'],
  ] as const)('%s (%s) → %j', (eventType, sourceType, detail, expected) => {
    expect(eventSummary({ eventType, sourceType, sourceCode: 'OPO-1', detail: { ...DETAIL, ...detail } })).toBe(expected);
  });

  it('trunca a 200 caracteres sin partir caracteres compuestos y normaliza espacios', () => {
    const long = truncate(`${'ñ'.repeat(250)}`);
    expect([...long]).toHaveLength(200);
    expect(long.endsWith('…')).toBe(true);
    expect(truncate('  a \n b  ')).toBe('a b');
  });
});

describe('descripciones de alertas (01 D.6)', () => {
  const base: AlertRecord = {
    type: 'ACTIVIDAD_VENCIDA',
    sourceId: 's',
    sourceCode: 'ACT-2026-000042',
    referenceDate: new Date('2026-10-07T12:00:00Z'),
    owner: { id: 'u', displayName: 'Ana' },
    customer: null,
    project: null,
    subject: 'Llamar a compras',
    sourceProjectId: null,
  };
  const now = new Date('2026-10-10T13:00:00Z');

  it('usa las plantillas con días y fechas en la zona del negocio', () => {
    expect(alertDescription(base, now, 'America/Guatemala')).toBe('Actividad ACT-2026-000042 «Llamar a compras» vencida hace 3 días');
    expect(alertDescription({ ...base, referenceDate: new Date('2026-10-10T10:00:00Z') }, now, 'America/Guatemala')).toBe(
      'Actividad ACT-2026-000042 «Llamar a compras» vencida hoy',
    );
    // 2026-10-08 02:00 UTC = 7 de octubre en Guatemala.
    expect(alertDescription({ ...base, type: 'VISITA_SIN_CONFIRMAR', sourceCode: 'VIS-1', referenceDate: new Date('2026-10-08T02:00:00Z') }, now, 'America/Guatemala')).toBe(
      'Visita VIS-1 realizada el 07/10/2026 pendiente de confirmación',
    );
    expect(alertDescription({ ...base, type: 'PROYECTO_SIN_ACTUALIZAR', sourceCode: 'PRY-1', referenceDate: new Date('2026-09-09T13:00:00Z') }, now, 'America/Guatemala')).toBe(
      'Proyecto PRY-1 sin actualizaciones desde hace 31 días',
    );
    expect(alertDescription({ ...base, type: 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION', sourceCode: 'OPO-1', subject: 'Cotizando' }, now, 'America/Guatemala')).toBe(
      'Oportunidad OPO-1 en etapa Cotizando sin siguiente acción',
    );
  });
});
