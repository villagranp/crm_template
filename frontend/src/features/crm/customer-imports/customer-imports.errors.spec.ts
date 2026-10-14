import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/api-error';

import {
  describeFailureReason,
  describeImportError,
  describeUploadError,
  fileIssueMessage,
  importFileProblems,
  type ImportFileIssue,
} from './customer-imports.errors';
import { SETTINGS } from './testing/customer-import-fixtures';

function apiError(statusCode: number, code: string, details: unknown[] = []): ApiError {
  return new ApiError({ statusCode, code, message: 'backend message', details, correlationId: 'corr-1' });
}

const ALL_ISSUES: ImportFileIssue[] = [
  'MISSING_COLUMN',
  'UNKNOWN_COLUMN',
  'DUPLICATE_COLUMN',
  'TOO_MANY_COLUMNS',
  'EMPTY_FILE',
  'NO_DATA_ROWS',
  'TOO_MANY_ROWS',
  'INVALID_ENCODING',
  'MALFORMED_CSV',
  'SHEET_NOT_FOUND',
  'ARCHIVE_LIMITS_EXCEEDED',
  'UNSAFE_CONTENT',
  'UNREADABLE_FILE',
  'PARSE_TIMEOUT',
];

describe('problemas de estructura de 422 INVALID_IMPORT_FILE (06 F.1 §3)', () => {
  it('cada issue tiene un mensaje propio en español', () => {
    const messages = ALL_ISSUES.map((issue) => fileIssueMessage(issue, null, SETTINGS));
    expect(new Set(messages).size).toBe(ALL_ISSUES.length);
    expect(messages).not.toContain('El archivo no tiene la estructura esperada.');
  });

  it('INVALID_ENCODING pide guardar el CSV como UTF-8', () => {
    expect(fileIssueMessage('INVALID_ENCODING', null)).toMatch(/guarde el CSV como UTF-8/);
  });

  it('lista los details citando la columna y el máximo de filas', () => {
    const error = apiError(422, 'INVALID_IMPORT_FILE', [
      { field: 'columns', issue: 'MISSING_COLUMN', column: 'Razón social' },
      { field: 'columns', issue: 'UNKNOWN_COLUMN', column: 'Notas' },
      { field: 'rows', issue: 'TOO_MANY_ROWS' },
      { field: 'columns', issue: 'MISSING_COLUMN', column: 'Razón social' },
    ]);

    expect(importFileProblems(error, SETTINGS)).toEqual([
      'Falta la columna obligatoria «Razón social».',
      'La columna «Notas» no pertenece a la plantilla.',
      'El archivo supera el máximo de 5,000 filas por carga. Divídalo en varios archivos.',
    ]);
  });

  it('no lee details de otros errores', () => {
    expect(importFileProblems(apiError(409, 'IMPORT_IN_PROGRESS', [{ issue: 'EMPTY_FILE' }]))).toEqual([]);
  });
});

describe('describeUploadError', () => {
  it('un 413 sin cuerpo JSON (NGINX) se trata como FILE_TOO_LARGE con el límite', () => {
    expect(describeUploadError(apiError(413, 'HTTP_ERROR'), SETTINGS).message).toBe('El archivo supera el tamaño máximo de 10 MB.');
  });

  it('415 y 409 tienen mensajes específicos; nunca el message del backend', () => {
    expect(describeUploadError(apiError(415, 'UNSUPPORTED_FILE_TYPE')).message).toMatch(/Solo se admiten archivos CSV \(UTF-8\) o Excel/);
    expect(describeUploadError(apiError(409, 'IMPORTS_DISABLED')).message).toBe('La carga masiva no está habilitada en este entorno.');
    expect(describeUploadError(apiError(409, 'IMPORT_IN_PROGRESS')).message).toMatch(/Ya tiene una carga validándose/);
    expect(describeImportError(apiError(409, 'IMPORT_CHANGED')).message).not.toContain('backend message');
  });
});

describe('describeFailureReason', () => {
  it('traduce un fallo de estructura con sus columnas', () => {
    expect(describeFailureReason('MISSING_COLUMN: Razón social; EMPTY_FILE')).toEqual([
      'Falta la columna obligatoria «Razón social».',
      'El archivo está vacío.',
    ]);
  });

  it('traduce la interrupción y tolera vacíos', () => {
    expect(describeFailureReason('PROCESS_INTERRUPTED')).toEqual(['La importación se interrumpió antes de terminar.']);
    expect(describeFailureReason(null)).toEqual([]);
  });
});
