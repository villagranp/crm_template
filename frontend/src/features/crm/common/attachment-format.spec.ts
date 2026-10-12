import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/api-error';

import { attachmentTypeLabel, describeUploadError, formatFileSize, precheckAttachment } from './attachment-format';

const LIMITS = { maxMb: 10, allowedTypes: ['application/pdf'] };

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [3 * 1024 * 1024, '3 MB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('attachmentTypeLabel', () => {
  it('nombra los tipos admitidos y cae en el subtipo para el resto', () => {
    expect(attachmentTypeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel');
    expect(attachmentTypeLabel('text/csv; charset=utf-8')).toBe('CSV');
    expect(attachmentTypeLabel('')).toBe('Archivo');
  });
});

describe('precheckAttachment', () => {
  it('sin límites no bloquea nada; un tipo vacío lo decide el backend', () => {
    expect(precheckAttachment(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }), undefined)).toBeNull();
    expect(precheckAttachment(new File(['x'], 'sin-tipo', { type: '' }), LIMITS)).toBeNull();
  });
});

describe('describeUploadError', () => {
  it('un 413 es "demasiado grande" aunque llegue sin código (NGINX)', () => {
    const fromProxy = new ApiError({ statusCode: 413, code: 'HTTP_ERROR', message: 'Payload Too Large' });
    expect(describeUploadError(fromProxy, LIMITS)).toBe('El archivo supera el tamaño máximo permitido (10 MB).');
    expect(describeUploadError(fromProxy, undefined)).toBe('El archivo supera el tamaño máximo permitido.');
  });

  it('el resto de errores usa los mensajes comunes, nunca el texto del backend', () => {
    const forbidden = new ApiError({ statusCode: 403, code: 'PERMISSION_DENIED', message: 'raw' });
    expect(describeUploadError(forbidden, LIMITS)).toBe('No tienes permiso para realizar esta acción.');
  });
});
