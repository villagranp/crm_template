import type { CustomerDraft } from '@/modules/customers/customer-validation.service';

/**
 * Definición única de las columnas de la carga (06 RN-06.5): la usan la
 * plantilla, la lectura, la validación de encabezados y el archivo de errores.
 * Las claves son las del borrador del Módulo 2 (`CustomerDraft`), así que una
 * fila leída se entrega tal cual a `CustomerValidationService` (RN-06.12).
 */

export const IMPORT_TEMPLATE_VERSION = '1';

export type ImportColumnKey = keyof CustomerDraft;

/** Cómo se interpreta un número de Excel en la columna (RN-06.11). */
export type ImportColumnKind = 'code' | 'text';

export interface ImportColumn {
  readonly key: ImportColumnKey;
  readonly header: string;
  /** `null` = sin longitud propia (referencia por código). */
  readonly maxLength: number | null;
  readonly kind: ImportColumnKind;
  /** Texto libre al que se aplica la regla de fórmulas (D-06.11, 02 RN-02.32). */
  readonly isFreeText: boolean;
  readonly description: string;
  /** Ejemplo ficticio de la hoja de instrucciones. */
  readonly example: string;
}

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: 'customerCode',
    header: 'Código de cliente',
    maxLength: 40,
    kind: 'code',
    isFreeText: false,
    description: 'Código del establecimiento. Opcional; único por país.',
    example: 'CL-0001',
  },
  { key: 'legalName', header: 'Razón social', maxLength: 200, kind: 'text', isFreeText: true, description: 'Nombre legal de la empresa.', example: 'Empresa Ejemplo, S.A.' },
  { key: 'tradeName', header: 'Nombre comercial', maxLength: 200, kind: 'text', isFreeText: true, description: 'Nombre con el que se conoce la empresa.', example: 'Ejemplo' },
  {
    key: 'country',
    header: 'País',
    maxLength: null,
    kind: 'code',
    isFreeText: false,
    description: 'Código ISO de dos letras de un país activo (ver hoja Valores válidos).',
    example: 'GT',
  },
  { key: 'city', header: 'Ciudad', maxLength: 120, kind: 'text', isFreeText: true, description: 'Ciudad, texto libre.', example: 'Ciudad de Guatemala' },
  { key: 'address', header: 'Dirección', maxLength: 300, kind: 'text', isFreeText: true, description: 'Dirección del establecimiento.', example: 'Avenida 1, zona 1' },
  { key: 'phone', header: 'Teléfono', maxLength: 40, kind: 'code', isFreeText: false, description: 'Teléfono con el formato del país.', example: '+502 2222 3333' },
  { key: 'email', header: 'Correo', maxLength: 320, kind: 'text', isFreeText: false, description: 'Correo electrónico de la empresa.', example: 'contacto@ejemplo.com' },
  {
    key: 'companyType',
    header: 'Tipo de empresa',
    maxLength: null,
    kind: 'code',
    isFreeText: false,
    description: 'Código de un tipo de empresa activo (ver hoja Valores válidos).',
    example: 'DISTRIBUIDOR',
  },
  {
    key: 'status',
    header: 'Estado',
    maxLength: null,
    kind: 'code',
    isFreeText: false,
    description: 'Código de un estado de cliente activo. Vacío: el valor por defecto.',
    example: 'ACTIVO',
  },
  {
    key: 'rating',
    header: 'Calificación',
    maxLength: null,
    kind: 'code',
    isFreeText: false,
    description: 'Código de una calificación de cliente activa.',
    example: 'A',
  },
  {
    key: 'salesOwner',
    header: 'Responsable comercial',
    maxLength: null,
    kind: 'code',
    isFreeText: false,
    description: 'Código de colaborador o correo de un usuario activo. Vacío: quien hace la carga.',
    example: 'responsable@ejemplo.com',
  },
  { key: 'taxId', header: 'NIT', maxLength: 30, kind: 'code', isFreeText: false, description: 'Identificador tributario con el formato del país. Puede repetirse.', example: '1234567-8' },
];

/**
 * Encabezados extra del archivo de errores (RN-06.26). El de estado no puede ser
 * "Estado": chocaría con la columna Estado (del cliente) de la plantilla al volver a subirlo.
 */
export const ERROR_FILE_HEADERS = { fileRow: 'Fila del archivo', status: 'Estado de la fila', errors: 'Errores' } as const;

/** Encabezado comparable: sin mayúsculas, acentos ni espacios sobrantes (RN-06.10). */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLowerCase();
}

const COLUMN_BY_HEADER: ReadonlyMap<string, ImportColumn> = new Map(IMPORT_COLUMNS.map((column) => [normalizeHeader(column.header), column]));

/** Columnas propias del archivo de errores: se ignoran al volver a subirlo corregido (AC-06.20). */
const IGNORED_HEADERS: ReadonlySet<string> = new Set(Object.values(ERROR_FILE_HEADERS).map(normalizeHeader));

export type HeaderIssueCode = 'MISSING_COLUMN' | 'UNKNOWN_COLUMN' | 'DUPLICATE_COLUMN';

export interface HeaderIssue {
  readonly issue: HeaderIssueCode;
  /** Encabezado de la plantilla (faltante) o tal como vino en el archivo, recortado (desconocido o repetido). */
  readonly column: string;
}

export type HeaderMatch =
  | { readonly ok: true; readonly columnIndexes: ReadonlyMap<ImportColumnKey, number> }
  | { readonly ok: false; readonly issues: readonly HeaderIssue[] };

/**
 * Asigna cada encabezado a su columna (orden libre). Toda columna de la plantilla
 * es obligatoria **en el archivo** aunque el campo sea opcional: una columna
 * desplazada asignaría datos al campo equivocado (RN-06.10). Se ignoran los
 * encabezados vacíos del final y las columnas que añade el archivo de errores
 * ("Fila del archivo", "Estado de la fila", "Errores"), para que pueda volver a subirse.
 */
export function matchHeaders(headers: readonly string[]): HeaderMatch {
  const issues: HeaderIssue[] = [];
  const columnIndexes = new Map<ImportColumnKey, number>();
  const seenUnknown = new Set<string>();
  let lastNonEmpty = headers.length - 1;
  while (lastNonEmpty >= 0 && (headers[lastNonEmpty] ?? '').trim() === '') lastNonEmpty -= 1;

  for (let index = 0; index <= lastNonEmpty; index += 1) {
    const raw = (headers[index] ?? '').replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
    const normalized = normalizeHeader(raw);
    if (IGNORED_HEADERS.has(normalized)) continue;
    const column = COLUMN_BY_HEADER.get(normalized);
    if (!column) {
      if (seenUnknown.has(normalized)) issues.push({ issue: 'DUPLICATE_COLUMN', column: raw });
      else issues.push({ issue: 'UNKNOWN_COLUMN', column: raw });
      seenUnknown.add(normalized);
    } else if (columnIndexes.has(column.key)) {
      issues.push({ issue: 'DUPLICATE_COLUMN', column: column.header });
    } else {
      columnIndexes.set(column.key, index);
    }
  }
  for (const column of IMPORT_COLUMNS) {
    if (!columnIndexes.has(column.key)) issues.push({ issue: 'MISSING_COLUMN', column: column.header });
  }
  return issues.length === 0 ? { ok: true, columnIndexes } : { ok: false, issues };
}
