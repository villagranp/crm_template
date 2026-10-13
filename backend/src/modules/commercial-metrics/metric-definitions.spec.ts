import {
  addMonths,
  businessMonth,
  closedStageIds,
  commercialStatus,
  compareYearMonth,
  finalPhaseIds,
  forecastWindowMonths,
  isActiveProject,
  isClosedStage,
  isFinalPhase,
  isInForecastWindow,
  isLostOutcome,
  isOpenStage,
  isWonOutcome,
  nonFinalPhaseIds,
  openStageIds,
  projectLastUpdate,
  type SemanticCatalogItem,
} from './metric-definitions';

function item(code: string, metadata: Record<string, unknown> | null): SemanticCatalogItem {
  return { id: `id-${code}`, code, label: code.charAt(0) + code.slice(1).toLowerCase(), metadata };
}

// Etapas del catálogo sembrado (00 §3.2).
const CONTACTADO = item('CONTACTADO', { order: 1, isClosed: false, outcome: null, inFunnel: true });
const COTIZANDO = item('COTIZANDO', { order: 2, isClosed: false, outcome: null, inFunnel: true });
const GANADO = item('GANADO', { order: 3, isClosed: true, outcome: 'WON', inFunnel: true });
const PERDIDO = item('PERDIDO', { order: 4, isClosed: true, outcome: 'LOST', inFunnel: false });
const STAGES = [CONTACTADO, COTIZANDO, GANADO, PERDIDO];

const DISENO = item('DISENO', { order: 1, isFinal: false, defaultProgress: 0 });
const FINALIZADO = item('FINALIZADO', { order: 4, isFinal: true, defaultProgress: 100 });

describe('metric-definitions', () => {
  describe('DEF-A: abierta / cerrada', () => {
    it('cerrada = etapa con isClosed = true; abierta = no cerrada', () => {
      expect(isClosedStage(GANADO)).toBe(true);
      expect(isClosedStage(PERDIDO)).toBe(true);
      expect(isOpenStage(CONTACTADO)).toBe(true);
      expect(isOpenStage(COTIZANDO)).toBe(true);
    });

    it('una etapa sin metadata (o con isClosed no booleano) es abierta', () => {
      expect(isOpenStage(item('NUEVA', null))).toBe(true);
      expect(isOpenStage(item('RARA', { isClosed: 'true' }))).toBe(true);
    });

    it('ids para filtros SQL', () => {
      expect(openStageIds(STAGES)).toEqual(['id-CONTACTADO', 'id-COTIZANDO']);
      expect(closedStageIds(STAGES)).toEqual(['id-GANADO', 'id-PERDIDO']);
    });
  });

  it('resultado: ganada = WON o PARTIAL (DM-15); perdida = LOST', () => {
    expect(isWonOutcome('WON')).toBe(true);
    expect(isWonOutcome('PARTIAL')).toBe(true);
    expect(isWonOutcome('LOST')).toBe(false);
    expect(isWonOutcome(null)).toBe(false);
    expect(isLostOutcome('LOST')).toBe(true);
    expect(isLostOutcome('PARTIAL')).toBe(false);
  });

  describe('RN-03.15: proyecto activo', () => {
    it('no eliminado y fase no final', () => {
      expect(isActiveProject({ deletedAt: null, phase: DISENO })).toBe(true);
      expect(isActiveProject({ deletedAt: null, phase: FINALIZADO })).toBe(false);
      expect(isActiveProject({ deletedAt: new Date(), phase: DISENO })).toBe(false);
    });

    it('ids de fases finales y no finales', () => {
      expect(isFinalPhase(FINALIZADO)).toBe(true);
      expect(nonFinalPhaseIds([DISENO, FINALIZADO])).toEqual(['id-DISENO']);
      expect(finalPhaseIds([DISENO, FINALIZADO])).toEqual(['id-FINALIZADO']);
    });
  });

  describe('DEF-B: estado comercial (RN-03.14, PF-05.4)', () => {
    it('con abiertas: la etapa abierta de mayor orden, aunque haya cerradas ganadas', () => {
      expect(
        commercialStatus([
          { stage: CONTACTADO, outcome: null },
          { stage: COTIZANDO, outcome: null },
          { stage: GANADO, outcome: 'WON' },
        ]),
      ).toEqual({ kind: 'OPEN_STAGE', label: 'Cotizando', stage: { id: 'id-COTIZANDO', code: 'COTIZANDO', label: 'Cotizando' } });
    });

    it('sin abiertas y alguna WON o PARTIAL → Ganado', () => {
      expect(commercialStatus([{ stage: PERDIDO, outcome: 'LOST' }, { stage: GANADO, outcome: 'PARTIAL' }])).toEqual({
        kind: 'WON',
        label: 'Ganado',
        stage: null,
      });
    });

    it('todas las cerradas LOST → Perdido', () => {
      expect(commercialStatus([{ stage: PERDIDO, outcome: 'LOST' }])).toEqual({ kind: 'LOST', label: 'Perdido', stage: null });
    });

    it('sin oportunidades vigentes (las eliminadas no cuentan) → Sin oportunidades', () => {
      const expected = { kind: 'NO_OPPORTUNITIES', label: 'Sin oportunidades', stage: null };
      expect(commercialStatus([])).toEqual(expected);
      expect(commercialStatus([{ stage: COTIZANDO, outcome: null, deletedAt: new Date() }])).toEqual(expected);
    });

    it('una abierta eliminada no tapa el resultado de las vigentes', () => {
      expect(
        commercialStatus([
          { stage: COTIZANDO, outcome: null, deletedAt: new Date() },
          { stage: GANADO, outcome: 'WON', deletedAt: null },
        ]).kind,
      ).toBe('WON');
    });

    it('empate de orden entre etapas abiertas: gana el código menor (determinista)', () => {
      const a = item('ALFA', { order: 5, isClosed: false });
      const b = item('BETA', { order: 5, isClosed: false });
      expect(commercialStatus([{ stage: b, outcome: null }, { stage: a, outcome: null }]).stage?.code).toBe('ALFA');
    });
  });

  it('DEF-C: la última actualización es last_activity_at', () => {
    const at = new Date('2026-10-01T12:00:00Z');
    expect(projectLastUpdate({ lastActivityAt: at })).toBe(at);
  });

  describe('DEF-G: ventana de forecast', () => {
    const GUATEMALA = 'America/Guatemala';

    it('M+1 … M+6 desde el mes en curso', () => {
      const clock = { now: new Date('2026-10-11T15:00:00Z'), businessTimeZone: GUATEMALA };
      expect(forecastWindowMonths(clock, 6)).toEqual([
        { year: 2026, month: 11 },
        { year: 2026, month: 12 },
        { year: 2027, month: 1 },
        { year: 2027, month: 2 },
        { year: 2027, month: 3 },
        { year: 2027, month: 4 },
      ]);
    });

    it('el mes en curso se calcula en la zona del negocio (31-dic 22:00 en Guatemala = 1-ene UTC)', () => {
      const clock = { now: new Date('2027-01-01T04:00:00Z'), businessTimeZone: GUATEMALA };
      expect(businessMonth(clock)).toEqual({ year: 2026, month: 12 });
      expect(forecastWindowMonths(clock, 1)).toEqual([{ year: 2027, month: 1 }]);
      expect(businessMonth({ ...clock, businessTimeZone: 'UTC' })).toEqual({ year: 2027, month: 1 });
    });

    it('cambio de año correcto al sumar y restar meses', () => {
      expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
      expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
      expect(addMonths({ year: 2026, month: 10 }, 26)).toEqual({ year: 2028, month: 12 });
      expect(compareYearMonth({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBe(1);
    });

    it('isInForecastWindow: M y los pasados quedan fuera; M+H dentro; M+H+1 fuera (D-03.5)', () => {
      const clock = { now: new Date('2026-10-11T15:00:00Z'), businessTimeZone: GUATEMALA };
      expect(isInForecastWindow({ year: 2026, month: 10 }, clock, 6)).toBe(false);
      expect(isInForecastWindow({ year: 2026, month: 9 }, clock, 6)).toBe(false);
      expect(isInForecastWindow({ year: 2026, month: 11 }, clock, 6)).toBe(true);
      expect(isInForecastWindow({ year: 2027, month: 4 }, clock, 6)).toBe(true);
      expect(isInForecastWindow({ year: 2027, month: 5 }, clock, 6)).toBe(false);
    });

    it('el horizonte debe ser un entero positivo', () => {
      const clock = { now: new Date(), businessTimeZone: GUATEMALA };
      expect(() => forecastWindowMonths(clock, 0)).toThrow(RangeError);
      expect(() => forecastWindowMonths(clock, 2.5)).toThrow(RangeError);
    });
  });
});
