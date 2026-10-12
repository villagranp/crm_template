import { normalizeResult, outcomesForStage, reasonAppliesTo, resultIssues, sameResult } from './opportunity-result-rules';
import { OUTCOME_ITEMS, STAGES } from './testing/opportunity-fixtures';

const codesOf = (issues: { code: string; field: string }[]) => issues.map((issue) => `${issue.field}:${issue.code}`);

describe('opportunity-result-rules (RN-03.46–RN-03.52, PF-03.70)', () => {
  it('correspondencia etapa ↔ resultado (stageOutcome del catálogo)', () => {
    expect(outcomesForStage(STAGES.GANADO, OUTCOME_ITEMS)).toEqual(['WON', 'PARTIAL']);
    expect(outcomesForStage(STAGES.PERDIDO, OUTCOME_ITEMS)).toEqual(['LOST']);
    expect(outcomesForStage(STAGES.COTIZANDO, OUTCOME_ITEMS)).toEqual([]);
    expect(resultIssues({ outcome: 'WON', decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS)).toEqual([]);
    expect(resultIssues({ outcome: 'PARTIAL', awardedPercent: '60', decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS)).toEqual([]);
    const mismatch = resultIssues({ outcome: 'LOST', reasonId: 'r', decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS, 'result.');
    expect(mismatch).toEqual([
      expect.objectContaining({ field: 'result.outcome', code: 'RESULT_STAGE_MISMATCH', stageCode: 'GANADO', allowedOutcomes: ['WON', 'PARTIAL'] }),
    ]);
  });

  it('motivo obligatorio en LOST y porcentaje obligatorio en PARTIAL, aunque el catálogo no lo diga', () => {
    expect(codesOf(resultIssues({ outcome: 'LOST', decisionDate: '2026-10-01' }, STAGES.PERDIDO, []))).toEqual(['reasonId:RESULT_REASON_REQUIRED']);
    expect(codesOf(resultIssues({ outcome: 'PARTIAL', decisionDate: '2026-10-01' }, STAGES.GANADO, []))).toEqual(['awardedPercent:RESULT_PERCENT_REQUIRED']);
  });

  it('porcentaje: 0–100 con 2 decimales; no se admite con WON ni LOST; todas las incidencias juntas', () => {
    for (const value of ['0', '100', '99.99']) {
      expect(resultIssues({ outcome: 'PARTIAL', awardedPercent: value, decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS)).toEqual([]);
    }
    for (const value of ['100.01', '120', '-1', '1.234']) {
      expect(codesOf(resultIssues({ outcome: 'PARTIAL', awardedPercent: value, decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS))).toEqual([
        'awardedPercent:INVALID_PROGRESS',
      ]);
    }
    expect(codesOf(resultIssues({ outcome: 'WON', awardedPercent: '100', decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS))).toEqual([
      'awardedPercent:RESULT_PERCENT_NOT_ALLOWED',
    ]);
    expect(codesOf(resultIssues({ outcome: 'LOST', awardedPercent: '10', decisionDate: '2026-10-01' }, STAGES.GANADO, OUTCOME_ITEMS))).toEqual([
      'outcome:RESULT_STAGE_MISMATCH',
      'reasonId:RESULT_REASON_REQUIRED',
      'awardedPercent:RESULT_PERCENT_NOT_ALLOWED',
    ]);
  });

  it('appliesTo del motivo: lista válida o ninguno (restrictivo)', () => {
    expect(reasonAppliesTo({ id: 'r', code: 'R', label: 'R', metadata: { appliesTo: ['LOST', 'X'] } })).toEqual(['LOST']);
    expect(reasonAppliesTo({ id: 'r', code: 'R', label: 'R', metadata: null })).toEqual([]);
  });

  it('normaliza y compara resultados sin distinguir escala ni comentarios vacíos', () => {
    const a = normalizeResult({ outcome: 'PARTIAL', awardedPercent: '70', decisionDate: '2026-10-06', comments: '  ' });
    expect(a).toEqual({ outcome: 'PARTIAL', reasonId: null, awardedPercent: '70.00', decisionDate: '2026-10-06', comments: null });
    expect(sameResult(a, { ...a, awardedPercent: '70.0' })).toBe(true);
    expect(sameResult(a, { ...a, decisionDate: '2026-10-07' })).toBe(false);
  });
});
