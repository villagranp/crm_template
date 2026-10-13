import { describe, expect, it } from 'vitest';

import {
  addDaysToKey,
  CALENDAR_MAX_RANGE_DAYS,
  dayKeyOfInstant,
  dayLongLabel,
  eventCountLabel,
  groupByDay,
  isValidDayKey,
  monthGrid,
  parseDayKey,
  periodLabel,
  rangeFor,
  shiftReference,
  toDayKey,
  visibleDays,
  weekDays,
  weekdayNames,
} from './calendar-grid';

/** Instante ISO de una hora local (las pruebas no dependen de la zona de la máquina). */
function localIso(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0, ms = 0): string {
  return new Date(year, month - 1, day, hours, minutes, seconds, ms).toISOString();
}

const DAY_MS = 86_400_000;

describe('claves de día', () => {
  it('convierte entre fecha local y `YYYY-MM-DD`', () => {
    expect(toDayKey(new Date(2026, 9, 12, 23, 59))).toBe('2026-10-12');
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(parseDayKey('2026-10-12')?.getTime()).toBe(new Date(2026, 9, 12).getTime());
  });

  it('rechaza claves con formato inválido o fechas inexistentes', () => {
    expect(parseDayKey('2026-02-30')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('12/10/2026')).toBeNull();
    expect(parseDayKey('')).toBeNull();
    expect(parseDayKey(null)).toBeNull();
    expect(isValidDayKey('2028-02-29')).toBe(true);
    expect(isValidDayKey('2026-02-29')).toBe(false);
  });

  it('suma días cruzando mes y año', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('día local de un instante', () => {
    expect(dayKeyOfInstant(localIso(2026, 10, 12, 23, 30))).toBe('2026-10-12');
    expect(dayKeyOfInstant(localIso(2026, 10, 13, 0, 0))).toBe('2026-10-13');
    expect(dayKeyOfInstant('no es fecha')).toBeNull();
  });
});

describe('monthGrid (semanas lunes–domingo)', () => {
  it('octubre de 2026: 5 semanas del 28 sep al 1 nov, con los días vecinos marcados', () => {
    const weeks = monthGrid('2026-10-12');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.map((day) => day.key)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[0]?.map((day) => day.inMonth)).toEqual([false, false, false, true, true, true, true]);
    expect(weeks[4]?.map((day) => day.key)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(weeks[4]?.[6]).toEqual({ key: '2026-11-01', dayOfMonth: 1, inMonth: false });
    expect(weeks.flat().filter((day) => day.inMonth)).toHaveLength(31);
  });

  it('mes que empieza en lunes (junio de 2026): la primera celda es el día 1', () => {
    const weeks = monthGrid('2026-06-15');
    expect(weeks[0]?.[0]).toEqual({ key: '2026-06-01', dayOfMonth: 1, inMonth: true });
    expect(weeks).toHaveLength(5);
    expect(weeks[4]?.[6]?.key).toBe('2026-07-05');
  });

  it('mes que empieza en domingo (marzo de 2026): 6 semanas, de 23 feb a 5 abr', () => {
    const weeks = monthGrid('2026-03-01');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]?.key).toBe('2026-02-23');
    expect(weeks[0]?.[6]).toEqual({ key: '2026-03-01', dayOfMonth: 1, inMonth: true });
    expect(weeks[5]?.[6]?.key).toBe('2026-04-05');
    expect(weeks.flat()).toHaveLength(42);
  });

  it('febrero de 2021 (empieza en lunes y tiene 28 días): exactamente 4 semanas', () => {
    const weeks = monthGrid('2021-02-10');
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((day) => day.inMonth)).toBe(true);
  });

  it('año bisiesto: febrero de 2028 incluye el 29', () => {
    const days = monthGrid('2028-02-01').flat();
    expect(days.filter((day) => day.inMonth)).toHaveLength(29);
    expect(days.find((day) => day.key === '2028-02-29')).toEqual({ key: '2028-02-29', dayOfMonth: 29, inMonth: true });
    expect(days[0]?.key).toBe('2028-01-31');
  });

  it('admite otro inicio de semana (domingo)', () => {
    const weeks = monthGrid('2026-10-12', 0);
    expect(weeks[0]?.[0]?.key).toBe('2026-09-27');
    expect(weeks[weeks.length - 1]?.[6]?.key).toBe('2026-10-31');
  });

  it('lanza con una fecha inválida', () => {
    expect(() => monthGrid('2026-02-30')).toThrow(RangeError);
  });
});

describe('weekDays y visibleDays', () => {
  it('la semana del 12 de octubre de 2026 va del lunes 12 al domingo 18', () => {
    expect(weekDays('2026-10-15').map((day) => day.key)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(weekDays('2026-10-18')[0]?.key).toBe('2026-10-12');
  });

  it('una semana que cruza el año', () => {
    expect(weekDays('2026-12-31').map((day) => day.key)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('días visibles por modo', () => {
    expect(visibleDays('day', '2026-10-12')).toEqual([{ key: '2026-10-12', dayOfMonth: 12, inMonth: true }]);
    expect(visibleDays('week', '2026-10-12')).toHaveLength(7);
    expect(visibleDays('month', '2026-10-12')).toHaveLength(35);
  });
});

describe('rangeFor (from/to para GET /agenda/calendar)', () => {
  it('día: de las 00:00 a las 23:59:59.999 locales', () => {
    expect(rangeFor('day', '2026-10-12')).toEqual({
      from: localIso(2026, 10, 12),
      to: localIso(2026, 10, 12, 23, 59, 59, 999),
    });
  });

  it('semana: de lunes a domingo', () => {
    expect(rangeFor('week', '2026-10-14')).toEqual({
      from: localIso(2026, 10, 12),
      to: localIso(2026, 10, 18, 23, 59, 59, 999),
    });
  });

  it('mes: de la primera a la última celda visible', () => {
    expect(rangeFor('month', '2026-10-12')).toEqual({
      from: localIso(2026, 9, 28),
      to: localIso(2026, 11, 1, 23, 59, 59, 999),
    });
  });

  it('un mes de 6 semanas cabe en el tope de 42 días (D-04.12)', () => {
    const range = rangeFor('month', '2026-03-15');
    expect(range.from).toBe(localIso(2026, 2, 23));
    const span = new Date(range.to).getTime() - new Date(range.from).getTime();
    expect(span).toBeLessThanOrEqual(CALENDAR_MAX_RANGE_DAYS * DAY_MS);
    expect(span).toBeGreaterThan((CALENDAR_MAX_RANGE_DAYS - 1) * DAY_MS);
  });
});

describe('shiftReference (anterior / siguiente)', () => {
  it('mes: conserva el día cuando existe', () => {
    expect(shiftReference('month', '2026-10-12', 1)).toBe('2026-11-12');
    expect(shiftReference('month', '2026-10-12', -1)).toBe('2026-09-12');
  });

  it('mes: desde el 31 cae en el último día del mes corto', () => {
    expect(shiftReference('month', '2026-10-31', 1)).toBe('2026-11-30');
    expect(shiftReference('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftReference('month', '2028-01-31', 1)).toBe('2028-02-29');
    expect(shiftReference('month', '2026-03-31', -1)).toBe('2026-02-28');
  });

  it('mes: cruza el año', () => {
    expect(shiftReference('month', '2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftReference('month', '2026-01-15', -1)).toBe('2025-12-15');
  });

  it('semana: ±7 días', () => {
    expect(shiftReference('week', '2026-10-12', 1)).toBe('2026-10-19');
    expect(shiftReference('week', '2026-10-12', -1)).toBe('2026-10-05');
    expect(shiftReference('week', '2026-12-28', 1)).toBe('2027-01-04');
  });

  it('día: ±1 día, también en bisiesto', () => {
    expect(shiftReference('day', '2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftReference('day', '2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftReference('day', '2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('groupByDay', () => {
  it('agrupa por día local y ordena cada día por hora', () => {
    const late = { id: 'late', date: localIso(2026, 10, 12, 18, 0) };
    const early = { id: 'early', date: localIso(2026, 10, 12, 8, 30) };
    const nextDay = { id: 'next', date: localIso(2026, 10, 13, 0, 0) };
    const lastMinute = { id: 'last', date: localIso(2026, 10, 12, 23, 59) };
    const groups = groupByDay([late, nextDay, early, lastMinute]);

    expect([...groups.keys()]).toEqual(['2026-10-12', '2026-10-13']);
    expect(groups.get('2026-10-12')?.map((item) => item.id)).toEqual(['early', 'late', 'last']);
    expect(groups.get('2026-10-13')?.map((item) => item.id)).toEqual(['next']);
  });

  it('a igual hora conserva el orden de llegada y descarta fechas inválidas', () => {
    const date = localIso(2026, 10, 12, 10, 0);
    const groups = groupByDay([
      { id: 'a', date },
      { id: 'roto', date: 'x' },
      { id: 'b', date },
    ]);
    expect(groups.get('2026-10-12')?.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups.size).toBe(1);
  });

  it('sin eventos, mapa vacío', () => {
    expect(groupByDay([]).size).toBe(0);
  });
});

describe('etiquetas (es-MX)', () => {
  it('título del periodo por modo', () => {
    expect(periodLabel('month', '2026-10-12')).toBe('octubre de 2026');
    expect(periodLabel('week', '2026-10-12')).toBe('12 – 18 oct 2026');
    expect(periodLabel('week', '2026-10-01')).toBe('28 sep – 4 oct 2026');
    expect(periodLabel('week', '2026-12-31')).toBe('28 dic 2026 – 3 ene 2027');
    expect(periodLabel('day', '2026-10-12')).toBe('lunes, 12 de octubre de 2026');
  });

  it('día largo', () => {
    expect(dayLongLabel('2028-02-29')).toBe('martes, 29 de febrero de 2028');
  });

  it('nombres de los días desde el lunes', () => {
    const names = weekdayNames();
    expect(names.map((name) => name.long)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']);
    expect(names[0]?.short).toBe('lun');
    expect(weekdayNames(0)[0]?.long).toBe('domingo');
  });

  it('número de eventos', () => {
    expect(eventCountLabel(0)).toBe('Sin eventos');
    expect(eventCountLabel(1)).toBe('1 evento');
    expect(eventCountLabel(4)).toBe('4 eventos');
  });
});
