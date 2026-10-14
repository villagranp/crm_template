import type { SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';
import type { ParameterReading } from '@/modules/parameters/parameter-reader';
import { ALERT_TYPES } from '@/modules/parameters/parameter-rules.registry';

import { ALERT_TYPE_CODES, type AlertParameterReadings, evaluateAlertRules, resolvePriority } from './alert-rules';

const PRIORITIES: SemanticCatalogItem[] = [
  { id: 'p1', code: 'ALTA', label: 'Alta', metadata: { weight: 3 } },
  { id: 'p2', code: 'MEDIA', label: 'Media', metadata: { weight: 2 } },
  { id: 'p3', code: 'SIN_PESO', label: 'Sin peso', metadata: {} },
];

const ok = <T>(value: T): ParameterReading<T> => ({ value, valid: true, source: 'stored' });
const invalid = <T>(fallback: T): ParameterReading<T> => ({ value: fallback, valid: false, source: 'default' });

function readings(overrides: Partial<AlertParameterReadings> = {}): AlertParameterReadings {
  return {
    unconfirmedVisitHours: ok(48),
    staleProjectDays: ok(30),
    opportunityWithoutNextAction: ok(true),
    priorities: ok({ ACTIVIDAD_VENCIDA: 'ALTA', VISITA_SIN_CONFIRMAR: 'MEDIA', PROYECTO_SIN_ACTUALIZAR: 'MEDIA', OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'ALTA' }),
    ...overrides,
  };
}

describe('evaluateAlertRules (01 RN-01.26–RN-01.30, PF-01.43)', () => {
  it('los tipos coinciden con los del registro de parámetros', () => {
    expect([...ALERT_TYPE_CODES]).toEqual([...ALERT_TYPES]);
  });

  it('con parámetros válidos: los cuatro activos con su umbral y prioridad', () => {
    const { rules, invalidParameters } = evaluateAlertRules(readings(), PRIORITIES);
    expect(invalidParameters).toEqual([]);
    expect(rules.ACTIVIDAD_VENCIDA).toEqual({ type: 'ACTIVIDAD_VENCIDA', enabled: true, disabledReason: null, priority: { code: 'ALTA', label: 'Alta', weight: 3 }, threshold: null });
    expect(rules.VISITA_SIN_CONFIRMAR).toMatchObject({ enabled: true, threshold: 48, priority: { code: 'MEDIA' } });
    expect(rules.PROYECTO_SIN_ACTUALIZAR).toMatchObject({ enabled: true, threshold: 30 });
    expect(rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION).toMatchObject({ enabled: true });
  });

  it('un umbral inválido desactiva solo su tipo (PARAMETER_INVALID) y nunca inventa el valor', () => {
    const { rules, invalidParameters } = evaluateAlertRules(readings({ unconfirmedVisitHours: invalid(48) }), PRIORITIES);
    expect(rules.VISITA_SIN_CONFIRMAR).toMatchObject({ enabled: false, disabledReason: 'PARAMETER_INVALID', threshold: null });
    expect(rules.ACTIVIDAD_VENCIDA.enabled).toBe(true);
    expect(invalidParameters).toEqual(['crm.alertas.visita_sin_confirmar_horas']);
  });

  it('AL-4 con el parámetro en false → DISABLED_BY_PARAMETER; ilegible → PARAMETER_INVALID', () => {
    expect(evaluateAlertRules(readings({ opportunityWithoutNextAction: ok(false) }), PRIORITIES).rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION).toMatchObject({
      enabled: false,
      disabledReason: 'DISABLED_BY_PARAMETER',
    });
    expect(evaluateAlertRules(readings({ opportunityWithoutNextAction: invalid(true) }), PRIORITIES).rules.OPORTUNIDAD_SIN_SIGUIENTE_ACCION).toMatchObject({
      enabled: false,
      disabledReason: 'PARAMETER_INVALID',
    });
  });

  it('prioridades inválidas desactivan todos los tipos; un código inexistente o sin peso, solo el suyo', () => {
    const all = evaluateAlertRules(readings({ priorities: invalid({}) }), PRIORITIES);
    expect(Object.values(all.rules).every((rule) => !rule.enabled && rule.disabledReason === 'PARAMETER_INVALID')).toBe(true);

    const one = evaluateAlertRules(
      readings({ priorities: ok({ ACTIVIDAD_VENCIDA: 'NO_EXISTE', VISITA_SIN_CONFIRMAR: 'SIN_PESO', PROYECTO_SIN_ACTUALIZAR: 'MEDIA', OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'ALTA' }) }),
      PRIORITIES,
    );
    expect(one.rules.ACTIVIDAD_VENCIDA).toMatchObject({ enabled: false, disabledReason: 'PARAMETER_INVALID' });
    expect(one.rules.VISITA_SIN_CONFIRMAR).toMatchObject({ enabled: false, disabledReason: 'PARAMETER_INVALID' });
    expect(one.rules.PROYECTO_SIN_ACTUALIZAR.enabled).toBe(true);
    expect(one.invalidParameters).toEqual(['crm.alertas.prioridades']);
  });

  it('resolvePriority usa el peso del catálogo', () => {
    expect(resolvePriority('MEDIA', PRIORITIES)).toEqual({ code: 'MEDIA', label: 'Media', weight: 2 });
    expect(resolvePriority(undefined, PRIORITIES)).toBeNull();
  });
});
