/**
 * Lector CSV propio (06 D-06.2, D-06.3), pareja de `csv.ts`. RFC 4180 acotado y
 * sin conversión de tipos: todo valor es texto (una conversión automática dañaría
 * códigos con ceros a la izquierda o NIT largos).
 *
 * - Solo UTF-8, con o sin BOM; decodificación estricta (un CSV en Windows-1252 se
 *   rechaza con `INVALID_ENCODING`, nunca se adivina la codificación).
 * - Delimitador `,` o `;`, detectado en la fila de encabezados (Excel en español
 *   guarda con `;`).
 * - Comillas dobles con escape `""`; saltos de línea dentro de comillas; CRLF, LF o CR.
 * - Topes: registro de 16 KB (`maxRecordChars`), 30 columnas y `maxRows` filas de
 *   datos; al superarlos aborta sin seguir leyendo.
 *
 * Numeración: el primer registro es el encabezado; `rowNumber = 1` es el registro
 * siguiente. Los registros completamente vacíos se omiten, pero conservan su
 * posición en la numeración de los siguientes (06 RN-06.9, RN-06.28).
 */

export type CsvReadIssue = 'EMPTY_FILE' | 'INVALID_ENCODING' | 'MALFORMED_CSV' | 'TOO_MANY_ROWS';

/** Motivo técnico de `MALFORMED_CSV` (para el log; nunca contiene datos del archivo). */
export type CsvMalformedReason = 'UNCLOSED_QUOTE' | 'TEXT_AFTER_QUOTE' | 'RECORD_TOO_LONG' | 'TOO_MANY_COLUMNS';

export class CsvReadError extends Error {
  constructor(
    readonly issue: CsvReadIssue,
    readonly reason: CsvMalformedReason | null = null,
  ) {
    super(`CSV rejected: ${issue}${reason ? ` (${reason})` : ''}`);
    this.name = 'CsvReadError';
  }
}

export interface CsvReadLimits {
  /** Filas de datos no vacías admitidas. */
  readonly maxRows: number;
  readonly maxColumns?: number;
  readonly maxRecordChars?: number;
}

export interface CsvRecord {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

export interface CsvReadResult {
  readonly delimiter: ',' | ';';
  readonly headers: readonly string[];
  readonly rows: readonly CsvRecord[];
}

export const CSV_DEFAULT_MAX_COLUMNS = 30;
export const CSV_DEFAULT_MAX_RECORD_CHARS = 16 * 1024;

function decodeUtf8(buffer: Uint8Array): string {
  try {
    // `ignoreBOM: false` (por defecto) quita el BOM inicial.
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new CsvReadError('INVALID_ENCODING');
  }
}

/** `;` si la primera línea (fuera de comillas) tiene más `;` que `,`. */
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

export function readCsv(buffer: Uint8Array, limits: CsvReadLimits): CsvReadResult {
  const text = decodeUtf8(buffer);
  if (text.trim() === '') {
    throw new CsvReadError('EMPTY_FILE');
  }
  const maxColumns = limits.maxColumns ?? CSV_DEFAULT_MAX_COLUMNS;
  const maxRecordChars = limits.maxRecordChars ?? CSV_DEFAULT_MAX_RECORD_CHARS;
  const delimiter = detectDelimiter(text);

  let headers: string[] | null = null;
  const rows: CsvRecord[] = [];
  let recordIndex = 0;

  let cells: string[] = [];
  let field = '';
  let recordChars = 0;
  let inQuotes = false;
  let afterQuote = false;

  const endField = (): void => {
    cells.push(field);
    field = '';
    afterQuote = false;
    if (cells.length > maxColumns) throw new CsvReadError('MALFORMED_CSV', 'TOO_MANY_COLUMNS');
  };
  const endRecord = (): void => {
    endField();
    if (headers === null) {
      headers = cells;
    } else if (!isBlank(cells)) {
      if (rows.length >= limits.maxRows) throw new CsvReadError('TOO_MANY_ROWS');
      rows.push({ rowNumber: recordIndex, cells });
    }
    recordIndex += 1;
    cells = [];
    recordChars = 0;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    recordChars += 1;
    if (recordChars > maxRecordChars) throw new CsvReadError('MALFORMED_CSV', 'RECORD_TOO_LONG');

    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
        afterQuote = true;
      }
      continue;
    }
    if (char === delimiter) {
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      endRecord();
    } else if (afterQuote) {
      throw new CsvReadError('MALFORMED_CSV', 'TEXT_AFTER_QUOTE');
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else {
      // Una comilla en medio de un campo sin comillas se conserva literal (como Excel).
      field += char;
    }
  }

  if (inQuotes) throw new CsvReadError('MALFORMED_CSV', 'UNCLOSED_QUOTE');
  // Último registro sin salto de línea final.
  if (field !== '' || cells.length > 0 || afterQuote) endRecord();

  return { delimiter, headers: headers ?? [], rows };
}
