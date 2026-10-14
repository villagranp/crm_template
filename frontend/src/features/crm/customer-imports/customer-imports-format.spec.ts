import { describe, expect, it } from 'vitest';

import {
  calendarDateToIso,
  confirmationSummary,
  describeFormats,
  importProgress,
  importStepState,
  issueFieldLabel,
  precheckImportFile,
  rowViewQuery,
} from './customer-imports-format';
import { SETTINGS, testFile } from './testing/customer-import-fixtures';

const MB = 1024 * 1024;

describe('precheckImportFile (06 §E.3, AC-06.3)', () => {
  it('acepta .csv y .xlsx dentro del tamaño, sin distinguir mayúsculas', () => {
    expect(precheckImportFile(testFile('clientes.csv'), SETTINGS)).toBeNull();
    expect(precheckImportFile(testFile('CLIENTES.XLSX', 9 * MB), SETTINGS)).toBeNull();
  });

  it('rechaza otra extensión (incluido .xls) con los formatos admitidos', () => {
    expect(precheckImportFile(testFile('clientes.xls'), SETTINGS)).toBe(
      'El archivo debe ser CSV o Excel (.xlsx). Descargue la plantilla para ver el formato esperado.',
    );
    expect(precheckImportFile(testFile('clientes.pdf'), SETTINGS)).toMatch(/debe ser CSV o Excel/);
  });

  it('rechaza un archivo mayor que el límite de settings y uno vacío', () => {
    expect(precheckImportFile(testFile('clientes.csv', 10 * MB + 1), SETTINGS)).toBe('El archivo supera el tamaño máximo de 10 MB.');
    expect(precheckImportFile(testFile('clientes.csv', 0), SETTINGS)).toBe('El archivo está vacío.');
  });

  it('sólo admite los formatos que publica settings', () => {
    expect(precheckImportFile(testFile('clientes.csv'), { ...SETTINGS, formats: ['XLSX'] })).toMatch(/debe ser Excel \(\.xlsx\)/);
  });
});

describe('formatos', () => {
  it('describe la lista de formatos', () => {
    expect(describeFormats(['CSV', 'XLSX'])).toBe('CSV o Excel (.xlsx)');
    expect(describeFormats(['XLSX'])).toBe('Excel (.xlsx)');
  });

  it('muestra el campo de una incidencia con el encabezado de la plantilla', () => {
    expect(issueFieldLabel('legalName', SETTINGS.columns)).toBe('Razón social');
    expect(issueFieldLabel('row', SETTINGS.columns)).toBe('Fila');
    expect(issueFieldLabel('desconocido', SETTINGS.columns)).toBe('desconocido');
  });
});

describe('calendarDateToIso', () => {
  it('convierte el día en el inicio y el final del día local', () => {
    expect(calendarDateToIso('2026-10-01', 'start')).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(calendarDateToIso('2026-10-01', 'end')).toBe(new Date(2026, 9, 1, 23, 59, 59, 999).toISOString());
  });

  it('ignora valores que no son fechas', () => {
    expect(calendarDateToIso('ayer', 'start')).toBeNull();
    expect(calendarDateToIso(undefined, 'end')).toBeNull();
  });
});

describe('progreso, pasos y confirmación', () => {
  it('el progreso es importadas + rechazadas sobre válidas (06 §E.4)', () => {
    expect(importProgress({ importedRows: 3, rejectedRows: 1, validRows: 8 })).toEqual({ processed: 4, total: 8, percent: 50 });
    expect(importProgress({ importedRows: 0, rejectedRows: 0, validRows: 0 }).percent).toBe(0);
  });

  it('marca el paso según el estado', () => {
    expect(importStepState({ status: 'VALIDATED', confirmedAt: null }).activeStep).toBe(2);
    expect(importStepState({ status: 'COMPLETED', confirmedAt: 'x' }).activeStep).toBe(4);
    expect(importStepState({ status: 'FAILED', confirmedAt: null })).toEqual({ activeStep: 1, failedStep: 1, failedLabel: 'Archivo rechazado' });
    expect(importStepState({ status: 'FAILED', confirmedAt: '2026-10-05T15:00:00.000Z' }).failedLabel).toBe('Interrumpida');
    expect(importStepState({ status: 'CANCELLED', confirmedAt: null }).failedLabel).toBe('Cancelada');
  });

  it('sin la casilla, las válidas con advertencias no se importan (RN-06.18)', () => {
    expect(confirmationSummary({ totalRows: 10, validRows: 7 }, 2, false)).toEqual({ toImport: 5, notImported: 5 });
    expect(confirmationSummary({ totalRows: 10, validRows: 7 }, 2, true)).toEqual({ toImport: 7, notImported: 3 });
  });

  it('traduce la vista del filtro a la consulta de filas', () => {
    expect(rowViewQuery(undefined)).toEqual({});
    expect(rowViewQuery('WARNINGS')).toEqual({ hasWarnings: 'true' });
    expect(rowViewQuery('REJECTED')).toEqual({ status: 'REJECTED' });
    expect(rowViewQuery('INVENTADO')).toEqual({});
  });
});
