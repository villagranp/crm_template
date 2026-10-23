import type { ImportColumnKey } from './import-template';

/**
 * Incidencias de fila (06 F.3, RN-06.17, RN-06.18): misma forma que
 * `customer_import_rows.errors` (`00` §2.14) con `severity`. Los códigos del
 * Módulo 2 se conservan tal cual; el mensaje lo produce el servidor en español
 * para que la vista previa y el archivo de errores digan lo mismo. **Ningún
 * mensaje repite el valor de la celda** (RN-06.11).
 */

export type IssueSeverity = 'ERROR' | 'WARNING';

export interface ImportIssue {
  /** Clave de la columna de la plantilla (`legalName`, `country`…) o `row`. */
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly severity: IssueSeverity;
}

/**
 * Lo que se guarda en `errors`: la incidencia más, en los avisos de duplicado,
 * los ids de los clientes avisados que el usuario podía ver (para traducir la
 * confirmación en `acknowledgedDuplicateIds`, D-06.6). Nunca sale por la API.
 */
export interface StoredImportIssue extends ImportIssue {
  readonly candidateIds?: readonly string[];
}

export const IMPORT_ISSUE_CODES = {
  maxLength: 'MAX_LENGTH',
  invalidCellType: 'INVALID_CELL_TYPE',
  formulaNotAllowed: 'FORMULA_NOT_ALLOWED',
  duplicateInFile: 'DUPLICATE_IN_FILE',
  possibleDuplicateInFile: 'POSSIBLE_DUPLICATE_IN_FILE',
  duplicateTaxId: 'DUPLICATE_TAX_ID',
  possibleDuplicate: 'POSSIBLE_DUPLICATE',
  customerCodeTaken: 'CUSTOMER_CODE_TAKEN',
  duplicateBlocked: 'DUPLICATE_BLOCKED',
  importInterrupted: 'IMPORT_INTERRUPTED',
  createFailed: 'CREATE_FAILED',
  invalidPhoneFormat: 'INVALID_PHONE_FORMAT',
} as const;

/** Campo del Módulo 2 (`details[].field` del alta) → columna de la plantilla. */
const FIELD_BY_CUSTOMER_FIELD: Readonly<Record<string, ImportColumnKey>> = {
  countryId: 'country',
  companyTypeId: 'companyType',
  statusId: 'status',
  ratingId: 'rating',
  salesOwnerId: 'salesOwner',
};

export function importFieldOf(customerField: string): string {
  return FIELD_BY_CUSTOMER_FIELD[customerField] ?? customerField;
}

/** Mensajes en español por código (propios y del Módulo 2). */
const MESSAGES: Readonly<Record<string, string>> = {
  MAX_LENGTH: 'El valor supera la longitud máxima de la columna.',
  INVALID_CELL_TYPE: 'La celda debe contener texto (no una fecha, un decimal, un booleano ni un error).',
  FORMULA_NOT_ALLOWED: 'El valor no puede ser una fórmula ni empezar por =, @, tabulador o retorno de carro.',
  DUPLICATE_IN_FILE: 'El código de cliente se repite en otra fila del archivo.',
  POSSIBLE_DUPLICATE_IN_FILE: 'La razón social se parece a la de otra fila del archivo.',
  DUPLICATE_TAX_ID: 'Ya existe un cliente del mismo país con este NIT; puede tratarse de otro establecimiento del mismo cliente.',
  POSSIBLE_DUPLICATE: 'Existe un cliente parecido; revise que no sea el mismo.',
  CUSTOMER_CODE_TAKEN: 'Ya existe un cliente con este código de cliente.',
  DUPLICATE_BLOCKED: 'Existe un cliente duplicado y la regla de duplicidad impide crearlo.',
  IMPORT_INTERRUPTED: 'La importación se interrumpió antes de procesar esta fila.',
  CREATE_FAILED: 'No se pudo crear el cliente por un error inesperado.',
  REQUIRED_FIELD_MISSING: 'El campo es obligatorio.',
  INVALID_COUNTRY: 'El país no existe o no está activo.',
  INVALID_SALES_OWNER: 'El responsable comercial no es un usuario activo que se pueda asignar.',
  INVALID_PHONE_FORMAT: 'El teléfono no tiene un formato válido para el país.',
  INVALID_TAX_ID_FORMAT: 'El NIT no tiene un formato válido para el país.',
  INVALID_CATALOG_VALUE: 'El código no existe en el catálogo, está inactivo o pertenece a otro catálogo.',
  VALIDATION_FAILED: 'El valor no tiene un formato válido.',
  FIELD_NOT_EDITABLE: 'No tiene permiso para asignar este valor.',
};

export function issueMessage(code: string): string {
  return MESSAGES[code] ?? 'El valor no es válido.';
}

export function importIssue(field: string, code: string, severity: IssueSeverity = 'ERROR', message = issueMessage(code)): StoredImportIssue {
  return { field, code, message, severity };
}

/** Aviso de NIT repetido entre filas: cita la fila del archivo, nunca el valor (RN-06.14). */
export function taxIdInFileWarning(otherFileRow: number): StoredImportIssue {
  return importIssue(
    'taxId',
    IMPORT_ISSUE_CODES.duplicateTaxId,
    'WARNING',
    `El NIT se repite en la fila ${otherFileRow} del archivo; puede tratarse de otro establecimiento del mismo cliente.`,
  );
}

export function codeInFileError(otherFileRow: number): StoredImportIssue {
  return importIssue('customerCode', IMPORT_ISSUE_CODES.duplicateInFile, 'ERROR', `El código de cliente se repite en la fila ${otherFileRow} del archivo.`);
}

export function legalNameInFileWarning(otherFileRow: number): StoredImportIssue {
  return importIssue(
    'legalName',
    IMPORT_ISSUE_CODES.possibleDuplicateInFile,
    'WARNING',
    `La razón social se parece a la de la fila ${otherFileRow} del archivo.`,
  );
}

/** Lo público de una incidencia guardada (sin `candidateIds`). */
export function publicIssue(issue: StoredImportIssue): ImportIssue {
  return { field: issue.field, code: issue.code, message: issue.message, severity: issue.severity };
}

/** Lee el JSON de `errors` sin confiar en su forma (filas antiguas o editadas por fuera). */
export function parseStoredIssues(value: unknown): StoredImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): StoredImportIssue[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record['field'] !== 'string' || typeof record['code'] !== 'string') return [];
    const ids = Array.isArray(record['candidateIds']) ? record['candidateIds'].filter((id): id is string => typeof id === 'string') : undefined;
    return [
      {
        field: record['field'],
        code: record['code'],
        message: typeof record['message'] === 'string' ? record['message'] : issueMessage(record['code']),
        severity: record['severity'] === 'WARNING' ? 'WARNING' : 'ERROR',
        ...(ids && ids.length > 0 ? { candidateIds: ids } : {}),
      },
    ];
  });
}
