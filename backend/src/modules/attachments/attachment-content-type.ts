import { Transform, type TransformCallback } from 'node:stream';

import { ATTACHMENT_MIME_TYPES } from '@/modules/parameters/parameter-rules.registry';

import { fileExtensionOf } from './attachment-policy';

/**
 * Detección del tipo de un adjunto **por la firma del contenido** (magic bytes),
 * cotejada con la extensión del nombre y con la lista blanca
 * `crm.adjuntos.tipos_permitidos` (02 RN-02.29, ADR-021). El `Content-Type` que
 * envía el navegador no se usa nunca.
 *
 * - PDF `%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`.
 * - DOCX y XLSX son ZIP (`PK 03 04`): se lee el directorio central (al final del
 *   archivo) y se exige `[Content_Types].xml` y la parte principal
 *   (`word/document.xml` o `xl/workbook.xml`). Un ZIP cualquiera no pasa.
 */

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

export const PDF_MIME_TYPE = 'application/pdf';
export const JPEG_MIME_TYPE = 'image/jpeg';
export const PNG_MIME_TYPE = 'image/png';
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Extensiones admitidas por tipo. La extensión decide el tipo **esperado**; la firma lo confirma. */
const EXTENSION_MIME_TYPES: Readonly<Record<string, AttachmentMimeType>> = {
  pdf: PDF_MIME_TYPE,
  jpg: JPEG_MIME_TYPE,
  jpeg: JPEG_MIME_TYPE,
  png: PNG_MIME_TYPE,
  docx: DOCX_MIME_TYPE,
  xlsx: XLSX_MIME_TYPE,
};

/** Bytes iniciales que bastan para todas las firmas. */
export const SIGNATURE_HEAD_BYTES = 16;
/**
 * Bytes finales que se conservan para leer el directorio central de un ZIP. El
 * de un DOCX/XLSX ocupa ~100 bytes por parte; 256 KiB cubren miles de partes. Un
 * ZIP cuyo directorio no cabe se rechaza (no se puede verificar).
 */
export const ZIP_TAIL_BYTES = 256 * 1024;

const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_LENGTH = 22;
const EOCD_MAX_COMMENT = 0xffff;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const CENTRAL_HEADER_LENGTH = 46;

const OOXML_CONTENT_TYPES_PART = '[Content_Types].xml';
const DOCX_MAIN_PART = 'word/document.xml';
const XLSX_MAIN_PART = 'xl/workbook.xml';

/** Tipo esperado según la extensión del nombre (ya saneado), o `null` si no es una extensión admitida. */
export function mimeTypeForFileName(fileName: string): AttachmentMimeType | null {
  return EXTENSION_MIME_TYPES[fileExtensionOf(fileName)] ?? null;
}

/**
 * Nombres de las entradas del directorio central de un ZIP a partir de sus
 * últimos bytes (o del archivo entero). `null` si no hay un directorio válido y
 * completo dentro de `tail` (incluido ZIP64, que ningún DOCX/XLSX de 10 MB necesita).
 */
export function listZipEntryNames(tail: Buffer): string[] | null {
  const eocd = findEndOfCentralDirectory(tail);
  if (eocd < 0) {
    return null;
  }
  const entryCount = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryStart = eocd - directorySize;
  if (directoryStart < 0 || entryCount === 0xffff || directorySize === 0xffffffff) {
    return null;
  }

  const names: string[] = [];
  let offset = directoryStart;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + CENTRAL_HEADER_LENGTH > eocd || tail.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) {
      return null;
    }
    const nameLength = tail.readUInt16LE(offset + 28);
    const extraLength = tail.readUInt16LE(offset + 30);
    const commentLength = tail.readUInt16LE(offset + 32);
    const nameStart = offset + CENTRAL_HEADER_LENGTH;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > eocd) {
      return null;
    }
    names.push(tail.toString('utf8', nameStart, nameStart + nameLength));
    offset = next;
  }
  return names;
}

/**
 * Tipo detectado por la firma, o `null` si el contenido no es ninguno de los
 * admitidos. `head` = primeros bytes; `tail` = últimos bytes (o el archivo entero).
 */
export function detectAttachmentMimeType(head: Buffer, tail: Buffer): AttachmentMimeType | null {
  if (startsWith(head, PDF_SIGNATURE)) return PDF_MIME_TYPE;
  if (startsWith(head, PNG_SIGNATURE)) return PNG_MIME_TYPE;
  if (startsWith(head, JPEG_SIGNATURE)) return JPEG_MIME_TYPE;
  if (!startsWith(head, ZIP_LOCAL_HEADER)) return null;

  const entries = listZipEntryNames(tail);
  if (!entries || !entries.includes(OOXML_CONTENT_TYPES_PART)) {
    return null;
  }
  const isDocx = entries.includes(DOCX_MAIN_PART);
  const isXlsx = entries.includes(XLSX_MAIN_PART);
  if (isDocx === isXlsx) {
    // Ninguna parte principal, o las dos (ambiguo): no se acepta.
    return null;
  }
  return isDocx ? DOCX_MIME_TYPE : XLSX_MIME_TYPE;
}

export type AttachmentTypeVerdict =
  | { readonly ok: true; readonly mimeType: AttachmentMimeType }
  | { readonly ok: false; readonly reason: 'EXTENSION_NOT_ALLOWED' | 'SIGNATURE_MISMATCH' };

/**
 * Decisión previa a guardar, solo con el nombre: la extensión debe ser de un
 * tipo admitido **y** estar en la lista blanca vigente. Evita escribir un
 * archivo que se rechazaría de todos modos.
 */
export function expectedTypeForFileName(fileName: string, allowed: readonly string[]): AttachmentTypeVerdict {
  const expected = mimeTypeForFileName(fileName);
  return expected && allowed.includes(expected)
    ? { ok: true, mimeType: expected }
    : { ok: false, reason: 'EXTENSION_NOT_ALLOWED' };
}

/** Decisión final, con el contenido: la firma debe coincidir con el tipo esperado por la extensión. */
export function verifyAttachmentContent(expected: AttachmentMimeType, head: Buffer, tail: Buffer): AttachmentTypeVerdict {
  return detectAttachmentMimeType(head, tail) === expected
    ? { ok: true, mimeType: expected }
    : { ok: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * Transformación de paso que conserva los primeros `SIGNATURE_HEAD_BYTES` y los
 * últimos `ZIP_TAIL_BYTES` del flujo, para detectar el tipo **mientras** se
 * guarda (sin releer el archivo ni cargarlo entero en memoria).
 */
export class ContentSniffer extends Transform {
  private headBytes = Buffer.alloc(0);
  private tailChunks: Buffer[] = [];
  private tailLength = 0;

  get head(): Buffer {
    return this.headBytes;
  }

  get tail(): Buffer {
    const all = Buffer.concat(this.tailChunks, this.tailLength);
    return all.length > ZIP_TAIL_BYTES ? all.subarray(all.length - ZIP_TAIL_BYTES) : all;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.headBytes.length < SIGNATURE_HEAD_BYTES) {
      // Copia: un `subarray` retendría en memoria todo el bloque concatenado (hasta 64 KiB por trozo).
      this.headBytes = Buffer.from(Buffer.concat([this.headBytes, chunk]).subarray(0, SIGNATURE_HEAD_BYTES));
    }
    this.tailChunks.push(chunk);
    this.tailLength += chunk.length;
    // Compacta de vez en cuando: memoria acotada a ~2 × ZIP_TAIL_BYTES.
    if (this.tailLength > ZIP_TAIL_BYTES * 2) {
      const kept = this.tail;
      this.tailChunks = [Buffer.from(kept)];
      this.tailLength = kept.length;
    }
    callback(null, chunk);
  }
}

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

/** Posición del registro de fin del directorio central, buscando desde el final (puede llevar comentario). */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const lowest = Math.max(0, buffer.length - EOCD_MIN_LENGTH - EOCD_MAX_COMMENT);
  for (let position = buffer.length - EOCD_MIN_LENGTH; position >= lowest; position -= 1) {
    if (buffer.readUInt32LE(position) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(position + 20);
      if (position + EOCD_MIN_LENGTH + commentLength === buffer.length) {
        return position;
      }
    }
  }
  return -1;
}
