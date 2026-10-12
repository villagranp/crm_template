import { Readable } from 'node:stream';

import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { attachmentDownload, contentDispositionAttachment } from './attachment-download';

describe('attachment-download', () => {
  describe('contentDispositionAttachment', () => {
    it('siempre es attachment, con respaldo ASCII y filename* RFC 5987', () => {
      expect(contentDispositionAttachment('Cotización 2026.pdf')).toBe(
        `attachment; filename="Cotizaci_n 2026.pdf"; filename*=UTF-8''Cotizaci%C3%B3n%202026.pdf`,
      );
    });

    it('neutraliza comillas, barras invertidas y porcentajes en el respaldo y codifica el resto', () => {
      expect(contentDispositionAttachment(`a'b(c)*d%e\\f".png`)).toBe(
        `attachment; filename="a'b(c)*d_e_f_.png"; filename*=UTF-8''a%27b%28c%29%2Ad%25e%5Cf%22.png`,
      );
    });

    it('nunca deja saltos de línea que permitan inyectar cabeceras', () => {
      const header = contentDispositionAttachment('x\r\nSet-Cookie: a=b.pdf');
      expect(header).not.toMatch(/[\r\n]/);
    });
  });

  it('attachmentDownload fija tipo, longitud, disposición, nosniff y no-store', () => {
    const headers = new Map<string, string>();
    const response = { setHeader: (name: string, value: string) => headers.set(name, value) } as unknown as Response;

    const file = attachmentDownload(response, {
      stream: Readable.from([Buffer.from('%PDF-')]),
      fileName: 'contrato.pdf',
      contentType: 'application/pdf',
      sizeBytes: 5,
    });

    expect(file).toBeInstanceOf(StreamableFile);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(file.getHeaders()).toEqual({
      type: 'application/pdf',
      length: 5,
      disposition: `attachment; filename="contrato.pdf"; filename*=UTF-8''contrato.pdf`,
    });
  });
});
