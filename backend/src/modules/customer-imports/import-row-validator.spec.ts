import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import {
  type CustomerDraft,
  CustomerReferenceCache,
  type CustomerValidationService,
  type ValidationOutcome,
} from '@/modules/customers/customer-validation.service';

import type { ParsedImportFile } from './import-file-reader';
import { ImportRowValidator } from './import-row-validator';
import { IMPORT_COLUMNS, type ImportColumnKey } from './import-template';

const ACTOR: CustomerActor = {
  userId: 'user-1',
  permissions: new Set(['clientes.crear']),
  audit: { correlationId: 'c-1', actorId: 'user-1', actorEmail: null, ipAddress: null },
};

const INDEXES = new Map<ImportColumnKey, number>(IMPORT_COLUMNS.map((column, index) => [column.key, index]));

function file(rows: Partial<Record<ImportColumnKey, string>>[]): ParsedImportFile {
  return {
    format: 'CSV',
    columnIndexes: INDEXES,
    rows: rows.map((row, index) => ({
      rowNumber: index + 1,
      cells: IMPORT_COLUMNS.map((column) => ({ kind: 'text' as const, text: row[column.key] ?? '' })),
    })),
  };
}

const OK: ValidationOutcome = { errors: [], duplicates: [], blockingDuplicates: [], codeConflict: null, normalized: null };

function candidate(id: string | null) {
  return { id, crmCode: 'CLI-1', customerCode: null, legalName: 'X', country: { isoCode: 'GT', name: 'Guatemala' }, salesOwnerName: 'Y', isVisible: id !== null, isDeleted: false };
}

describe('ImportRowValidator (06 RN-06.12–RN-06.18)', () => {
  let outcomes: Map<string, ValidationOutcome>;
  let validation: { prepare: jest.Mock; validate: jest.Mock; duplicateKeys: jest.Mock };
  let validator: ImportRowValidator;

  beforeEach(() => {
    outcomes = new Map();
    validation = {
      prepare: jest.fn().mockResolvedValue({ codeUniqueness: 'PAIS', duplicateRules: {} }),
      validate: jest.fn(async (draft: CustomerDraft) => outcomes.get(draft.legalName ?? '') ?? OK),
      duplicateKeys: jest.fn(async (draft: CustomerDraft) => ({
        customerCode: draft.customerCode ? `${draft.country}|${draft.customerCode.toUpperCase()}` : null,
        taxId: draft.taxId ? `${draft.country}|${draft.taxId}` : null,
        legalName: null,
      })),
    };
    validator = new ImportRowValidator(validation as unknown as CustomerValidationService);
  });

  it('prepara el contexto una sola vez y valida cada fila en modo BY_NATURAL_KEY con los valores leídos', async () => {
    await validator.validate(file([{ legalName: 'A', country: 'GT' }, { legalName: 'B', country: 'SV' }]), ACTOR);
    expect(validation.prepare).toHaveBeenCalledTimes(1);
    expect(validation.validate).toHaveBeenCalledWith(expect.objectContaining({ legalName: 'A', country: 'GT', taxId: null }), {
      mode: 'BY_NATURAL_KEY',
      actor: ACTOR,
      context: { codeUniqueness: 'PAIS', duplicateRules: {} },
      referenceCache: expect.any(CustomerReferenceCache),
    });
    // La misma memoria para todas las filas del archivo.
    expect(validation.validate.mock.calls[0]?.[1].referenceCache).toBe(validation.validate.mock.calls[1]?.[1].referenceCache);
  });

  it('copia los códigos del Módulo 2 con el campo de la plantilla y mensajes en español', async () => {
    outcomes.set('A', { ...OK, errors: [{ field: 'countryId', code: 'INVALID_COUNTRY', message: 'The country does not exist or is inactive' }] });
    const [row] = await validator.validate(file([{ legalName: 'A', country: 'NI' }]), ACTOR);
    expect(row).toMatchObject({
      status: 'INVALID',
      issues: [{ field: 'country', code: 'INVALID_COUNTRY', message: 'El país no existe o no está activo.', severity: 'ERROR' }],
    });
  });

  it('una incidencia de celda sustituye a la del Módulo 2 sobre el mismo campo', async () => {
    outcomes.set('A', { ...OK, errors: [{ field: 'phone', code: 'VALIDATION_FAILED', message: 'm', maxLength: 40 }] });
    const [row] = await validator.validate(file([{ legalName: 'A', phone: '9'.repeat(41) }]), ACTOR);
    expect(row?.issues.map((issue) => issue.code)).toEqual(['MAX_LENGTH']);
  });

  it('todas las filas con el mismo código en el archivo quedan DUPLICATE_IN_FILE apuntando a otra fila (D-06.5)', async () => {
    const rows = await validator.validate(
      file([
        { legalName: 'A', country: 'GT', customerCode: 'ab1' },
        { legalName: 'B', country: 'GT', customerCode: 'AB1' },
        { legalName: 'C', country: 'SV', customerCode: 'AB1' },
      ]),
      ACTOR,
    );
    expect(rows.map((row) => [row.status, row.duplicateOfRowNumber])).toEqual([
      ['DUPLICATE_IN_FILE', 2],
      ['DUPLICATE_IN_FILE', 1],
      ['VALID', null],
    ]);
    expect(rows[0]?.issues[0]).toMatchObject({ field: 'customerCode', code: 'DUPLICATE_IN_FILE', message: 'El código de cliente se repite en la fila 3 del archivo.' });
  });

  it('el NIT repetido entre filas es una advertencia que cita la fila del archivo, no un rechazo (DM-4)', async () => {
    const rows = await validator.validate(
      file([
        { legalName: 'A', country: 'GT', taxId: '123' },
        { legalName: 'B', country: 'GT', taxId: '123' },
      ]),
      ACTOR,
    );
    expect(rows.map((row) => row.status)).toEqual(['VALID', 'VALID']);
    expect(rows[1]?.issues).toEqual([
      expect.objectContaining({ field: 'taxId', code: 'DUPLICATE_TAX_ID', severity: 'WARNING', message: expect.stringContaining('fila 2 del archivo') }),
    ]);
    expect(rows[1]?.issues[0]?.message).not.toContain('123');
  });

  it('código ocupado → DUPLICATE_EXISTING con el cliente si es visible; BLOQUEAR → DUPLICATE_BLOCKED', async () => {
    outcomes.set('A', { ...OK, codeConflict: { customerId: 'cust-1', crmCode: 'CLI-9', isDeleted: true } });
    outcomes.set('B', { ...OK, blockingDuplicates: [{ rule: 'correo', reason: 'EMAIL', candidate: candidate(null) }] });
    const [first, second] = await validator.validate(file([{ legalName: 'A' }, { legalName: 'B' }]), ACTOR);
    expect(first).toMatchObject({ status: 'DUPLICATE_EXISTING', duplicateOfCustomerId: 'cust-1', issues: [{ code: 'CUSTOMER_CODE_TAKEN' }] });
    expect(second).toMatchObject({ status: 'DUPLICATE_EXISTING', duplicateOfCustomerId: null, issues: [{ field: 'email', code: 'DUPLICATE_BLOCKED' }] });
  });

  it('los avisos del Módulo 2 son advertencias en una fila VALID y guardan los ids visibles para la confirmación', async () => {
    outcomes.set('A', {
      ...OK,
      duplicates: [
        { rule: 'nit', reason: 'TAX_ID', candidate: candidate('cust-1') },
        { rule: 'nit', reason: 'TAX_ID', candidate: candidate(null) },
        { rule: 'razonSocialNormalizada', reason: 'LEGAL_NAME', candidate: candidate('cust-2') },
      ],
    });
    const [row] = await validator.validate(file([{ legalName: 'A' }]), ACTOR);
    expect(row?.status).toBe('VALID');
    expect(row?.issues).toEqual([
      expect.objectContaining({ field: 'taxId', code: 'DUPLICATE_TAX_ID', severity: 'WARNING', candidateIds: ['cust-1'] }),
      expect.objectContaining({ field: 'legalName', code: 'POSSIBLE_DUPLICATE', severity: 'WARNING', candidateIds: ['cust-2'] }),
    ]);
  });
});
