import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ATTACHMENT_MIME_TYPES } from '@/modules/parameters/parameter-rules.registry';

import {
  ContentSniffer,
  detectAttachmentMimeType,
  DOCX_MIME_TYPE,
  expectedTypeForFileName,
  JPEG_MIME_TYPE,
  listZipEntryNames,
  mimeTypeForFileName,
  PDF_MIME_TYPE,
  PNG_MIME_TYPE,
  verifyAttachmentContent,
  XLSX_MIME_TYPE,
  ZIP_TAIL_BYTES,
} from './attachment-content-type';
import {
  buildZip,
  DOCX_BYTES,
  HTML_BYTES,
  JPEG_BYTES,
  PDF_BYTES,
  PLAIN_ZIP_BYTES,
  PNG_BYTES,
  XLSX_BYTES,
} from './testing/attachment-fixtures';

const ALL = [...ATTACHMENT_MIME_TYPES];

function detect(content: Buffer): string | null {
  return detectAttachmentMimeType(content.subarray(0, 16), content);
}

describe('attachment-content-type', () => {
  describe('detección por firma', () => {
    it.each([
      ['PDF', PDF_BYTES, PDF_MIME_TYPE],
      ['PNG', PNG_BYTES, PNG_MIME_TYPE],
      ['JPEG', JPEG_BYTES, JPEG_MIME_TYPE],
      ['DOCX', DOCX_BYTES, DOCX_MIME_TYPE],
      ['XLSX', XLSX_BYTES, XLSX_MIME_TYPE],
    ])('reconoce %s', (_label, content, expected) => {
      expect(detect(content)).toBe(expected);
    });

    it('un ZIP sin [Content_Types].xml o sin parte principal no es Office', () => {
      expect(detect(PLAIN_ZIP_BYTES)).toBeNull();
      expect(detect(buildZip(['[Content_Types].xml', 'ppt/presentation.xml']))).toBeNull();
      expect(detect(buildZip(['word/document.xml']))).toBeNull();
    });

    it('un ZIP con las dos partes principales es ambiguo y no se acepta', () => {
      expect(detect(buildZip(['[Content_Types].xml', 'word/document.xml', 'xl/workbook.xml']))).toBeNull();
    });

    it('rechaza HTML, vacío y contenido truncado', () => {
      expect(detect(HTML_BYTES)).toBeNull();
      expect(detect(Buffer.alloc(0))).toBeNull();
      // Cabecera ZIP sin directorio central.
      expect(detect(DOCX_BYTES.subarray(0, 40))).toBeNull();
    });

    it('lee el directorio central aunque el ZIP lleve comentario', () => {
      const withComment = buildZip(['[Content_Types].xml', 'word/document.xml'], { comment: 'comentario PK' });
      expect(listZipEntryNames(withComment)).toEqual(['[Content_Types].xml', 'word/document.xml']);
      expect(detect(withComment)).toBe(DOCX_MIME_TYPE);
    });

    it('un directorio central corrupto devuelve null en lugar de lanzar', () => {
      const corrupt = Buffer.from(DOCX_BYTES);
      // Firma del primer registro del directorio central rota.
      corrupt.writeUInt32LE(0, corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
      expect(listZipEntryNames(corrupt)).toBeNull();
    });
  });

  describe('extensión y lista blanca', () => {
    it('la extensión decide el tipo esperado (sin distinguir mayúsculas)', () => {
      expect(mimeTypeForFileName('contrato.PDF')).toBe(PDF_MIME_TYPE);
      expect(mimeTypeForFileName('foto.jpeg')).toBe(JPEG_MIME_TYPE);
      expect(mimeTypeForFileName('foto.jpg')).toBe(JPEG_MIME_TYPE);
      expect(mimeTypeForFileName('pagina.html')).toBeNull();
      expect(mimeTypeForFileName('sin-extension')).toBeNull();
    });

    it('rechaza una extensión fuera de la lista blanca vigente', () => {
      expect(expectedTypeForFileName('foto.png', ALL)).toEqual({ ok: true, mimeType: PNG_MIME_TYPE });
      expect(expectedTypeForFileName('foto.png', [PDF_MIME_TYPE])).toEqual({ ok: false, reason: 'EXTENSION_NOT_ALLOWED' });
      expect(expectedTypeForFileName('script.exe', ALL)).toEqual({ ok: false, reason: 'EXTENSION_NOT_ALLOWED' });
    });

    it('la firma debe coincidir con la extensión: un HTML renombrado a .pdf no pasa', () => {
      expect(verifyAttachmentContent(PDF_MIME_TYPE, PDF_BYTES.subarray(0, 16), PDF_BYTES)).toEqual({
        ok: true,
        mimeType: PDF_MIME_TYPE,
      });
      expect(verifyAttachmentContent(PDF_MIME_TYPE, HTML_BYTES.subarray(0, 16), HTML_BYTES)).toEqual({
        ok: false,
        reason: 'SIGNATURE_MISMATCH',
      });
      // Un XLSX con extensión .docx tampoco.
      expect(verifyAttachmentContent(DOCX_MIME_TYPE, XLSX_BYTES.subarray(0, 16), XLSX_BYTES).ok).toBe(false);
    });
  });

  describe('ContentSniffer', () => {
    async function sniff(chunks: Buffer[]): Promise<ContentSniffer> {
      const sniffer = new ContentSniffer();
      const sink = new Writable({
        write(_chunk, _encoding, callback): void {
          callback();
        },
      });
      await pipeline(Readable.from(chunks), sniffer, sink);
      return sniffer;
    }

    it('conserva la cabecera y el final de un flujo troceado para detectar un DOCX', async () => {
      const chunks = [...Array(Math.ceil(DOCX_BYTES.length / 7)).keys()].map((index) =>
        DOCX_BYTES.subarray(index * 7, index * 7 + 7),
      );
      const sniffer = await sniff(chunks);

      expect(sniffer.head).toEqual(DOCX_BYTES.subarray(0, 16));
      expect(detectAttachmentMimeType(sniffer.head, sniffer.tail)).toBe(DOCX_MIME_TYPE);
    });

    it('acota la memoria: solo guarda los últimos ZIP_TAIL_BYTES de un archivo grande', async () => {
      const big = buildZip(['[Content_Types].xml', 'xl/workbook.xml'], { padding: ZIP_TAIL_BYTES * 3 });
      const chunks = [...Array(Math.ceil(big.length / 65536)).keys()].map((index) =>
        big.subarray(index * 65536, index * 65536 + 65536),
      );
      const sniffer = await sniff(chunks);

      expect(sniffer.tail.length).toBe(ZIP_TAIL_BYTES);
      expect(sniffer.tail).toEqual(big.subarray(big.length - ZIP_TAIL_BYTES));
      // La cabecera es una copia propia: no retiene el primer bloque de 64 KiB.
      expect(sniffer.head.buffer.byteLength).toBeLessThan(65536);
      expect(detectAttachmentMimeType(sniffer.head, sniffer.tail)).toBe(XLSX_MIME_TYPE);
    });
  });
});
