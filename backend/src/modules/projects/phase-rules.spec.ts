import { defaultProgressOf, isPhaseUnchanged, progressIssue, progressRuleIssue, resolveTargetProgress } from './phase-rules';

describe('phase-rules (03 C.6)', () => {
  it('progressIssue: 0–100 con hasta 2 decimales (RN-03.33)', () => {
    for (const valid of ['0', '0.00', '45.5', '99.99', '100', '100.00']) {
      expect(progressIssue(valid)).toBeNull();
    }
    for (const invalid of ['-1', '-0.01', '100.01', '101', '1000', '50.123', 'abc']) {
      expect(progressIssue(invalid)).toEqual({
        field: 'progress',
        code: 'INVALID_PROGRESS',
        message: 'The progress must be between 0 and 100',
        min: '0',
        max: '100',
      });
    }
  });

  describe('progressRuleIssue (RN-03.34, PF-03.52)', () => {
    const rules = { FINALIZADO: { progresoMinimo: 100 } };

    it('FINALIZADO por debajo de 100 es inválido; 100 es válido', () => {
      expect(progressRuleIssue('FINALIZADO', '90.00', rules)).toEqual({
        field: 'progress',
        code: 'PHASE_PROGRESS_RULE',
        message: 'The progress is below the minimum required by the phase',
        phaseCode: 'FINALIZADO',
        minimumProgress: '100.00',
      });
      expect(progressRuleIssue('FINALIZADO', '100.00', rules)).toBeNull();
    });

    it('una fase sin regla y un parámetro vacío no restringen', () => {
      expect(progressRuleIssue('DISENO', '0.00', rules)).toBeNull();
      expect(progressRuleIssue('FINALIZADO', '0.00', {})).toBeNull();
    });

    it('admite mínimos con decimales', () => {
      expect(progressRuleIssue('CONSTRUCCION', '50.49', { CONSTRUCCION: { progresoMinimo: 50.5 } })?.minimumProgress).toBe('50.50');
      expect(progressRuleIssue('CONSTRUCCION', '50.50', { CONSTRUCCION: { progresoMinimo: 50.5 } })).toBeNull();
    });
  });

  describe('resolveTargetProgress', () => {
    const current = { phaseId: 'phase-a', progress: '40.00' };

    it('usa el enviado si lo hay', () => {
      expect(resolveTargetProgress(current, { phaseId: 'phase-b', defaultProgress: '100.00' }, '55')).toBe('55');
    });

    it('al cambiar de fase sin porcentaje, propone `defaultProgress` de la destino o conserva el actual', () => {
      expect(resolveTargetProgress(current, { phaseId: 'phase-b', defaultProgress: '100.00' }, undefined)).toBe('100.00');
      expect(resolveTargetProgress(current, { phaseId: 'phase-b', defaultProgress: null }, undefined)).toBe('40.00');
    });

    it('en la misma fase sin porcentaje conserva el actual (será PHASE_UNCHANGED)', () => {
      expect(resolveTargetProgress(current, { phaseId: 'phase-a', defaultProgress: '100.00' }, undefined)).toBe('40.00');
    });
  });

  it('isPhaseUnchanged: misma fase y mismo porcentaje exacto (RN-03.35)', () => {
    expect(isPhaseUnchanged({ phaseId: 'a', progress: '40.00' }, { phaseId: 'a', progress: '40.0' })).toBe(true);
    expect(isPhaseUnchanged({ phaseId: 'a', progress: '40.00' }, { phaseId: 'a', progress: '40.01' })).toBe(false);
    expect(isPhaseUnchanged({ phaseId: 'a', progress: '40.00' }, { phaseId: 'b', progress: '40.00' })).toBe(false);
  });

  it('defaultProgressOf: solo números finitos en 0–100', () => {
    expect(defaultProgressOf({ defaultProgress: 100 })).toBe('100.00');
    expect(defaultProgressOf({ defaultProgress: 12.5 })).toBe('12.50');
    expect(defaultProgressOf({ defaultProgress: 101 })).toBeNull();
    expect(defaultProgressOf({ defaultProgress: '50' })).toBeNull();
    expect(defaultProgressOf({})).toBeNull();
    expect(defaultProgressOf(null)).toBeNull();
  });
});
