import { describe, expect, it } from 'vitest';

import {
  commercialStatusText,
  formatCalendarDate,
  formatLocation,
  formatPhase,
  formatRelativeDateTime,
  historyFieldLabel,
  historyValueText,
  isCalendarDate,
  productLabel,
  progressBarValue,
  projectLabel,
  scopeDescription,
} from './project-format';

const dateFormatter = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' });

describe('project-format', () => {
  it('fecha de calendario sin desplazamiento de zona (DM-31): 2026-12-01 es 1 de diciembre', () => {
    expect(formatCalendarDate('2026-12-01')).toBe(dateFormatter.format(new Date(2026, 11, 1)));
    expect(formatCalendarDate(null)).toBe('—');
    expect(formatCalendarDate('2026-02-30')).toBe('—');
    expect(formatCalendarDate('01/12/2026')).toBe('—');
  });

  it('isCalendarDate sólo acepta fechas reales YYYY-MM-DD', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('2027-1-01')).toBe(false);
  });

  it('estado comercial: la etapa abierta con su nombre; los demás, su etiqueta (DEF-B)', () => {
    expect(commercialStatusText({ kind: 'OPEN_STAGE', label: 'Cotizando', stage: { id: 's', code: 'COTIZANDO', label: 'Cotizando' } })).toBe('En Cotizando');
    expect(commercialStatusText({ kind: 'WON', label: 'Ganado', stage: null })).toBe('Ganado');
    expect(commercialStatusText({ kind: 'NO_OPPORTUNITIES', label: 'Sin oportunidades', stage: null })).toBe('Sin oportunidades');
  });

  it('fase con porcentaje desde la cadena decimal', () => {
    expect(formatPhase({ label: 'Diseño', progress: '75.00' })).toBe('Diseño · 75%');
    expect(formatPhase({ label: 'Cotización', progress: '12.50' })).toBe('Cotización · 12.5%');
  });

  it('ubicación, etiquetas de proyecto y producto', () => {
    expect(formatLocation('Mixco', 'Guatemala')).toBe('Mixco, Guatemala');
    expect(formatLocation(null, 'Guatemala')).toBe('Guatemala');
    expect(formatLocation('  ', null)).toBe('—');
    expect(projectLabel({ code: 'PRY-2026-00042', name: 'Torre Norte' })).toBe('PRY-2026-00042 · Torre Norte');
    expect(productLabel({ sku: 'VAR-3', description: 'Varilla #3' })).toBe('VAR-3 · Varilla #3');
  });

  it('barra de progreso: parte entera acotada a 0–100, sin aritmética de coma flotante', () => {
    expect(progressBarValue('75.50')).toBe(75);
    expect(progressBarValue('100.00')).toBe(100);
    expect(progressBarValue(null)).toBe(0);
  });

  it('última actualización relativa; a partir de un mes, la fecha', () => {
    const now = new Date('2026-10-12T12:00:00.000Z');
    expect(formatRelativeDateTime('2026-10-12T11:59:30.000Z', now)).toBe('hace un momento');
    expect(formatRelativeDateTime('2026-10-12T09:00:00.000Z', now)).toBe(new Intl.RelativeTimeFormat('es-GT', { numeric: 'auto' }).format(-3, 'hour'));
    expect(formatRelativeDateTime('2026-10-07T12:00:00.000Z', now)).toBe(new Intl.RelativeTimeFormat('es-GT', { numeric: 'auto' }).format(-5, 'day'));
    expect(formatRelativeDateTime('2026-07-01T12:00:00.000Z', now)).toBe(dateFormatter.format(new Date('2026-07-01T12:00:00.000Z')));
    expect(formatRelativeDateTime(null, now)).toBe('—');
  });

  it('historial: etiqueta del campo y valores legibles', () => {
    expect(historyFieldLabel('estimatedDecisionDate')).toBe('Decisión estimada');
    expect(historyFieldLabel('campoDesconocido')).toBe('campoDesconocido');
    expect(historyValueText(null)).toBe('—');
    expect(historyValueText(true)).toBe('Sí');
    expect(historyValueText('2026-12-01')).toBe(dateFormatter.format(new Date(2026, 11, 1)));
    expect(historyValueText('***')).toBe('***');
  });

  it('describe el alcance efectivo de la vista de equipo (AC-03.26)', () => {
    expect(scopeDescription('OWN')).toBe('Ves tus proyectos.');
    expect(scopeDescription('TEAM', ['Norte', 'Sur'])).toBe('Ves los proyectos de tus equipos (Norte, Sur) y sus subequipos.');
    expect(scopeDescription('COUNTRY')).toBe('Ves los proyectos de tu país.');
    expect(scopeDescription('ORGANIZATION')).toBe('Ves todos los proyectos.');
  });
});
