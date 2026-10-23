import { compareCalendarDates } from '@/modules/projects/project-dates';
import { isCalendarDate } from '@/common/calendar-date';
import { isPlainText, normalizeLineBreaks } from '@/common/dto/plain-text.validator';
import { sanitizeCell } from '@/modules/customer-imports/cell-sanitizer';
import { normalizeName } from '@/modules/customers/customer-normalization';
import { FAMILY_CODE_PATTERN, normalizeCode, SKU_PATTERN } from '@/modules/products/master-data-rules';
import { normalizeProjectCode } from '@/modules/projects/project-rules';
import { canonicalOid, isGuid } from '@/common/identity-claims';
import { isEmail } from 'class-validator';

import type { ParsedSheet } from './initial-data-file-reader';
import type { ReportEntry } from './initial-data-report';
import { type LoadColumn, type LoadSheet, sanitizableColumn } from './initial-data-templates';

/**
 * Saneamiento y validación **pura** de las filas de la carga inicial (sin base de datos ni
 * servicios): lectura de celdas como texto, obligatorios, formatos, fechas, duplicados dentro del
 * archivo y normalización a borradores. La resolución contra la base (clientes, catálogos,
 * familias, existentes) la hace `InitialDataLoader` con el puerto de consulta.
 *
 * Ningún mensaje repite el valor de una celda: solo el número de fila, la columna y el motivo.
 */

export const SORT_ORDER_MAX = 100_000;
export const SAFETY_MINUTE_MESSAGE_MAX = 1000;
/** Código manual de proyecto (el DTO solo exige 1–30 caracteres; aquí además un patrón, como el folio `PRY-AAAA-nnnnn`). */
export const PROJECT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,29}$/;

export type RowValues = Readonly<Record<string, string | null>>;

export interface LoadRow {
  readonly fileRow: number;
  readonly values: RowValues;
}

/** Acumula incidencias de una hoja: errores por fila, filas omitidas por «ya existe» y su conteo. */
export class SheetCollector {
  readonly entries: ReportEntry[] = [];
  private readonly errorRows = new Set<number>();
  private readonly existingRows = new Set<number>();
  private readonly differentRows = new Set<number>();
  private readonly warnedCreatedRows = new Set<number>();

  constructor(readonly sheet: LoadSheet) {}

  private headerOf(key: string | null): string | null {
    if (key === null) return null;
    return this.sheet.columns.find((column) => column.key === key)?.header ?? null;
  }

  error(fileRow: number, columnKey: string | null, code: string, message: string): void {
    this.errorRows.add(fileRow);
    this.entries.push({ sheet: this.sheet.sheetName, row: fileRow, column: this.headerOf(columnKey), status: 'ERROR', code, message });
  }

  exists(fileRow: number, columnKey: string | null, message: string): void {
    this.existingRows.add(fileRow);
    this.entries.push({ sheet: this.sheet.sheetName, row: fileRow, column: this.headerOf(columnKey), status: 'EXISTS', code: 'ALREADY_EXISTS', message });
  }

  /** Ya existe pero con datos distintos: se omite sin modificar y se avisa (no bloquea). */
  existsDifferent(fileRow: number, columnKey: string | null, message: string): void {
    this.differentRows.add(fileRow);
    this.entries.push({ sheet: this.sheet.sheetName, row: fileRow, column: this.headerOf(columnKey), status: 'WARNING', code: 'EXISTS_DIFFERENT', message });
  }

  /** Aviso informativo de una fila (no la marca como error, omitida ni advertida de creación): solo deja la incidencia. */
  note(fileRow: number | null, columnKey: string | null, code: string, message: string): void {
    this.entries.push({ sheet: this.sheet.sheetName, row: fileRow, column: this.headerOf(columnKey), status: 'WARNING', code, message });
  }

  /** Fila creada que necesita reparación manual: no cuenta como creada ni como error. */
  createdWithWarning(fileRow: number, columnKey: string | null, code: string, message: string): void {
    this.warnedCreatedRows.add(fileRow);
    this.entries.push({ sheet: this.sheet.sheetName, row: fileRow, column: this.headerOf(columnKey), status: 'WARNING', code, message });
  }

  hasError(fileRow: number): boolean {
    return this.errorRows.has(fileRow);
  }

  isExisting(fileRow: number): boolean {
    return this.existingRows.has(fileRow);
  }

  get errorRowCount(): number {
    return this.errorRows.size;
  }

  get existingRowCount(): number {
    return this.existingRows.size;
  }

  get differentRowCount(): number {
    return this.differentRows.size;
  }

  get warnedCreatedRowCount(): number {
    return this.warnedCreatedRows.size;
  }
}

const FORMULA_START = /^[=+\-@\t\r]/;

function maxLengthMessage(column: LoadColumn): string {
  return `El valor supera la longitud máxima de ${column.maxLength ?? 0} caracteres.`;
}

/**
 * Lee las celdas de una hoja como texto con el saneamiento de la carga masiva de clientes
 * (`customer-imports/cell-sanitizer`: recorte, vacío = ausente, enteros sin notación científica,
 * fórmulas, fechas, booleanos y errores de celda), más la regla de esta carga: un texto libre no
 * puede empezar por `=`, `+`, `-` ni `@` (ni tabulador o retorno de carro). Comprueba además los
 * obligatorios y el tipo de las columnas de fecha y de entero.
 */
export function sanitizeSheet(parsed: ParsedSheet, collector: SheetCollector): LoadRow[] {
  return parsed.rows.map((row): LoadRow => {
    const values: Record<string, string | null> = {};
    for (const column of parsed.sheet.columns) {
      const index = parsed.columnIndexes.get(column.key);
      const cell = index === undefined ? undefined : row.cells[index];
      const result = sanitizeCell(sanitizableColumn(column), cell ?? { kind: 'empty' });
      let value = result.value;
      let failed = false;

      if (result.issue) {
        failed = true;
        const code = result.issue.code;
        if (code === 'MAX_LENGTH') collector.error(row.fileRow, column.key, code, maxLengthMessage(column));
        else if (code === 'FORMULA_NOT_ALLOWED') {
          collector.error(row.fileRow, column.key, code, 'No puede ser una fórmula ni empezar por =, +, -, @, tabulador o retorno de carro.');
        } else if (column.valueType === 'date') collector.error(row.fileRow, column.key, 'INVALID_DATE', 'La fecha debe escribirse como texto AAAA-MM-DD.');
        else if (column.valueType === 'integer') collector.error(row.fileRow, column.key, 'INVALID_INTEGER', 'Debe ser un entero entre 0 y 100000.');
        else collector.error(row.fileRow, column.key, code, 'La celda debe contener texto (no una fecha, un decimal, un booleano ni un error).');
        value = null;
      } else if (column.isFreeText && value !== null && FORMULA_START.test(value)) {
        failed = true;
        collector.error(row.fileRow, column.key, 'FORMULA_NOT_ALLOWED', 'No puede ser una fórmula ni empezar por =, +, -, @, tabulador o retorno de carro.');
        value = null;
      } else if (value !== null && column.valueType === 'date' && !isCalendarDate(value)) {
        failed = true;
        collector.error(row.fileRow, column.key, 'INVALID_DATE', 'La fecha debe ser una fecha real con el formato AAAA-MM-DD.');
      } else if (value !== null && column.valueType === 'integer' && !isSortOrder(value)) {
        failed = true;
        collector.error(row.fileRow, column.key, 'INVALID_INTEGER', 'Debe ser un entero entre 0 y 100000.');
      }

      if (!failed && value === null && column.required) {
        collector.error(row.fileRow, column.key, 'REQUIRED_FIELD_MISSING', 'El campo es obligatorio.');
      }
      if (!failed && value !== null && value.includes(String.fromCharCode(0))) {
        failed = true;
        value = null;
        collector.error(row.fileRow, column.key, 'INVALID_FORMAT', 'No puede contener caracteres nulos.');
      }
      values[column.key] = failed ? null : value;
    }
    return { fileRow: row.fileRow, values };
  });
}

function isSortOrder(value: string): boolean {
  return /^\d{1,6}$/.test(value) && Number(value) <= SORT_ORDER_MAX;
}

/** `fileRow` → primera *otra* fila con la misma clave (todas las del grupo quedan marcadas). */
export function findDuplicateRows(entries: readonly { readonly fileRow: number; readonly key: string | null }[]): Map<number, number> {
  const groups = new Map<string, number[]>();
  for (const entry of entries) {
    if (entry.key === null) continue;
    const group = groups.get(entry.key);
    if (group) group.push(entry.fileRow);
    else groups.set(entry.key, [entry.fileRow]);
  }
  const result = new Map<number, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, second] = group as [number, number];
    for (const fileRow of group) result.set(fileRow, fileRow === first ? second : first);
  }
  return result;
}

function markDuplicates(
  collector: SheetCollector,
  rows: readonly LoadRow[],
  keyOf: (row: LoadRow) => string | null,
  columnKey: string,
  what: string,
): void {
  const duplicates = findDuplicateRows(rows.map((row) => ({ fileRow: row.fileRow, key: keyOf(row) })));
  for (const [fileRow, other] of duplicates) {
    collector.error(fileRow, columnKey, 'DUPLICATE_IN_FILE', `${what} se repite en la fila ${other} del archivo.`);
  }
}

function value(row: LoadRow, key: string): string | null {
  return row.values[key] ?? null;
}

// ---------------------------------------------------------------------------
// Familias
// ---------------------------------------------------------------------------

export interface FamilyDraft {
  readonly fileRow: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
}

export function validateFamilyRows(rows: readonly LoadRow[], collector: SheetCollector): FamilyDraft[] {
  for (const row of rows) {
    const code = value(row, 'code');
    if (code !== null && !FAMILY_CODE_PATTERN.test(normalizeCode(code))) {
      collector.error(row.fileRow, 'code', 'INVALID_FORMAT', 'El código solo admite letras, dígitos, guion y guion bajo (1 a 40 caracteres).');
    }
  }
  markDuplicates(collector, rows, (row) => normalizeCode(value(row, 'code') ?? ''), 'code', 'El código de familia');
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => ({
      fileRow: row.fileRow,
      code: normalizeCode(value(row, 'code') ?? ''),
      name: value(row, 'name') ?? '',
      description: value(row, 'description'),
      sortOrder: Number(value(row, 'sortOrder') ?? '0'),
    }));
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export interface ProductDraft {
  readonly fileRow: number;
  readonly sku: string;
  readonly description: string;
  readonly familyCode: string;
  readonly baseUnitCode: string;
}

export function validateProductRows(rows: readonly LoadRow[], collector: SheetCollector): ProductDraft[] {
  for (const row of rows) {
    const sku = value(row, 'sku');
    if (sku !== null && !SKU_PATTERN.test(normalizeCode(sku))) {
      collector.error(row.fileRow, 'sku', 'INVALID_FORMAT', 'El SKU solo admite letras, dígitos, espacios y . _ - / (1 a 60 caracteres).');
    }
  }
  markDuplicates(collector, rows, (row) => normalizeCode(value(row, 'sku') ?? ''), 'sku', 'El SKU');
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => ({
      fileRow: row.fileRow,
      sku: normalizeCode(value(row, 'sku') ?? ''),
      description: value(row, 'description') ?? '',
      familyCode: normalizeCode(value(row, 'family') ?? ''),
      baseUnitCode: normalizeCode(value(row, 'baseUnit') ?? ''),
    }));
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export type OwnerReference = { readonly kind: 'email'; readonly value: string } | { readonly kind: 'employeeCode'; readonly value: string };

/** Correo (contiene `@`, sin distinguir mayúsculas) o código de colaborador (tal como se registró). */
export function parseOwnerReference(text: string): OwnerReference {
  return text.includes('@') ? { kind: 'email', value: text.toLowerCase() } : { kind: 'employeeCode', value: text };
}

export interface ProjectDraft {
  readonly fileRow: number;
  readonly name: string;
  readonly customerCrmCode: string;
  readonly countryIso: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: string | null;
  readonly estimatedEndDate: string | null;
  readonly estimatedDecisionDate: string | null;
  readonly owner: OwnerReference | null;
  readonly projectTypeCode: string | null;
  readonly sectorCode: string | null;
  readonly code: string | null;
}

export function validateProjectRows(rows: readonly LoadRow[], collector: SheetCollector): ProjectDraft[] {
  for (const row of rows) {
    const country = value(row, 'country');
    if (country !== null && !/^[A-Za-z]{2}$/.test(country)) {
      collector.error(row.fileRow, 'country', 'INVALID_FORMAT', 'El país debe ser un código ISO de dos letras.');
    }
    const code = normalizeProjectCode(value(row, 'code'));
    if (code !== null && !PROJECT_CODE_PATTERN.test(code)) {
      collector.error(row.fileRow, 'code', 'INVALID_FORMAT', 'El código de proyecto solo admite letras, dígitos, guion y guion bajo (1 a 30 caracteres).');
    }
    const start = value(row, 'estimatedStartDate');
    const end = value(row, 'estimatedEndDate');
    if (start !== null && end !== null && !collector.hasError(row.fileRow) && compareCalendarDates(end, start) < 0) {
      collector.error(row.fileRow, 'estimatedEndDate', 'INVALID_DATE_RANGE', 'La fecha de fin no puede ser anterior a la de inicio.');
    }
  }
  markDuplicates(collector, rows, (row) => normalizeProjectCode(value(row, 'code')), 'code', 'El código de proyecto');
  markDuplicates(
    collector,
    rows,
    (row) => {
      const name = normalizeName(value(row, 'name'));
      const customer = value(row, 'customerCrmCode');
      return name && customer ? `${customer.toUpperCase()}|${name}` : null;
    },
    'name',
    'El proyecto (mismo cliente y nombre)',
  );
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => {
      const owner = value(row, 'owner');
      const country = value(row, 'country');
      return {
        fileRow: row.fileRow,
        name: value(row, 'name') ?? '',
        customerCrmCode: (value(row, 'customerCrmCode') ?? '').toUpperCase(),
        countryIso: country ? country.toUpperCase() : null,
        city: value(row, 'city'),
        address: value(row, 'address'),
        description: value(row, 'description'),
        estimatedStartDate: value(row, 'estimatedStartDate'),
        estimatedEndDate: value(row, 'estimatedEndDate'),
        estimatedDecisionDate: value(row, 'estimatedDecisionDate'),
        owner: owner ? parseOwnerReference(owner) : null,
        projectTypeCode: value(row, 'projectType')?.toUpperCase() ?? null,
        sectorCode: value(row, 'sector')?.toUpperCase() ?? null,
        code: normalizeProjectCode(value(row, 'code')),
      };
    });
}

// ---------------------------------------------------------------------------
// Minutos de seguridad
// ---------------------------------------------------------------------------

export interface MinuteDraft {
  readonly fileRow: number;
  readonly displayDate: string;
  readonly message: string;
}

export function validateMinuteRows(rows: readonly LoadRow[], collector: SheetCollector): MinuteDraft[] {
  const messageOf = (row: LoadRow): string | null => {
    const message = value(row, 'message');
    return message === null ? null : normalizeLineBreaks(message).trim();
  };
  for (const row of rows) {
    const message = messageOf(row);
    if (message === null) continue;
    if (!isPlainText(message)) {
      collector.error(row.fileRow, 'message', 'INVALID_FORMAT', 'El mensaje debe ser texto plano, sin caracteres de control ni de formato, con al menos un carácter visible.');
    } else if ([...message].length > SAFETY_MINUTE_MESSAGE_MAX) {
      collector.error(row.fileRow, 'message', 'MAX_LENGTH', `El valor supera la longitud máxima de ${SAFETY_MINUTE_MESSAGE_MAX} caracteres.`);
    }
  }
  markDuplicates(collector, rows, (row) => value(row, 'displayDate'), 'displayDate', 'La fecha');
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => ({ fileRow: row.fileRow, displayDate: value(row, 'displayDate') ?? '', message: messageOf(row) ?? '' }));
}

// ---------------------------------------------------------------------------
// Vínculos con Entra ID (ADR-027)
// ---------------------------------------------------------------------------

export interface EntraIdentityDraft {
  readonly fileRow: number;
  readonly user: OwnerReference;
  /** `oid` en minúsculas, como lo emite Entra ID y como se guarda. */
  readonly oid: string;
}

/**
 * Valida las filas de vínculos: `oid` con formato GUID y sin repetirse en el archivo, y el mismo
 * usuario (por la misma referencia) una sola vez. Que dos referencias distintas (correo y código)
 * sean el mismo usuario solo se sabe al resolverlas: lo marca el cargador.
 */
export function validateEntraIdentityRows(rows: readonly LoadRow[], collector: SheetCollector): EntraIdentityDraft[] {
  for (const row of rows) {
    const oid = value(row, 'oid');
    if (oid !== null && !isGuid(oid)) {
      collector.error(row.fileRow, 'oid', 'INVALID_FORMAT', 'El Object ID debe ser un GUID (8-4-4-4-12 caracteres hexadecimales).');
    }
  }
  markDuplicates(collector, rows, (row) => (value(row, 'oid') === null ? null : canonicalOid(value(row, 'oid') as string)), 'oid', 'El Object ID');
  markDuplicates(
    collector,
    rows,
    (row) => {
      const user = value(row, 'user');
      return user === null ? null : (parseOwnerReference(user).value.toLowerCase());
    },
    'user',
    'El usuario',
  );
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => ({
      fileRow: row.fileRow,
      user: parseOwnerReference(value(row, 'user') ?? ''),
      oid: canonicalOid(value(row, 'oid') ?? ''),
    }));
}

// ---------------------------------------------------------------------------
// Usuarios (ADR-030)
// ---------------------------------------------------------------------------

export interface UserDraft {
  readonly fileRow: number;
  /** Minúsculas, como se guarda para la unicidad. */
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Recortado y en mayúsculas, como lo guarda el alta de usuarios. */
  readonly employeeCode: string;
  /** ISO en mayúsculas. */
  readonly country: string;
  /** Código de rol en minúsculas. */
  readonly role: string;
  /** Código de equipo en mayúsculas, o `null`. */
  readonly team: string | null;
}

/** Valida las filas de usuarios: correo con forma de correo y sin repetirse, y código sin repetirse. Las referencias las resuelve el cargador. */
export function validateUserRows(rows: readonly LoadRow[], collector: SheetCollector): UserDraft[] {
  for (const row of rows) {
    const email = value(row, 'email');
    if (email !== null && !isEmail(email)) collector.error(row.fileRow, 'email', 'INVALID_FORMAT', 'El correo no tiene un formato válido.');
  }
  markDuplicates(collector, rows, (row) => value(row, 'email')?.toLowerCase() ?? null, 'email', 'El correo');
  markDuplicates(collector, rows, (row) => value(row, 'employeeCode')?.toUpperCase() ?? null, 'employeeCode', 'El código de colaborador');
  return rows
    .filter((row) => !collector.hasError(row.fileRow))
    .map((row) => ({
      fileRow: row.fileRow,
      email: (value(row, 'email') ?? '').toLowerCase(),
      firstName: value(row, 'firstName') ?? '',
      lastName: value(row, 'lastName') ?? '',
      employeeCode: (value(row, 'employeeCode') ?? '').toUpperCase(),
      country: (value(row, 'country') ?? '').toUpperCase(),
      role: (value(row, 'role') ?? '').toLowerCase(),
      team: value(row, 'team')?.toUpperCase() ?? null,
    }));
}
