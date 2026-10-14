import { describe, expect, it } from 'vitest';

import { mockUpload } from '@/test/api-mocks';

import { uploadFilesInOrder } from './upload-files';

const LIMITS = { maxMb: 1, allowedTypes: ['application/pdf'] };

function file(name: string, type: string, sizeBytes = 1024): File {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: sizeBytes });
  return result;
}

describe('uploadFilesInOrder (04 §E.12)', () => {
  it('con límites, detiene la cola antes de enviar un archivo demasiado grande o de un tipo no admitido', async () => {
    const uploads = mockUpload(() => ({ status: 201, body: {} }));
    const ok = file('acta.pdf', 'application/pdf');
    const big = file('plano.pdf', 'application/pdf', 2 * 1024 * 1024);
    const after = file('otro.pdf', 'application/pdf');

    const result = await uploadFilesInOrder('/activities/a-1/attachments', [ok, big, after], LIMITS);

    expect(result.uploaded).toEqual([ok]);
    expect(result.failure?.file).toBe(big);
    expect(result.failure?.message).toBe('El archivo supera el tamaño máximo permitido (1 MB).');
    expect(uploads.map((upload) => upload.path)).toEqual(['/activities/a-1/attachments']);

    const typed = await uploadFilesInOrder('/activities/a-1/attachments', [file('notas.txt', 'text/plain')], LIMITS);
    expect(typed.failure?.message).toMatch(/^El tipo de archivo no está permitido\./);
    expect(uploads).toHaveLength(1);
  });

  it('sin límites, decide el backend: el archivo se envía y su 413 se traduce', async () => {
    const uploads = mockUpload(() => ({ status: 413 }));
    const big = file('plano.pdf', 'application/pdf', 2 * 1024 * 1024);

    const result = await uploadFilesInOrder('/visits/v-1/attachments', [big]);

    expect(uploads).toHaveLength(1);
    expect(result.failure?.message).toBe('El archivo supera el tamaño máximo permitido.');
  });
});
