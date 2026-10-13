import { ALL_STAGES, DEFAULT_MAP, STAGES } from './testing/opportunity-fixtures';
import { allowedTransitions, classifyStageChange, mappedTargets, planStageChange, reopenTargets } from './stage-transition-policy';

const codes = (items: { code: string }[]) => items.map((item) => item.code);
const ALL = { canEdit: true, canClose: true, canReopen: true };

describe('stage-transition-policy (RN-03.40–RN-03.43, PF-03.60)', () => {
  it('mapa por defecto: destinos listados, activos y ordenados por metadata.order', () => {
    expect(codes(mappedTargets(STAGES.CONTACTADO, ALL_STAGES, DEFAULT_MAP))).toEqual(['COTIZANDO', 'GANADO', 'PERDIDO']);
    expect(codes(mappedTargets(STAGES.GANADO, ALL_STAGES, DEFAULT_MAP))).toEqual([]);
  });

  it('destinos inactivos o inexistentes en el catálogo se ignoran', () => {
    const map = { ...DEFAULT_MAP, CONTACTADO: ['ARCHIVADA', 'NO_EXISTE', 'COTIZANDO'] };
    expect(codes(mappedTargets(STAGES.CONTACTADO, ALL_STAGES, map))).toEqual(['COTIZANDO']);
  });

  it('regla de respaldo: una abierta no listada va a cualquier activa (salvo ella); una cerrada no listada, a ninguna', () => {
    expect(codes(mappedTargets(STAGES.NEGOCIANDO, ALL_STAGES, DEFAULT_MAP))).toEqual(['CONTACTADO', 'COTIZANDO', 'GANADO', 'PERDIDO']);
    expect(codes(mappedTargets(STAGES.GANADO, ALL_STAGES, { CONTACTADO: [] }))).toEqual([]);
  });

  it('clasifica misma etapa, reapertura, transición y no permitida', () => {
    expect(classifyStageChange(STAGES.COTIZANDO, STAGES.COTIZANDO, ALL_STAGES, DEFAULT_MAP)).toBe('UNCHANGED');
    expect(classifyStageChange(STAGES.PERDIDO, STAGES.COTIZANDO, ALL_STAGES, DEFAULT_MAP)).toBe('REOPEN');
    expect(classifyStageChange(STAGES.CONTACTADO, STAGES.GANADO, ALL_STAGES, DEFAULT_MAP)).toBe('TRANSITION');
    expect(classifyStageChange(STAGES.CONTACTADO, STAGES.GANADO, ALL_STAGES, { ...DEFAULT_MAP, CONTACTADO: ['COTIZANDO'] })).toBe('NOT_ALLOWED');
    expect(classifyStageChange(STAGES.GANADO, STAGES.PERDIDO, ALL_STAGES, DEFAULT_MAP)).toBe('NOT_ALLOWED');
  });

  it('reapertura: cualquier abierta activa, solo desde una cerrada', () => {
    expect(codes(reopenTargets(STAGES.GANADO, ALL_STAGES))).toEqual(['CONTACTADO', 'COTIZANDO', 'NEGOCIANDO']);
    expect(reopenTargets(STAGES.COTIZANDO, ALL_STAGES)).toEqual([]);
  });

  it('allowedTransitions según lo que el usuario puede hacer', () => {
    expect(codes(allowedTransitions(STAGES.COTIZANDO, ALL_STAGES, DEFAULT_MAP, ALL))).toEqual(['CONTACTADO', 'GANADO', 'PERDIDO']);
    expect(codes(allowedTransitions(STAGES.COTIZANDO, ALL_STAGES, DEFAULT_MAP, { ...ALL, canClose: false }))).toEqual(['CONTACTADO']);
    expect(allowedTransitions(STAGES.COTIZANDO, ALL_STAGES, DEFAULT_MAP, { ...ALL, canEdit: false })).toEqual([]);
    expect(codes(allowedTransitions(STAGES.GANADO, ALL_STAGES, DEFAULT_MAP, ALL))).toEqual(['CONTACTADO', 'COTIZANDO', 'NEGOCIANDO']);
    expect(allowedTransitions(STAGES.GANADO, ALL_STAGES, DEFAULT_MAP, { ...ALL, canReopen: false })).toEqual([]);
    // Una cerrada hacia una abierta listada en el mapa sigue siendo reapertura (sin `administrar`, no se ofrece).
    expect(allowedTransitions(STAGES.GANADO, ALL_STAGES, { GANADO: ['COTIZANDO'] }, { ...ALL, canReopen: false })).toEqual([]);
  });

  describe('planStageChange (03 F.2 pasos 2–5)', () => {
    const base = { hasComment: false, hasResult: false, currentResult: false, canClose: true, canReopen: true };
    const plan = (from: keyof typeof STAGES, to: keyof typeof STAGES, overrides: Partial<typeof base> = {}, map: Record<string, string[]> = DEFAULT_MAP) =>
      planStageChange({ ...base, ...overrides, from: STAGES[from], to: STAGES[to] }, ALL_STAGES, map);

    it('rechazos en orden', () => {
      expect(plan('COTIZANDO', 'COTIZANDO')).toEqual({ kind: 'REJECT', reason: 'STAGE_UNCHANGED' });
      expect(plan('GANADO', 'COTIZANDO', { canReopen: false, hasComment: true })).toEqual({ kind: 'REJECT', reason: 'REOPEN_FORBIDDEN' });
      expect(plan('GANADO', 'COTIZANDO')).toEqual({ kind: 'REJECT', reason: 'COMMENT_REQUIRED' });
      expect(plan('GANADO', 'COTIZANDO', { hasComment: true, hasResult: true })).toEqual({ kind: 'REJECT', reason: 'RESULT_NOT_ALLOWED' });
      expect(plan('GANADO', 'PERDIDO', { hasResult: true })).toEqual({ kind: 'REJECT', reason: 'INVALID_STAGE_TRANSITION' });
      expect(plan('COTIZANDO', 'GANADO', { canClose: false, hasResult: true })).toEqual({ kind: 'REJECT', reason: 'CLOSE_FORBIDDEN' });
      expect(plan('COTIZANDO', 'GANADO')).toEqual({ kind: 'REJECT', reason: 'RESULT_REQUIRED' });
      expect(plan('COTIZANDO', 'CONTACTADO', { hasResult: true })).toEqual({ kind: 'REJECT', reason: 'RESULT_NOT_ALLOWED' });
    });

    it('planes válidos', () => {
      expect(plan('GANADO', 'COTIZANDO', { hasComment: true, currentResult: true })).toEqual({ kind: 'REOPEN' });
      expect(plan('CONTACTADO', 'COTIZANDO')).toEqual({ kind: 'ADVANCE' });
      expect(plan('COTIZANDO', 'GANADO', { hasResult: true })).toEqual({ kind: 'CLOSE', replacesResult: false });
      expect(plan('GANADO', 'PERDIDO', { hasResult: true, currentResult: true }, { ...DEFAULT_MAP, GANADO: ['PERDIDO'] })).toEqual({
        kind: 'CLOSE',
        replacesResult: true,
      });
    });
  });
});
