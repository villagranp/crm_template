import { BadRequestException, type CallHandler, type ExecutionContext, type NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { of } from 'rxjs';

import { PayloadTooLargeError } from '@/common/errors/application-error';

import { ATTACHMENT_TOO_LARGE } from './attachment-errors';
import {
  ATTACHMENT_UPLOAD_LIMITS,
  AttachmentUploadInterceptor,
  toAttachmentUpload,
  translateUploadError,
  uploadSizeLimit,
} from './attachment-upload.interceptor';
import type { AttachmentsService } from './attachments.service';

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

  it('el 413 informa el máximo vigente con el que se cortó', () => {
    const error = translateUploadError(new PayloadTooLargeException('File too large'), 1024 * 1024);
    expect(error).toMatchObject({ code: ATTACHMENT_TOO_LARGE, details: [{ field: 'file', maxBytes: 1024 * 1024 }] });
  });

  it('el corte de multer es el máximo vigente, nunca por encima del techo', () => {
    expect(uploadSizeLimit(2 * 1024 * 1024)).toBe(2 * 1024 * 1024);
    expect(uploadSizeLimit(50 * 1024 * 1024)).toBe(ATTACHMENT_UPLOAD_LIMITS.fileSize);
  });

  describe('AttachmentUploadInterceptor', () => {
    const context = {} as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    function setup(maxBytes: number) {
      const attachments = { limits: jest.fn().mockResolvedValue({ maxBytes, allowedTypes: [] }) };
      const interceptor = new AttachmentUploadInterceptor(attachments as unknown as AttachmentsService);
      const multer: NestInterceptor = { intercept: jest.fn(() => of('ok')) };
      const multerFor = jest
        .spyOn(interceptor as unknown as { multerFor: (size: number) => NestInterceptor }, 'multerFor')
        .mockReturnValue(multer);
      return { attachments, interceptor, multer, multerFor };
    }

    it('lee crm.adjuntos.max_mb en cada petición y corta multer en ese tamaño', async () => {
      const { attachments, interceptor, multerFor } = setup(2 * 1024 * 1024);

      await interceptor.intercept(context, next);
      await interceptor.intercept(context, next);

      expect(attachments.limits).toHaveBeenCalledTimes(2);
      expect(multerFor).toHaveBeenCalledWith(2 * 1024 * 1024);
    });

    it('traduce el exceso de tamaño a 413 con el máximo vigente', async () => {
      const { interceptor, multer } = setup(1024 * 1024);
      (multer.intercept as jest.Mock).mockRejectedValue(new PayloadTooLargeException('File too large'));

      await expect(interceptor.intercept(context, next)).rejects.toMatchObject({
        code: ATTACHMENT_TOO_LARGE,
        details: [{ field: 'file', maxBytes: 1024 * 1024 }],
      });
    });

    it('reutiliza el interceptor de multer de cada tamaño', () => {
      const interceptor = new AttachmentUploadInterceptor({} as AttachmentsService);
      const multerFor = (interceptor as unknown as { multerFor: (size: number) => NestInterceptor }).multerFor.bind(interceptor);
      expect(multerFor(1024)).toBe(multerFor(1024));
      expect(multerFor(2048)).not.toBe(multerFor(1024));
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
