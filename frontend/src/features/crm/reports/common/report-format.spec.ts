import { describe, expect, it } from 'vitest';

import { formatCount, formatMonth, formatQuantityWithUnit, formatReportPercent, formatTons, formatUsd, monthKey, parseMonthKey } from './report-format';

describe('report-format (05 E.1: es-GT, USD, unidades)', () => {
  it('formatea conteos con separador de miles y sin inventar valores', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(null)).toBe('—');
  });

  it('rotula los importes con su código ISO y 2 decimales; por defecto USD', () => {
    expect(formatUsd('125000.0000')).toBe('USD 125,000.00');
    expect(formatUsd('7750.0000', 'GTQ')).toBe('GTQ 7,750.00');
    expect(formatUsd(null)).toBe('—');
  });

  it('pone la unidad junto a cada cantidad y las toneladas en t', () => {
    expect(formatQuantityWithUnit('10000.0000', 'kg')).toBe('10,000 kg');
    expect(formatQuantityWithUnit('0.1250', 'VAR')).toBe('0.125 VAR');
    expect(formatTons('15.5000')).toBe('15.50 t');
    expect(formatTons(null)).toBe('—');
  });

  it('muestra porcentajes sin inventar el 0 %', () => {
    expect(formatReportPercent('60.00')).toBe('60 %');
    expect(formatReportPercent('42.86')).toBe('42.86 %');
    expect(formatReportPercent(null)).toBe('—');
  });

  it('nombra y codifica meses de calendario', () => {
    expect(formatMonth({ year: 2026, month: 11 })).toBe('nov 2026');
    expect(monthKey({ year: 2026, month: 1 })).toBe('2026-01');
    expect(parseMonthKey('2026-12')).toEqual({ year: 2026, month: 12 });
    expect(parseMonthKey('2026-13')).toBeNull();
  });
});
