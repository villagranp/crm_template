import {
  calendarPartsAt,
  formatSequenceCode,
  isSequenceResetPolicy,
  nextCounterValue,
  periodKeyFor,
} from './sequence-format';

describe('sequence-format', () => {
  describe('formatSequenceCode', () => {
    it('aplica prefijo y relleno de crm.cliente (CLI-000123)', () => {
      const code = formatSequenceCode(
        { prefix: 'CLI', pattern: '{prefix}-{seq}', padding: 6, resetPolicy: 'NONE' },
        123,
        { year: '2026', month: '10' },
      );
      expect(code).toBe('CLI-000123');
    });

    it('incluye el año en los folios anuales (PRY-2026-00042)', () => {
      const code = formatSequenceCode(
        { prefix: 'PRY', pattern: '{prefix}-{year}-{seq}', padding: 5, resetPolicy: 'YEAR' },
        42,
        { year: '2026', month: '10' },
      );
      expect(code).toBe('PRY-2026-00042');
    });

    it('admite el mes y nunca trunca un número más largo que el relleno', () => {
      const code = formatSequenceCode(
        { prefix: 'X', pattern: '{prefix}{year}{month}-{seq}', padding: 2, resetPolicy: 'MONTH' },
        1234,
        { year: '2026', month: '03' },
      );
      expect(code).toBe('X202603-1234');
    });
  });

  describe('periodKeyFor y nextCounterValue', () => {
    const parts = { year: '2027', month: '01' };

    it('NONE no reinicia nunca', () => {
      expect(periodKeyFor('NONE', parts)).toBeNull();
      expect(nextCounterValue(41, null, null)).toBe(42);
    });

    it('YEAR reinicia a 1 al cambiar de año y continúa dentro del mismo año', () => {
      expect(periodKeyFor('YEAR', parts)).toBe('2027');
      expect(nextCounterValue(99, '2026', '2027')).toBe(1);
      expect(nextCounterValue(5, '2027', '2027')).toBe(6);
    });

    it('MONTH usa año y mes, y la primera vez (periodo nulo) empieza en 1', () => {
      expect(periodKeyFor('MONTH', parts)).toBe('2027-01');
      expect(nextCounterValue(0, null, '2027-01')).toBe(1);
    });
  });

  describe('calendarPartsAt', () => {
    it('calcula el periodo en la zona del negocio, no en UTC', () => {
      // 1 de enero de 2027 a las 04:00 UTC = 31 de diciembre de 2026 a las 22:00 en Guatemala.
      const at = new Date('2027-01-01T04:00:00.000Z');
      expect(calendarPartsAt(at, 'UTC')).toEqual({ year: '2027', month: '01' });
      expect(calendarPartsAt(at, 'America/Guatemala')).toEqual({ year: '2026', month: '12' });
    });
  });

  it('reconoce solo las políticas de reinicio documentadas', () => {
    expect(isSequenceResetPolicy('YEAR')).toBe(true);
    expect(isSequenceResetPolicy('WEEK')).toBe(false);
  });
});
