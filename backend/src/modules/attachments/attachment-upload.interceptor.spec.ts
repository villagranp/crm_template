import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import { PayloadTooLargeError } from '@/common/errors/application-error';

import { ATTACHMENT_TOO_LARGE } from './attachment-errors';
import { ATTACHMENT_UPLOAD_LIMITS, toAttachmentUpload, translateUploadError } from './attachment-upload.interceptor';

describe('attachment-upload.interceptor', () => {
  it('un archivo por encima del techo de multer es 413 ATTACHMENT_TOO_LARGE', () => {
    const error = translateUploadError(new PayloadTooLargeException('File too large'));
    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect(error).toMatchObject({ code: ATTACHMENT_TOO_LARGE });
  });

  it('más de un archivo o un campo inesperado es 400 VALIDATION_FAILED sobre el campo file', () => {
    const error = translateUploadError(new BadRequestException('Too many files')) as BadRequestException;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: [{ field: 'file', issue: 'Too many files' }],
    });
  });

  it('otros errores pasan sin cambios', () => {
    const original = new Error('otro');
    expect(translateUploadError(original)).toBe(original);
  });

  it('los límites admiten un solo archivo y como mucho el techo de NGINX (10 MiB)', () => {
    expect(ATTACHMENT_UPLOAD_LIMITS.files).toBe(1);
    expect(ATTACHMENT_UPLOAD_LIMITS.fileSize).toBe(10 * 1024 * 1024);
  });

  describe('toAttachmentUpload', () => {
    it('sin archivo responde 400 VALIDATION_FAILED', () => {
      expect(() => toAttachmentUpload(undefined)).toThrow(BadRequestException);
    });

    it('convierte el archivo de multer en un flujo con su nombre original', async () => {
      const upload = toAttachmentUpload({ originalname: 'a.pdf', size: 3, buffer: Buffer.from('abc') }, 'desc');
      const chunks: Buffer[] = [];
      for await (const chunk of upload.content) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('abc');
      expect(upload).toMatchObject({ fileName: 'a.pdf', description: 'desc' });
    });
  });
});
