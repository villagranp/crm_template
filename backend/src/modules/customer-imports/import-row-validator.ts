import { Injectable } from '@nestjs/common';

import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import {
  CustomerReferenceCache,
  CustomerValidationService,
  type DuplicateCandidate,
  type ValidationOutcome,
} from '@/modules/customers/customer-validation.service';

import { sanitizeRow, toCustomerDraft } from './cell-sanitizer';
import type { ParsedImportFile } from './import-file-reader';
import {
  codeInFileError,
  IMPORT_ISSUE_CODES,
  importFieldOf,
  importIssue,
  legalNameInFileWarning,
  type StoredImportIssue,
  taxIdInFileWarning,
} from './import-issues';
import { findInFileDuplicates, type RowDuplicateKeys } from './in-file-duplicates';
import type { NewImportRow } from './ports/customer-imports.repository.port';

/** Filas validadas a la vez contra el Módulo 2 (cada validación hace varias consultas). */
const VALIDATION_CONCURRENCY = 8;

/** Campo de la plantilla de cada motivo de duplicado blando del Módulo 2 (02 F.3 `reason`). */
const FIELD_BY_REASON: Readonly<Record<string, string>> = {
  LEGAL_NAME: 'legalName',
  TRADE_NAME: 'tradeName',
  EMAIL: 'email',
  PHONE: 'phone',
  TAX_ID: 'taxId',
};

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** "Fila del archivo" que ve el usuario en Excel (RN-06.28). */
export function fileRowNumber(rowNumber: number): number {
  return rowNumber + 1;
}

/**
 * Advertencias de duplicado blando del Módulo 2 (RN-06.18): `DUPLICATE_TAX_ID` si
 * el motivo es el NIT, `POSSIBLE_DUPLICATE` en el resto. Una por campo, con los
 * ids visibles de los clientes avisados (para la confirmación, D-06.6).
 */
export function duplicateWarnings(
  duplicates: readonly Pick<DuplicateCandidate, 'reason'>[] & readonly { readonly candidate: { readonly id: string | null } }[],
): StoredImportIssue[] {
  const byField = new Map<string, { code: string; ids: Set<string> }>();
  for (const match of duplicates) {
    const field = FIELD_BY_REASON[match.reason] ?? 'legalName';
    const code = match.reason === 'TAX_ID' ? IMPORT_ISSUE_CODES.duplicateTaxId : IMPORT_ISSUE_CODES.possibleDuplicate;
    const entry = byField.get(field) ?? { code, ids: new Set<string>() };
    if (match.candidate.id) entry.ids.add(match.candidate.id);
    byField.set(field, entry);
  }
  return [...byField.entries()].map(([field, entry]) => ({
    ...importIssue(field, entry.code, 'WARNING'),
    ...(entry.ids.size > 0 ? { candidateIds: [...entry.ids] } : {}),
  }));
}

/**
 * Validación de las filas (06 RN-06.12–RN-06.18) con el servicio del Módulo 2 en
 * modo `BY_NATURAL_KEY`, **sin** reimplementar ninguna regla de cliente: este
 * archivo solo traduce el resultado a estado e incidencias de fila y añade las
 * reglas propias del archivo (celdas y duplicados entre filas).
 */
@Injectable()
export class ImportRowValidator {
  constructor(private readonly validation: CustomerValidationService) {}

  async validate(file: ParsedImportFile, actor: CustomerActor): Promise<NewImportRow[]> {
    // Parámetros, alcances y responsables asignables: una sola lectura para toda la carga.
    const context = await this.validation.prepare({ customerCode: 'X', salesOwner: null }, { mode: 'BY_NATURAL_KEY', actor });
    // Países, catálogos y responsables se repiten en miles de filas: se leen una vez por archivo (PF-06.44).
    const referenceCache = new CustomerReferenceCache();

    const sanitized = file.rows.map((row) => ({ rowNumber: row.rowNumber, ...sanitizeRow(row.cells, file.columnIndexes) }));
    const results = await mapWithConcurrency(sanitized, VALIDATION_CONCURRENCY, async (row) => {
      const draft = toCustomerDraft(row.values);
      const [keys, outcome] = await Promise.all([
        this.validation.duplicateKeys(draft, context),
        this.validation.validate(draft, { mode: 'BY_NATURAL_KEY', actor, context, referenceCache, lenientPhone: true }),
      ]);
      return { row, keys: { rowNumber: row.rowNumber, ...keys } satisfies RowDuplicateKeys, outcome };
    });

    const inFile = findInFileDuplicates(results.map((result) => result.keys));
    return results.map(({ row, outcome }) =>
      this.toNewRow(row, outcome, {
        code: inFile.codeDuplicateOf.get(row.rowNumber),
        taxId: inFile.taxIdDuplicateOf.get(row.rowNumber),
        legalName: inFile.legalNameDuplicateOf.get(row.rowNumber),
      }),
    );
  }

  private toNewRow(
    row: { rowNumber: number; values: NewImportRow['values']; issues: readonly StoredImportIssue[] },
    outcome: ValidationOutcome,
    inFile: { code: number | undefined; taxId: number | undefined; legalName: number | undefined },
  ): NewImportRow {
    // Una incidencia de celda (fórmula, tipo, longitud) sustituye a las del Módulo 2 sobre el mismo campo.
    const cellFields = new Set(row.issues.map((issue) => issue.field));
    const customerIssues = outcome.errors
      .map((error) => importIssue(importFieldOf(error.field), error.code))
      .filter((issue) => !cellFields.has(issue.field));
    const issues: StoredImportIssue[] = [...row.issues, ...customerIssues];
    const warnings: StoredImportIssue[] = [...duplicateWarnings(outcome.duplicates)];
    // Teléfono con formato inválido para el país: pasa, pero se avisa (ADR-029).
    if (outcome.phoneFormatWarning) warnings.push(importIssue('phone', IMPORT_ISSUE_CODES.invalidPhoneFormat, 'WARNING'));
    // El NIT repetido frente a un existente y frente a otra fila son dos avisos distintos: se listan ambos.
    if (inFile.taxId !== undefined) warnings.push(taxIdInFileWarning(fileRowNumber(inFile.taxId)));
    if (inFile.legalName !== undefined) warnings.push(legalNameInFileWarning(fileRowNumber(inFile.legalName)));

    const base = { rowNumber: row.rowNumber, values: row.values, duplicateOfRowNumber: null, duplicateOfCustomerId: null };
    if (inFile.code !== undefined) {
      return {
        ...base,
        status: 'DUPLICATE_IN_FILE',
        duplicateOfRowNumber: inFile.code,
        issues: [codeInFileError(fileRowNumber(inFile.code)), ...issues, ...warnings],
      };
    }
    if (outcome.codeConflict) {
      return {
        ...base,
        status: 'DUPLICATE_EXISTING',
        duplicateOfCustomerId: outcome.codeConflict.customerId,
        issues: [importIssue('customerCode', IMPORT_ISSUE_CODES.customerCodeTaken), ...issues, ...warnings],
      };
    }
    if (outcome.blockingDuplicates.length > 0) {
      const visible = outcome.blockingDuplicates.find((match) => match.candidate.id !== null);
      return {
        ...base,
        status: 'DUPLICATE_EXISTING',
        duplicateOfCustomerId: visible?.candidate.id ?? null,
        issues: [importIssue(FIELD_BY_REASON[outcome.blockingDuplicates[0]?.reason ?? ''] ?? 'legalName', IMPORT_ISSUE_CODES.duplicateBlocked), ...issues, ...warnings],
      };
    }
    if (issues.length > 0) return { ...base, status: 'INVALID', issues: [...issues, ...warnings] };
    return { ...base, status: 'VALID', issues: warnings };
  }
}
