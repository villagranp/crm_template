import { describe, expect, it } from 'vitest';

import {
  buildOpportunitySchema,
  buildResultSchema,
  buildStageChangeSchema,
  emptyResultValues,
  opportunityFormValues,
  outcomesForStage,
  reasonsForOutcome,
  toCreateOpportunityInput,
  toResultInput,
  toStageChangeInput,
  toUpdateOpportunityInput,
  type OpportunityFormValues,
  type StageChangeFormValues,
} from './opportunities.schemas';
import { detail, OUTCOMES, REASONS, STAGES } from './testing/opportunity-fixtures';

function issues(result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]));
}

const DEFAULTS = { stageId: STAGES.contactado.id, opportunityDate: '2026-10-12', currencyCode: 'GTQ' };

describe('reglas del resultado (RN-03.47–RN-03.50, PF-03.79)', () => {
  it('la etapa decide los resultados: Ganado → Ganado/Parcial; Perdido → Perdido; abierta → ninguno', () => {
    expect(outcomesForStage(OUTCOMES, 'WON').map((option) => option.code)).toEqual(['WON', 'PARTIAL']);
    expect(outcomesForStage(OUTCOMES, 'LOST').map((option) => option.code)).toEqual(['LOST']);
    expect(outcomesForStage(OUTCOMES, null)).toEqual([]);
  });

  it('los motivos se filtran por appliesTo (AC-03.57)', () => {
    expect(reasonsForOutcome(REASONS, 'LOST').map((reason) => reason.code)).toEqual(['PRECIO', 'PLAZO']);
    expect(reasonsForOutcome(REASONS, 'PARTIAL').map((reason) => reason.code)).toEqual(['PLAZO']);
    expect(reasonsForOutcome(REASONS, '')).toEqual([]);
  });

  it('Perdido exige motivo; Parcial exige porcentaje 0–100; todos, fecha de decisión', () => {
    const schema = buildResultSchema({ outcomes: OUTCOMES, reasons: REASONS });
    expect(issues(schema.safeParse({ ...emptyResultValues(), outcome: 'LOST' }))).toEqual({
      reasonId: 'Indica el motivo.',
      decisionDate: 'Este campo es obligatorio.',
    });
    expect(issues(schema.safeParse({ ...emptyResultValues('2026-10-12'), outcome: 'PARTIAL', awardedPercent: '120' }))).toEqual({
      awardedPercent: 'Debe ser como máximo 100.',
    });
    expect(issues(schema.safeParse({ ...emptyResultValues('2026-10-12'), outcome: 'PARTIAL', awardedPercent: '' }))).toEqual({
      awardedPercent: 'Este campo es obligatorio.',
    });
    expect(issues(schema.safeParse({ ...emptyResultValues('2026-10-12'), outcome: 'LOST', reasonId: 'rs-relacion' }))).toEqual({
      reasonId: 'Este motivo no aplica al resultado elegido.',
    });
    expect(schema.safeParse({ ...emptyResultValues('2026-10-12'), outcome: 'PARTIAL', awardedPercent: '60' }).success).toBe(true);
    expect(issues(schema.safeParse({ ...emptyResultValues('2026-02-30'), outcome: 'WON' }))).toEqual({ decisionDate: 'Escribe una fecha válida.' });
  });

  it('el porcentaje solo viaja en PARTIAL (RESULT_PERCENT_NOT_ALLOWED) y los textos vacíos como null', () => {
    expect(toResultInput({ ...emptyResultValues('2026-10-12'), outcome: 'PARTIAL', awardedPercent: '60.50', comments: '  ' }, OUTCOMES)).toEqual({
      outcome: 'PARTIAL',
      decisionDate: '2026-10-12',
      reasonId: null,
      comments: null,
      awardedPercent: '60.5',
    });
    expect(toResultInput({ ...emptyResultValues('2026-10-12'), outcome: 'WON', awardedPercent: '60' }, OUTCOMES)).toEqual({
      outcome: 'WON',
      decisionDate: '2026-10-12',
      reasonId: null,
      comments: null,
    });
  });
});

describe('cambio de etapa (RN-03.42, RN-03.46)', () => {
  const values = (overrides: Partial<StageChangeFormValues>): StageChangeFormValues => ({ toStageId: '', comment: '', ...emptyResultValues('2026-10-12'), ...overrides });

  it('a una etapa abierta no exige resultado y no lo envía', () => {
    const context = { current: STAGES.contactado, transitions: [STAGES.cotizando, STAGES.ganado], outcomes: OUTCOMES, reasons: REASONS };
    const schema = buildStageChangeSchema(context);
    expect(schema.safeParse(values({ toStageId: STAGES.cotizando.id })).success).toBe(true);
    expect(toStageChangeInput(values({ toStageId: STAGES.cotizando.id, outcome: 'WON' }), context)).toEqual({ toStageId: STAGES.cotizando.id, comment: null });
  });

  it('a una etapa cerrada exige el resultado de esa etapa y lo envía junto', () => {
    const context = { current: STAGES.cotizando, transitions: [STAGES.ganado, STAGES.perdido], outcomes: OUTCOMES, reasons: REASONS };
    const schema = buildStageChangeSchema(context);
    expect(issues(schema.safeParse(values({ toStageId: STAGES.ganado.id })))).toEqual({ outcome: 'Elige el resultado.' });
    expect(issues(schema.safeParse(values({ toStageId: STAGES.ganado.id, outcome: 'LOST', reasonId: 'rs-precio' })))).toEqual({ outcome: 'Elige el resultado.' });
    expect(toStageChangeInput(values({ toStageId: STAGES.ganado.id, outcome: 'PARTIAL', awardedPercent: '60', comment: ' Cierre ' }), context)).toEqual({
      toStageId: STAGES.ganado.id,
      comment: 'Cierre',
      result: { outcome: 'PARTIAL', awardedPercent: '60', decisionDate: '2026-10-12', reasonId: null, comments: null },
    });
  });

  it('reabrir exige comentario; un destino fuera de allowedTransitions no vale', () => {
    const context = { current: STAGES.ganado, transitions: [STAGES.cotizando], outcomes: OUTCOMES, reasons: REASONS };
    const schema = buildStageChangeSchema(context);
    expect(issues(schema.safeParse(values({ toStageId: STAGES.cotizando.id, comment: '  ' })))).toEqual({ comment: 'Escribe el motivo de la reapertura.' });
    expect(issues(schema.safeParse(values({ toStageId: STAGES.perdido.id })))).toEqual({ toStageId: 'Este destino no está permitido.' });
    expect(issues(schema.safeParse(values({})))).toEqual({ toStageId: 'Elige la etapa destino.' });
  });
});

describe('alta y edición (RN-03.38, RN-03.82)', () => {
  const schema = buildOpportunitySchema();
  const base = (overrides: Partial<OpportunityFormValues> = {}): OpportunityFormValues => ({ ...opportunityFormValues(null, DEFAULTS), ...overrides });

  it('valida monto y tonelaje decimales ≥ 0, la moneda con monto y las fechas', () => {
    expect(issues(schema.safeParse(base({ estimatedAmount: '-1', estimatedTonnage: '1,5', opportunityDate: '' })))).toEqual({
      opportunityDate: 'Este campo es obligatorio.',
      estimatedAmount: 'Debe ser mayor o igual que 0.',
      estimatedTonnage: 'Escribe un número válido (punto como separador decimal).',
    });
    expect(issues(schema.safeParse(base({ estimatedAmount: '100', currencyCode: '' })))).toEqual({ currencyCode: 'Elige la moneda del monto.' });
    expect(schema.safeParse(base({ estimatedAmount: '7750' })).success).toBe(true);
  });

  it('alta: omite lo vacío y la moneda solo acompaña a un monto (sin tasa ni equivalente: los resuelve el servidor)', () => {
    expect(toCreateOpportunityInput(base())).toEqual({ opportunityDate: '2026-10-12', stageId: STAGES.contactado.id });
    expect(toCreateOpportunityInput(base({ estimatedAmount: '7750', nextAction: ' Llamar ', estimatedTonnage: '12.5' }))).toEqual({
      opportunityDate: '2026-10-12',
      stageId: STAGES.contactado.id,
      estimatedAmount: '7750',
      currencyCode: 'GTQ',
      estimatedTonnage: '12.5',
      nextAction: 'Llamar',
    });
  });

  it('edición: solo lo cambiado; mismo monto con otra escala no cambia; monto vacío borra la estimación', () => {
    const original = detail();
    const values = opportunityFormValues(original, DEFAULTS);
    expect(values.estimatedAmount).toBe('7750');
    expect(toUpdateOpportunityInput(original, values)).toEqual({});
    expect(toUpdateOpportunityInput(original, { ...values, estimatedAmount: '7750.00', nextAction: 'Visitar' })).toEqual({ nextAction: 'Visitar' });
    expect(toUpdateOpportunityInput(original, { ...values, currencyCode: 'USD' })).toEqual({ estimatedAmount: '7750', currencyCode: 'USD' });
    expect(toUpdateOpportunityInput(original, { ...values, estimatedAmount: '' })).toEqual({ estimatedAmount: null, currencyCode: null });
    expect(toUpdateOpportunityInput(original, { ...values, opportunityDate: '2026-10-11', nextActionDate: '' })).toEqual({
      opportunityDate: '2026-10-11',
      nextActionDate: null,
    });
  });
});
