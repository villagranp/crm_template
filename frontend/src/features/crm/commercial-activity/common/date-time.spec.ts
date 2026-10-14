import { describe, expect, it } from 'vitest';

import {
  dayKeyInTimeZone,
  describeDue,
  endOfDayIso,
  formatCalendarDate,
  formatDateTime,
  formatDurationShort,
  formatMinutes,
  formatTime,
  fromDateTimeLocalValue,
  isFutureLocalValue,
  isValidTimeZone,
  nowDateTimeLocalValue,
  startOfDayIso,
  todayInTimeZone,
  toDateTimeLocalValue,
} from './date-time';

describe('date-time (RN-04.9, D-04.17)', () => {
  it('formatea un instante en la zona indicada', () => {
    expect(formatTime('2026-10-12T16:30:00Z', 'America/Guatemala')).toBe(formatTime('2026-10-12T10:30:00Z', 'UTC'));
    expect(formatDateTime('2026-10-12T16:30:00Z', 'America/Guatemala')).toBe(formatDateTime('2026-10-12T10:30:00Z', 'UTC'));
    expect(formatDateTime('2026-10-12T16:30:00Z', 'UTC')).toContain('4:30');
  });

  it('devuelve una raya con valores vacíos o inválidos', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('no-es-fecha')).toBe('—');
    expect(formatCalendarDate('2026/10/20')).toBe('—');
  });

  it('muestra las fechas de calendario sin desplazarlas de zona', () => {
    expect(formatCalendarDate('2026-10-20')).toContain('20');
    expect(formatCalendarDate('2026-10-20')).toContain('2026');
  });

  it('calcula "hoy" en la zona de negocio, no en UTC', () => {
    // 03:00 UTC del 13 de octubre: en Guatemala (UTC-6) todavía es el 12.
    const now = new Date('2026-10-13T03:00:00Z');
    expect(todayInTimeZone('America/Guatemala', now)).toBe('2026-10-12');
    expect(todayInTimeZone('UTC', now)).toBe('2026-10-13');
  });

  it('describe el vencimiento relativo en minutos, horas o días', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(describeDue('2026-10-12T15:00:00Z', now)).toBe('Vence en 5 h');
    expect(describeDue('2026-10-10T10:00:00Z', now)).toBe('Venció hace 2 días');
    expect(describeDue('2026-10-12T10:20:00Z', now)).toBe('Vence en 20 min');
    expect(describeDue('2026-10-13T10:00:00Z', now)).toBe('Vence en 1 día');
    expect(describeDue(null, now)).toBeNull();
    expect(formatDurationShort(0)).toBe('1 min');
  });

  it('formatea duraciones en minutos', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(null)).toBe('—');
  });

  it('convierte entre instante ISO y datetime-local sin perder el minuto', () => {
    const local = toDateTimeLocalValue('2026-10-12T16:30:00.000Z');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocalValue(local)).toBe('2026-10-12T16:30:00.000Z');
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue('basura')).toBeNull();
    expect(toDateTimeLocalValue(null)).toBe('');
  });

  it('detecta un valor datetime-local futuro', () => {
    const now = new Date('2026-10-12T16:30:00.000Z');
    expect(isFutureLocalValue(toDateTimeLocalValue('2026-10-12T17:30:00.000Z'), now)).toBe(true);
    expect(isFutureLocalValue(toDateTimeLocalValue('2026-10-12T15:30:00.000Z'), now)).toBe(false);
    expect(isFutureLocalValue('', now)).toBe(false);
  });

  it('acota un día completo para los filtros por rango', () => {
    const from = startOfDayIso('2026-10-12');
    const to = endOfDayIso('2026-10-12');
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(new Date(to ?? '').getTime() - new Date(from ?? '').getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    expect(startOfDayIso('12/10/2026')).toBeUndefined();
    expect(endOfDayIso(undefined)).toBeUndefined();
  });

  describe('con la zona del usuario (RN-04.9, D-04.17)', () => {
    it('convierte datetime-local en la zona indicada, no en la del navegador', () => {
      // Guatemala: UTC-6 todo el año. Madrid: UTC+2 en verano (CEST).
      expect(fromDateTimeLocalValue('2026-10-12T10:30', 'America/Guatemala')).toBe('2026-10-12T16:30:00.000Z');
      expect(fromDateTimeLocalValue('2026-10-12T10:30', 'Europe/Madrid')).toBe('2026-10-12T08:30:00.000Z');
      expect(toDateTimeLocalValue('2026-10-12T16:30:00.000Z', 'America/Guatemala')).toBe('2026-10-12T10:30');
      expect(toDateTimeLocalValue('2026-10-12T16:30:00.000Z', 'Europe/Madrid')).toBe('2026-10-12T18:30');
      expect(nowDateTimeLocalValue(new Date('2026-10-13T03:00:00Z'), 'America/Guatemala')).toBe('2026-10-12T21:00');
    });

    it('usa el desfase vigente en cada lado de un cambio de horario', () => {
      // Madrid pasa de CEST (+2) a CET (+1) el 25 de octubre de 2026 a las 03:00.
      expect(fromDateTimeLocalValue('2026-10-24T12:00', 'Europe/Madrid')).toBe('2026-10-24T10:00:00.000Z');
      expect(fromDateTimeLocalValue('2026-10-26T12:00', 'Europe/Madrid')).toBe('2026-10-26T11:00:00.000Z');
      // 02:30 se repite: se toma la primera aparición (aún en verano).
      expect(fromDateTimeLocalValue('2026-10-25T02:30', 'Europe/Madrid')).toBe('2026-10-25T00:30:00.000Z');
      // 29 de marzo de 2026: de 02:00 se salta a 03:00; 02:30 no existe y se lee como 03:30.
      expect(fromDateTimeLocalValue('2026-03-29T02:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00.000Z');
      // Ida y vuelta sin perder el minuto en ambos lados del cambio (fuera de la hora repetida).
      for (const instant of ['2026-10-25T00:30:00.000Z', '2026-10-25T02:30:00.000Z', '2026-03-29T00:59:00.000Z', '2026-03-29T01:00:00.000Z']) {
        expect(fromDateTimeLocalValue(toDateTimeLocalValue(instant, 'Europe/Madrid'), 'Europe/Madrid')).toBe(instant);
      }
      // Ciudad de México ya no cambia de horario (UTC-6 desde 2022).
      expect(fromDateTimeLocalValue('2026-07-01T09:00', 'America/Mexico_City')).toBe('2026-07-01T15:00:00.000Z');
    });

    it('acota el día en la zona indicada; un día con cambio de horario dura 25 h', () => {
      expect(startOfDayIso('2026-10-12', 'America/Guatemala')).toBe('2026-10-12T06:00:00.000Z');
      expect(endOfDayIso('2026-10-12', 'America/Guatemala')).toBe('2026-10-13T05:59:59.999Z');
      expect(startOfDayIso('2026-10-25', 'Europe/Madrid')).toBe('2026-10-24T22:00:00.000Z');
      expect(endOfDayIso('2026-10-25', 'Europe/Madrid')).toBe('2026-10-25T22:59:59.999Z');
      expect(startOfDayIso('2026-02-30', 'Europe/Madrid')).toBeUndefined();
    });

    it('decide si un valor es futuro y el día de un instante en la zona indicada', () => {
      const now = new Date('2026-10-12T16:00:00.000Z');
      // 10:30 en Guatemala = 16:30 UTC (futuro); 10:30 en Madrid = 08:30 UTC (pasado).
      expect(isFutureLocalValue('2026-10-12T10:30', now, 'America/Guatemala')).toBe(true);
      expect(isFutureLocalValue('2026-10-12T10:30', now, 'Europe/Madrid')).toBe(false);
      expect(dayKeyInTimeZone('2026-10-13T03:00:00Z', 'America/Guatemala')).toBe('2026-10-12');
      expect(dayKeyInTimeZone('2026-10-12T23:30:00Z', 'Europe/Madrid')).toBe('2026-10-13');
      expect(dayKeyInTimeZone('no-es-fecha', 'UTC')).toBeNull();
    });

    it('formatea en la zona indicada y reconoce zonas válidas', () => {
      expect(formatTime('2026-10-12T16:30:00Z', 'America/Guatemala')).toBe(formatTime('2026-10-12T10:30:00Z', 'UTC'));
      expect(formatTime('2026-10-12T16:30:00Z', 'Europe/Madrid')).toBe(formatTime('2026-10-12T18:30:00Z', 'UTC'));
      expect(isValidTimeZone('America/Guatemala')).toBe(true);
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
    });
  });
});
