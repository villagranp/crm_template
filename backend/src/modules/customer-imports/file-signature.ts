/**
 * Tipo real del archivo de la carga (06 RN-06.8, H.2): se decide por el
 * contenido, no por la extensión ni por el `Content-Type`; los tres deben ser
 * coherentes. La comprobación es pura y no usa ninguna librería.
 *
 * - XLSX = ZIP (`50 4B 03 04`); su contenido (`[Content_Types].xml`,
 *   `xl/workbook.xml`, macros) lo comprueba la guardia ZIP.
 * - Contenedor OLE (`D0 CF 11 E0`): `.xls` o XLSX cifrada → no admitido.
 * - CSV = texto sin bytes NUL ni firma binaria conocida; la codificación UTF-8 la
 *   comprueba el lector (`422 INVALID_ENCODING`).
 */

export type ImportFileFormat = 'CSV' | 'XLSX';

export type FileTypeRejection = 'UNSUPPORTED_EXTENSION' | 'OLE_CONTAINER' | 'SIGNATURE_MISMATCH' | 'BINARY_CONTENT' | 'CONTENT_TYPE_MISMATCH';

export type FileTypeResult =
  | { readonly ok: true; readonly format: ImportFileFormat }
  | { readonly ok: false; readonly reason: FileTypeRejection };

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Firmas binarias habituales que nunca son un CSV (imágenes, PDF, ejecutables, comprimidos). */
const BINARY_SIGNATURES: readonly Buffer[] = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from('%PDF', 'ascii'),
  Buffer.from('GIF8', 'ascii'),
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from('MZ', 'ascii'),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from([0x1f, 0x8b]),
  Buffer.from([0x50, 0x4b]),
];

/** `Content-Type` que los navegadores envían para cada formato (Windows declara el CSV como `vnd.ms-excel`). */
const ACCEPTED_CONTENT_TYPES: Readonly<Record<ImportFileFormat, readonly string[]>> = {
  CSV: ['text/csv', 'text/plain', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'application/octet-stream', ''],
  XLSX: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream', ''],
};

export function extensionFormat(fileName: string): ImportFileFormat | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.xlsx')) return 'XLSX';
  return null;
}

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

export function detectImportFileType(buffer: Buffer, fileName: string, declaredContentType: string | undefined): FileTypeResult {
  const format = extensionFormat(fileName);
  if (!format) return { ok: false, reason: 'UNSUPPORTED_EXTENSION' };

  const contentType = (declaredContentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED_CONTENT_TYPES[format].includes(contentType)) return { ok: false, reason: 'CONTENT_TYPE_MISMATCH' };

  // Vacío: el formato es el de la extensión y el lector lo rechaza como `EMPTY_FILE` (422).
  if (buffer.length === 0) return { ok: true, format };

  if (startsWith(buffer, OLE_SIGNATURE)) return { ok: false, reason: 'OLE_CONTAINER' };
  if (format === 'XLSX') {
    return startsWith(buffer, ZIP_SIGNATURE) ? { ok: true, format } : { ok: false, reason: 'SIGNATURE_MISMATCH' };
  }
  if (BINARY_SIGNATURES.some((signature) => startsWith(buffer, signature)) || buffer.includes(0x00)) {
    return { ok: false, reason: 'BINARY_CONTENT' };
  }
  return { ok: true, format };
}
