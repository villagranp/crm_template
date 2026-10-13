import { describe, expect, it } from 'vitest';

import {
  describeDue,
  endOfDayIso,
  formatCalendarDate,
  formatDateTime,
  formatDurationShort,
  formatMinutes,
  formatTime,
  fromDateTimeLocalValue,
  isFutureLocalValue,
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
});
