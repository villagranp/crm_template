import { inflateRawSync } from 'node:zlib';

/**
 * Guardia ZIP propia del XLSX subido (06 RN-06.31 paso 2, H.2, ADR-022). Se
 * ejecuta **antes** de entregar el archivo a `exceljs` y sin ella:
 *
 * 1. Directorio central: como mucho 100 entradas, sin ZIP64, sin cifrado, sin
 *    rutas absolutas ni `..`, tamaño descomprimido declarado ≤ 64 MB y razón de
 *    compresión ≤ 100:1 por entrada.
 * 2. Paquete: `[Content_Types].xml` y `xl/workbook.xml` presentes; sin macros
 *    (`vbaProject.bin` o tipo de libro con macros).
 * 3. Descompresión **real** de cada entrada con `maxOutputLength`: los tamaños
 *    declarados pueden mentir, así que un contenido mayor que el declarado (o que
 *    el tope) aborta sin agotar memoria.
 * 4. XML sin DTD (`<!DOCTYPE`): nunca llega a un parser una entidad externa ni
 *    una expansión de entidades.
 * 5. Recuento de filas con valores y de celdas por hoja, para que la librería
 *    nunca construya en memoria más de lo admitido.
 */

export interface ArchiveLimits {
  readonly maxEntries: number;
  readonly maxUncompressedBytes: number;
  readonly maxCompressionRatio: number;
  /** Filas de datos admitidas; cada hoja puede tener además su encabezado. */
  readonly maxDataRows: number;
  readonly maxColumns: number;
}

export const DEFAULT_ARCHIVE_LIMITS: Omit<ArchiveLimits, 'maxDataRows'> = {
  maxEntries: 100,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxColumns: 30,
};

/** `UNSUPPORTED` → 415 (no es un XLSX admitido); el resto → 422 `INVALID_IMPORT_FILE`. */
export type ArchiveRejection =
  | { readonly kind: 'UNSUPPORTED'; readonly reason: 'NOT_XLSX' | 'MACROS' | 'ENCRYPTED' }
  | { readonly kind: 'INVALID'; readonly issue: 'ARCHIVE_LIMITS_EXCEEDED' | 'UNSAFE_CONTENT' | 'TOO_MANY_ROWS'; readonly reason: string };

export class ArchiveRejectedError extends Error {
  constructor(readonly rejection: ArchiveRejection) {
    super(`XLSX archive rejected: ${rejection.kind === 'UNSUPPORTED' ? rejection.reason : `${rejection.issue} (${rejection.reason})`}`);
    this.name = 'ArchiveRejectedError';
  }
}

interface CentralEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const MACRO_CONTENT_TYPE = /macroEnabled/i;

function limitsExceeded(reason: string): ArchiveRejectedError {
  return new ArchiveRejectedError({ kind: 'INVALID', issue: 'ARCHIVE_LIMITS_EXCEEDED', reason });
}

function notXlsx(): ArchiveRejectedError {
  return new ArchiveRejectedError({ kind: 'UNSUPPORTED', reason: 'NOT_XLSX' });
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // El EOCD ocupa 22 bytes más un comentario de hasta 65 535.
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw notXlsx();
}

function readCentralDirectory(buffer: Buffer, limits: ArchiveLimits): CentralEntry[] {
  if (buffer.length < 22) throw notXlsx();
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    throw limitsExceeded('ZIP64');
  }
  if (totalEntries > limits.maxEntries) throw limitsExceeded('TOO_MANY_ENTRIES');
  if (directoryOffset + directorySize > eocd) throw notXlsx();

  const entries: CentralEntry[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw notXlsx();
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      flags: buffer.readUInt16LE(offset + 8),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function isUnsafePath(name: string): boolean {
  return name.startsWith('/') || name.includes('\\') || /^[a-z]:/i.test(name) || name.split('/').some((segment) => segment === '..');
}

function checkDeclaredEntries(entries: readonly CentralEntry[], limits: ArchiveLimits): void {
  let declaredTotal = 0;
  for (const entry of entries) {
    if ((entry.flags & 0x1) !== 0) throw new ArchiveRejectedError({ kind: 'UNSUPPORTED', reason: 'ENCRYPTED' });
    if (isUnsafePath(entry.name)) throw limitsExceeded('UNSAFE_PATH');
    if (entry.compressedSize === ZIP64_MARKER || entry.uncompressedSize === ZIP64_MARKER) throw limitsExceeded('ZIP64');
    if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) throw limitsExceeded('UNSUPPORTED_COMPRESSION');
    if (entry.uncompressedSize > 0 && entry.uncompressedSize > entry.compressedSize * limits.maxCompressionRatio) {
      throw limitsExceeded('COMPRESSION_RATIO');
    }
    declaredTotal += entry.uncompressedSize;
    if (declaredTotal > limits.maxUncompressedBytes) throw limitsExceeded('UNCOMPRESSED_SIZE');
  }
  const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
  if (!names.has('[content_types].xml') || !names.has('xl/workbook.xml')) throw notXlsx();
  if ([...names].some((name) => name.endsWith('vbaproject.bin'))) {
    throw new ArchiveRejectedError({ kind: 'UNSUPPORTED', reason: 'MACROS' });
  }
}

/** Contenido real de una entrada, sin superar nunca su tamaño declarado. */
function extract(buffer: Buffer, entry: CentralEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE) throw notXlsx();
  const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
  const end = start + entry.compressedSize;
  if (end > buffer.length) throw notXlsx();
  const data = buffer.subarray(start, end);
  if (entry.method === METHOD_STORED) {
    if (data.length !== entry.uncompressedSize) throw limitsExceeded('DECLARED_SIZE_MISMATCH');
    return data;
  }
  let content: Buffer;
  try {
    // Un byte más que lo declarado: si cabe, el tamaño declarado mentía.
    content = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.uncompressedSize + 1) });
  } catch (error) {
    if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      throw limitsExceeded('DECLARED_SIZE_MISMATCH');
    }
    throw notXlsx();
  }
  if (content.length !== entry.uncompressedSize) throw limitsExceeded('DECLARED_SIZE_MISMATCH');
  return content;
}

/** Filas con algún valor (`<v>`, `<is>` o `<f>`) y celdas de una hoja, sin parsear el XML. */
export function countSheetContent(xml: string): { readonly rowsWithValues: number; readonly cells: number } {
  let rowsWithValues = 0;
  const chunks = xml.split(/<row[\s>]/);
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index] as string;
    const end = chunk.indexOf('</row>');
    if (/<(v|is|f)[\s>]/.test(end === -1 ? chunk : chunk.slice(0, end))) rowsWithValues += 1;
  }
  const cells = (xml.match(/<c[\s>/]/g) ?? []).length;
  return { rowsWithValues, cells };
}

export interface ArchiveInspection {
  readonly entries: number;
  readonly uncompressedBytes: number;
}

/** Inspecciona el XLSX; lanza `ArchiveRejectedError` con el primer problema encontrado. */
export function inspectXlsxArchive(buffer: Buffer, limits: ArchiveLimits): ArchiveInspection {
  const entries = readCentralDirectory(buffer, limits);
  checkDeclaredEntries(entries, limits);

  // Holgura de celdas por hoja: celdas con formato sin valor y hojas auxiliares de la plantilla.
  const maxCellsPerSheet = (limits.maxDataRows + 1) * limits.maxColumns + 10_000;
  let uncompressedBytes = 0;
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const content = extract(buffer, entry);
    uncompressedBytes += content.length;
    if (!name.endsWith('.xml') && !name.endsWith('.rels') && !name.endsWith('.vml')) continue;
    const xml = content.toString('utf8');
    if (/<!doctype/i.test(xml) || /<!entity/i.test(xml)) {
      throw new ArchiveRejectedError({ kind: 'INVALID', issue: 'UNSAFE_CONTENT', reason: 'DTD' });
    }
    if (name === '[content_types].xml' && MACRO_CONTENT_TYPE.test(xml)) {
      throw new ArchiveRejectedError({ kind: 'UNSUPPORTED', reason: 'MACROS' });
    }
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      const counts = countSheetContent(xml);
      if (counts.rowsWithValues > limits.maxDataRows + 1) {
        throw new ArchiveRejectedError({ kind: 'INVALID', issue: 'TOO_MANY_ROWS', reason: 'SHEET_ROWS' });
      }
      if (counts.cells > maxCellsPerSheet) throw limitsExceeded('TOO_MANY_CELLS');
    }
  }
  return { entries: entries.length, uncompressedBytes };
}
