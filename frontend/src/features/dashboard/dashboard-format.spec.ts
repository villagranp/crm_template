import { describe, expect, it } from 'vitest';

import {
  DATA_SCOPE_LABELS,
  firstNameOf,
  forecastBarRatios,
  formatClock,
  formatCompliance,
  formatMonth,
  formatPeriodRange,
  formatRelative,
  formatTargetValue,
  formatTonnageValue,
  formatUpdatedAt,
  greetingFor,
  pluralize,
  priorityTone,
  topStages,
} from './dashboard-format';

describe('dashboard-format', () => {
  it('saluda según la hora local', () => {
    expect(greetingFor(new Date(2026, 9, 13, 8, 0))).toBe('Buenos días');
    expect(greetingFor(new Date(2026, 9, 13, 12, 0))).toBe('Buenas tardes');
    expect(greetingFor(new Date(2026, 9, 13, 19, 0))).toBe('Buenas noches');
  });

  it('toma el nombre de pila y etiqueta el alcance COUNTRY como "País" (DM-10)', () => {
    expect(firstNameOf('  Ana   López ')).toBe('Ana');
    expect(firstNameOf(null)).toBe('');
    expect(DATA_SCOPE_LABELS.COUNTRY).toBe('País');
  });

  it('formatea la hora en 24 h y "Actualizado hh:mm"', () => {
    expect(formatClock(new Date(2026, 9, 13, 9, 5))).toBe('09:05');
    const iso = new Date(2026, 9, 13, 16, 4).toISOString();
    expect(formatUpdatedAt(iso)).toBe('Actualizado 16:04');
    expect(formatUpdatedAt(undefined)).toBeNull();
  });

  it('fecha relativa en ambos sentidos y absoluta más allá de 30 días', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(formatRelative('2026-10-13T10:00:00Z', now)).toBe('hace 2 horas');
    expect(formatRelative('2026-10-16T12:00:00Z', now)).toBe('dentro de 3 días');
    expect(formatRelative('2026-10-13T11:59:30Z', now)).toBe('hace un momento');
    expect(formatRelative('2026-07-01T12:00:00Z', now)).toMatch(/2026/);
    expect(formatRelative(null, now)).toBe('—');
  });

  it('rango de período y mes sin desplazamiento de zona', () => {
    expect(formatPeriodRange({ from: '2026-10-01', to: '2026-10-31' })).toBe('1 oct – 31 oct 2026');
    expect(formatPeriodRange({ from: '2026-12-01', to: '2027-02-28' })).toBe(
      '1 dic 2026 – 28 feb 2027',
    );
    expect(formatMonth({ year: 2027, month: 1 })).toBe('ene 2027');
  });

  it('toneladas con dos decimales y símbolo', () => {
    expect(formatTonnageValue('1250.5000', { code: 'TON', symbol: 't' })).toBe('1,250.50 t');
    expect(formatTonnageValue('25', null)).toBe('25.00 t');
  });

  it('cumplimiento con dos decimales o "No calculable" (RN-01.11)', () => {
    expect(formatCompliance('64.00')).toBe('64.00 %');
    expect(formatCompliance('50')).toBe('50.00 %');
    expect(formatCompliance(null)).toBe('No calculable');
  });

  it('valores de meta en su unidad: AMOUNT en USD (RN-01.32), toneladas en t, conteos sin decimales', () => {
    expect(
      formatTargetValue('7000.0000', { metric: 'AMOUNT', unit: null, currencyCode: 'USD' }),
    ).toBe('USD 7,000.00');
    expect(
      formatTargetValue('420.0000', {
        metric: 'TONNAGE',
        unit: { code: 'TON', symbol: 't' },
        currencyCode: null,
      }),
    ).toBe('420.00 t');
    expect(
      formatTargetValue('4.0000', { metric: 'WON_OPPORTUNITIES', unit: null, currencyCode: null }),
    ).toBe('4');
  });

  it('las tres etapas con más oportunidades, sin las vacías', () => {
    const stages = topStages([
      { stageId: '1', code: 'A', label: 'A', order: 1, count: 2 },
      { stageId: '2', code: 'B', label: 'B', order: 2, count: 9 },
      { stageId: '3', code: 'C', label: 'C', order: 3, count: 2 },
      { stageId: '4', code: 'D', label: 'D', order: 4, count: 1 },
      { stageId: '5', code: 'E', label: 'E', order: 5, count: 0 },
    ]);
    expect(stages.map((stage) => stage.code)).toEqual(['B', 'A', 'C']);
  });

  it('proporciones de la mini-serie respecto al mes mayor', () => {
    expect(forecastBarRatios(['50.0000', '100.0000', '0'])).toEqual([0.5, 1, 0]);
    expect(forecastBarRatios(['0', '0'])).toEqual([0, 0]);
  });

  it('plural y color de prioridad por peso de catálogo', () => {
    expect(pluralize(1, 'parcial', 'parciales')).toBe('1 parcial');
    expect(pluralize(3, 'parcial', 'parciales')).toBe('3 parciales');
    expect(priorityTone(3)).toBe('error');
    expect(priorityTone(2)).toBe('warning');
    expect(priorityTone(1)).toBe('info');
    expect(priorityTone(null)).toBe('info');
  });
});
