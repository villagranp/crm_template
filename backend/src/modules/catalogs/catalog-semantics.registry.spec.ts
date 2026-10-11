import {
  CATALOG_SEMANTICS,
  invariantViolations,
  itemRuleViolations,
  type SemanticItem,
  semanticsFor,
  validateMetadata,
} from './catalog-semantics.registry';

/** Las 17 claves de 00 §3.2. */
const CRM_CATALOG_KEYS = [
  'crm.tipo_empresa',
  'crm.estado_cliente',
  'crm.calificacion_cliente',
  'crm.tipo_proyecto',
  'crm.sector_proyecto',
  'crm.fase_cliente',
  'crm.etapa_oportunidad',
  'crm.resultado_oportunidad',
  'crm.motivo_resultado',
  'crm.estado_producto_asociado',
  'crm.tipo_actividad',
  'crm.estado_actividad',
  'crm.estado_visita',
  'crm.prioridad',
  'crm.motivo_reprogramacion',
  'crm.motivo_cancelacion',
  'crm.resultado_interaccion',
];

function semantics(key: string) {
  const found = semanticsFor(key);
  if (!found) throw new Error(`sin semántica: ${key}`);
  return found;
}

function active(code: string, metadata: Record<string, unknown>): SemanticItem {
  return { code, isActive: true, metadata };
}

describe('registro de semántica de catálogos', () => {
  it('declara exactamente los 17 catálogos crm.* de 00 §3.2', () => {
    expect([...CATALOG_SEMANTICS.keys()].sort()).toEqual([...CRM_CATALOG_KEYS].sort());
  });

  it('solo crm.resultado_oportunidad es conjunto cerrado, con WON/LOST/PARTIAL', () => {
    const closed = [...CATALOG_SEMANTICS.values()].filter((entry) => entry.closedSet);
    expect(closed.map((entry) => entry.key)).toEqual(['crm.resultado_oportunidad']);
    expect(closed[0]?.closedCodes).toEqual(['WON', 'LOST', 'PARTIAL']);
  });

  it('un catálogo que no es crm.* no tiene semántica', () => {
    expect(semanticsFor('tipos-cliente')).toBeUndefined();
  });

  // Metadata válido e inválido por catálogo (los válidos son los de la semilla de 00 §3.2).
  it.each<[string, Record<string, unknown> | null, Record<string, unknown> | null]>([
    ['crm.tipo_empresa', null, { color: 'azul' }],
    ['crm.tipo_proyecto', {}, { x: 1 }],
    ['crm.sector_proyecto', null, { x: 1 }],
    ['crm.motivo_reprogramacion', null, { x: 1 }],
    ['crm.motivo_cancelacion', null, { x: 1 }],
    ['crm.resultado_interaccion', null, { x: 1 }],
    ['crm.estado_cliente', { isActive: true }, {}],
    ['crm.calificacion_cliente', { rank: 1 }, { rank: 'A' }],
    ['crm.fase_cliente', { order: 1, isFinal: false, defaultProgress: 10 }, { order: 1, isFinal: false, defaultProgress: 150 }],
    ['crm.etapa_oportunidad', { order: 1, isClosed: false, outcome: null, inFunnel: true }, { order: 1, isClosed: 'sí', inFunnel: true }],
    ['crm.etapa_oportunidad', { order: 3, isClosed: true, outcome: 'WON', inFunnel: false }, { order: 3, isClosed: true, outcome: 'PARTIAL', inFunnel: false }],
    [
      'crm.resultado_oportunidad',
      { requiresReason: false, requiresAwardedPercent: true, stageOutcome: 'WON' },
      { requiresReason: false, requiresAwardedPercent: true, stageOutcome: 'PARTIAL' },
    ],
    ['crm.motivo_resultado', { appliesTo: ['LOST', 'PARTIAL'] }, { appliesTo: [] }],
    ['crm.estado_producto_asociado', { isActive: false }, { isActive: 1 }],
    ['crm.tipo_actividad', { isInteraction: true, fields: ['durationMinutes', 'summary'] }, { isInteraction: true, fields: ['a b'] }],
    ['crm.estado_actividad', { isOpen: true, isCompleted: false, isCancelled: false }, { isOpen: true, isCompleted: false }],
    [
      'crm.estado_visita',
      { isPending: true, isDone: false, isConfirmed: false, isCancelled: false, isRescheduled: true },
      { isPending: true, isDone: false, isConfirmed: false, isCancelled: false, isRescheduled: 'sí' },
    ],
    ['crm.prioridad', { weight: 3 }, { weight: 1.5 }],
  ])('%s: valida el metadata', (key, valid, invalid) => {
    expect(validateMetadata(semantics(key), valid)).toEqual([]);
    expect(validateMetadata(semantics(key), invalid).length).toBeGreaterThan(0);
  });

  it('señala la clave no admitida y la obligatoria ausente', () => {
    const issues = validateMetadata(semantics('crm.estado_cliente'), { isActive: true, otra: 1 });
    expect(issues).toEqual([expect.objectContaining({ field: 'metadata.otra' })]);
    expect(validateMetadata(semantics('crm.estado_cliente'), null)).toEqual([
      expect.objectContaining({ field: 'metadata.isActive' }),
    ]);
  });

  describe('reglas por elemento', () => {
    it('etapa: outcome solo en etapas cerradas', () => {
      const stages = semantics('crm.etapa_oportunidad');
      expect(itemRuleViolations(stages, { order: 1, isClosed: false, outcome: 'WON', inFunnel: true })).toHaveLength(1);
      expect(itemRuleViolations(stages, { order: 1, isClosed: true, outcome: 'WON', inFunnel: false })).toEqual([]);
    });

    it('estado de actividad: exactamente un indicador verdadero', () => {
      const states = semantics('crm.estado_actividad');
      expect(itemRuleViolations(states, { isOpen: true, isCompleted: true, isCancelled: false })).toHaveLength(1);
      expect(itemRuleViolations(states, { isOpen: false, isCompleted: false, isCancelled: false })).toHaveLength(1);
      expect(itemRuleViolations(states, { isOpen: false, isCompleted: true, isCancelled: false })).toEqual([]);
    });

    it('estado de visita: exactamente uno de los cuatro, e isRescheduled exige isPending', () => {
      const states = semantics('crm.estado_visita');
      const base = { isPending: false, isDone: false, isConfirmed: false, isCancelled: false };
      expect(itemRuleViolations(states, { ...base, isPending: true, isRescheduled: true })).toEqual([]);
      expect(itemRuleViolations(states, { ...base, isDone: true, isRescheduled: true })).toHaveLength(1);
      expect(itemRuleViolations(states, { ...base, isDone: true, isConfirmed: true })).toHaveLength(1);
    });
  });

  describe('invariantes del catálogo', () => {
    it('etapas: al menos una abierta, una WON y una LOST activas', () => {
      const stages = semantics('crm.etapa_oportunidad');
      const open = active('CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true });
      const won = active('GANADO', { order: 2, isClosed: true, outcome: 'WON', inFunnel: false });
      const lost = active('PERDIDO', { order: 3, isClosed: true, outcome: 'LOST', inFunnel: false });

      expect(invariantViolations(stages, [open, won, lost])).toEqual([]);
      expect(invariantViolations(stages, [open, lost])).toHaveLength(1);
      expect(invariantViolations(stages, [open, won, { ...lost, isActive: false }])).toHaveLength(1);
      expect(invariantViolations(stages, [won, lost])).toHaveLength(1);
    });

    it('fases: al menos una no final y una final activas', () => {
      const phases = semantics('crm.fase_cliente');
      const design = active('DISENO', { order: 1, isFinal: false });
      const done = active('FINALIZADO', { order: 4, isFinal: true });
      expect(invariantViolations(phases, [design, done])).toEqual([]);
      expect(invariantViolations(phases, [design])).toHaveLength(1);
      expect(invariantViolations(phases, [done])).toHaveLength(1);
    });

    it('estados de actividad: al menos un elemento activo por indicador', () => {
      const states = semantics('crm.estado_actividad');
      const items = [
        active('PENDIENTE', { isOpen: true, isCompleted: false, isCancelled: false }),
        active('COMPLETADA', { isOpen: false, isCompleted: true, isCancelled: false }),
        active('CANCELADA', { isOpen: false, isCompleted: false, isCancelled: true }),
      ];
      expect(invariantViolations(states, items)).toEqual([]);
      expect(invariantViolations(states, items.slice(0, 2))).toEqual([expect.stringContaining('isCancelled')]);
    });

    it('estados de visita: uno por indicador y como mucho un isRescheduled activo', () => {
      const states = semantics('crm.estado_visita');
      const base = { isPending: false, isDone: false, isConfirmed: false, isCancelled: false };
      const items = [
        active('PROGRAMADA', { ...base, isPending: true }),
        active('REPROGRAMADA', { ...base, isPending: true, isRescheduled: true }),
        active('REALIZADA', { ...base, isDone: true }),
        active('CONFIRMADA', { ...base, isConfirmed: true }),
        active('CANCELADA', { ...base, isCancelled: true }),
      ];
      expect(invariantViolations(states, items)).toEqual([]);
      // Sin REPROGRAMADA sigue siendo válido (la visita queda en el pendiente inicial, 04 D-04.3).
      expect(invariantViolations(states, items.filter((entry) => entry.code !== 'REPROGRAMADA'))).toEqual([]);
      expect(
        invariantViolations(states, [...items, active('OTRA', { ...base, isPending: true, isRescheduled: true })]),
      ).toHaveLength(1);
      expect(invariantViolations(states, items.filter((entry) => entry.code !== 'REALIZADA'))).toHaveLength(1);
    });

    it('catálogos sin invariantes no devuelven incumplimientos', () => {
      expect(invariantViolations(semantics('crm.tipo_empresa'), [])).toEqual([]);
    });
  });
});
