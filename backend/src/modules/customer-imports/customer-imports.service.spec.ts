import { PermissionDeniedError } from '@/common/errors/application-error';
import type { SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CustomerActor, CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';
import type { CustomerValidationService } from '@/modules/customers/customer-validation.service';
import type { CustomersService } from '@/modules/customers/customers.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { CustomerImportProcessor } from './customer-import-processor';
import { CustomerImportsService, sanitizeFileName } from './customer-imports.service';
import type { ImportRowValidator } from './import-row-validator';
import type { CustomerImportDetailRecord, CustomerImportsRepository } from './ports/customer-imports.repository.port';
import { csvFile, pngFile } from './testing/import-fixtures';

const TX = {} as TransactionContext;
const AUTHOR: CustomerActor = {
  userId: 'author',
  permissions: new Set(['importaciones.ver', 'importaciones.crear', 'clientes.crear']),
  audit: { correlationId: 'corr-1', actorId: 'author', actorEmail: null, ipAddress: null },
};

function detail(overrides: Partial<CustomerImportDetailRecord> = {}): CustomerImportDetailRecord {
  return {
    id: 'imp-1', code: 'IMP-2026-0001', format: 'CSV', originalFileName: 'a.csv', status: 'VALIDATED', templateVersion: '1',
    totalRows: 2, validRows: 2, invalidRows: 0, importedRows: 0, failureReason: null,
    startedBy: { id: 'author', displayName: 'Autor' }, validatedAt: new Date(), confirmedBy: null, confirmedAt: null, completedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    stats: { rejectedRows: 0, warningRows: 0, notImportedRows: 0, isPurged: false },
    ...overrides,
  };
}

describe('CustomerImportsService (06 F.1)', () => {
  let params: Record<string, unknown>;
  type RepositoryMethod = 'lockStarter' | 'hasActiveImport' | 'create' | 'saveValidation' | 'fail' | 'findById' | 'failStale' | 'startImporting' | 'cancel' | 'purgeRowData';
  let repository: Record<RepositoryMethod, jest.Mock>;
  let transactions: { run: jest.Mock };
  let sequences: { next: jest.Mock };
  let rowValidator: { validate: jest.Mock };
  let processor: { start: jest.Mock };
  let audit: { record: jest.Mock };
  let scopes: { resolveMany: jest.Mock };
  let service: CustomerImportsService;

  const upload = (buffer: Buffer, originalName = 'clientes.csv', mimeType = 'text/csv') => ({ buffer, originalName, mimeType, size: buffer.length });

  beforeEach(() => {
    params = {
      'crm.importaciones.habilitada': true,
      'crm.importaciones.max_filas': 5000,
      'crm.importaciones.max_mb': 10,
      'crm.importaciones.dias_retencion_filas': 90,
      'crm.zona_horaria_negocio': 'America/Guatemala',
    };
    repository = {
      lockStarter: jest.fn().mockResolvedValue(undefined),
      hasActiveImport: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue('imp-1'),
      saveValidation: jest.fn().mockResolvedValue(true),
      fail: jest.fn().mockResolvedValue(true),
      findById: jest.fn().mockResolvedValue(detail()),
      failStale: jest.fn().mockResolvedValue([]),
      startImporting: jest.fn().mockResolvedValue(true),
      cancel: jest.fn().mockResolvedValue(true),
      purgeRowData: jest.fn().mockResolvedValue(4),
    };
    transactions = { run: jest.fn((work: (tx: TransactionContext) => Promise<unknown>) => work(TX)) };
    sequences = { next: jest.fn().mockResolvedValue('IMP-2026-0001') };
    rowValidator = { validate: jest.fn().mockResolvedValue([{ status: 'VALID' }, { status: 'INVALID' }]) };
    processor = { start: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    scopes = { resolveMany: jest.fn().mockResolvedValue(new Map()) };
    service = new CustomerImportsService(
      repository as unknown as CustomerImportsRepository,
      transactions as unknown as TransactionRunner,
      sequences as unknown as SequenceGenerator,
      { get: jest.fn(async (key: string) => params[key]) } as unknown as ParameterReader,
      scopes as unknown as VisibilityScopeResolver,
      {} as CustomerActorResolver,
      {} as CustomerValidationService,
      {} as CustomersService,
      rowValidator as unknown as ImportRowValidator,
      processor as unknown as CustomerImportProcessor,
      audit as unknown as AuditService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger,
    );
  });

  describe('limits (RN-06.7)', () => {
    it('recorta los parámetros a los topes duros', async () => {
      params['crm.importaciones.max_filas'] = 50_000;
      params['crm.importaciones.max_mb'] = 50;
      await expect(service.limits()).resolves.toEqual({ enabled: true, maxMb: 10, maxBytes: 10 * 1024 * 1024, maxRows: 10_000 });
    });
  });

  describe('upload', () => {
    it('deshabilitada → 409 IMPORTS_DISABLED sin leer ni registrar nada', async () => {
      params['crm.importaciones.habilitada'] = false;
      await expect(service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }])))).rejects.toMatchObject({ code: 'IMPORTS_DISABLED' });
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('tipo no admitido → 415 sin registrar la carga', async () => {
      await expect(service.upload(AUTHOR, upload(pngFile(), 'imagen.csv'))).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('bloquea al usuario, comprueba la carga activa y asigna el código con la zona del negocio en la misma transacción', async () => {
      await service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }]), 'ruta/../clientes.csv'));
      expect(repository.lockStarter).toHaveBeenCalledWith('author', TX);
      expect(repository.hasActiveImport).toHaveBeenCalledWith('author', TX);
      expect(sequences.next).toHaveBeenCalledWith('crm.importacion', TX, { timeZone: 'America/Guatemala' });
      expect(repository.lockStarter.mock.invocationCallOrder[0]).toBeLessThan(repository.hasActiveImport.mock.invocationCallOrder[0] ?? 0);
      expect(repository.create).toHaveBeenCalledWith(
        { code: 'IMP-2026-0001', format: 'CSV', originalFileName: 'ruta_.._clientes.csv', templateVersion: '1', startedById: 'author' },
        TX,
      );
      expect(repository.saveValidation).toHaveBeenCalledWith('imp-1', [{ status: 'VALID' }, { status: 'INVALID' }]);
      expect(audit.record.mock.calls.map((call) => call[0])).toEqual(['crm.customer_import.uploaded', 'crm.customer_import.validated']);
      expect(audit.record.mock.calls[1]?.[2]).toMatchObject({ metadata: { code: 'IMP-2026-0001', totalRows: 2, validRows: 1, invalidRows: 1 } });
    });

    it('con otra carga activa → 409 IMPORT_IN_PROGRESS sin crear la carga', async () => {
      repository.hasActiveImport.mockResolvedValue(true);
      await expect(service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }])))).rejects.toMatchObject({ code: 'IMPORT_IN_PROGRESS' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('estructura inválida → la carga queda FAILED con motivo legible y responde 422 con todos los problemas', async () => {
      const error = await service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }], { headers: ['Razón social', 'Extra'] }))).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'INVALID_IMPORT_FILE', details: expect.arrayContaining([{ field: 'columns', issue: 'UNKNOWN_COLUMN', column: 'Extra' }]) });
      const reason = repository.fail.mock.calls[0]?.[2] as string;
      expect(repository.fail).toHaveBeenCalledWith('imp-1', ['VALIDATING'], expect.stringContaining('MISSING_COLUMN: Nombre comercial'));
      // El encabezado desconocido (texto del usuario) no entra en failureReason.
      expect(reason).not.toContain('Extra');
      expect(rowValidator.validate).not.toHaveBeenCalled();
      expect(audit.record.mock.calls.map((call) => call[0])).toEqual(['crm.customer_import.uploaded', 'crm.customer_import.failed']);
    });

    it('un error inesperado al validar deja la carga FAILED (VALIDATION_ERROR) y se propaga', async () => {
      rowValidator.validate.mockRejectedValue(new Error('db'));
      await expect(service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }])))).rejects.toThrow('db');
      expect(repository.fail).toHaveBeenCalledWith('imp-1', ['VALIDATING'], 'VALIDATION_ERROR');
    });

    it('antes de subir marca interrumpidas las cargas propias sin señal de vida (RN-06.24)', async () => {
      await service.upload(AUTHOR, upload(csvFile([{ legalName: 'A' }])));
      expect(repository.failStale).toHaveBeenCalledWith({ startedById: 'author', staleBefore: expect.any(Date) }, expect.objectContaining({ code: 'IMPORT_INTERRUPTED' }));
    });
  });

  describe('confirm (RN-06.19, RN-06.20)', () => {
    const request = { expectedValidRows: 2, includeRowsWithWarnings: true };

    it('pasa a IMPORTING con el confirmador, audita y lanza el procesamiento sin esperarlo', async () => {
      await service.confirm(AUTHOR, 'imp-1', request);
      expect(repository.startImporting).toHaveBeenCalledWith('imp-1', 'author');
      expect(processor.start).toHaveBeenCalledWith({ importId: 'imp-1', importCode: 'IMP-2026-0001', actor: AUTHOR, includeRowsWithWarnings: true });
      expect(audit.record).toHaveBeenCalledWith('crm.customer_import.confirmed', AUTHOR.audit, expect.objectContaining({ metadata: { code: 'IMP-2026-0001', expectedValidRows: 2, includeRowsWithWarnings: true } }));
    });

    it.each([
      ['no visible (otro usuario sin alcance)', { startedBy: { id: 'other', displayName: 'Otro' } }, { code: 'RESOURCE_NOT_FOUND' }],
      ['ya confirmada', { status: 'IMPORTING' as const }, { code: 'INVALID_IMPORT_STATUS' }],
      ['sin filas válidas', { validRows: 0 }, { code: 'NO_VALID_ROWS' }],
      ['purgada', { stats: { rejectedRows: 0, warningRows: 0, notImportedRows: 0, isPurged: true } }, { code: 'IMPORT_DATA_PURGED' }],
      ['desactualizada', { validRows: 3 }, { code: 'IMPORT_CHANGED', details: [{ field: 'expectedValidRows', validRows: 3 }] }],
    ])('%s → error exacto y sin transición', async (_label, overrides, expected) => {
      repository.findById.mockResolvedValue(detail(overrides));
      await expect(service.confirm(AUTHOR, 'imp-1', request)).rejects.toMatchObject(expected);
      expect(repository.startImporting).not.toHaveBeenCalled();
    });

    it('visible por alcance ORGANIZATION de ver pero sin el de crear → 403', async () => {
      scopes.resolveMany.mockResolvedValue(new Map([['importaciones.ver', { kind: 'ALL' }]]));
      repository.findById.mockResolvedValue(detail({ startedBy: { id: 'other', displayName: 'Otro' } }));
      await expect(service.confirm(AUTHOR, 'imp-1', request)).rejects.toBeInstanceOf(PermissionDeniedError);
    });

    it('si otra petición gana la transición condicional → 409 INVALID_IMPORT_STATUS y no se procesa', async () => {
      repository.startImporting.mockResolvedValue(false);
      await expect(service.confirm(AUTHOR, 'imp-1', request)).rejects.toMatchObject({ code: 'INVALID_IMPORT_STATUS' });
      expect(processor.start).not.toHaveBeenCalled();
    });

    it('deshabilitada → 409 IMPORTS_DISABLED', async () => {
      params['crm.importaciones.habilitada'] = false;
      await expect(service.confirm(AUTHOR, 'imp-1', request)).rejects.toMatchObject({ code: 'IMPORTS_DISABLED' });
    });
  });

  describe('purgeExpiredRowData (RN-06.29)', () => {
    it('purga con el corte de crm.importaciones.dias_retencion_filas', async () => {
      const now = new Date('2026-10-13T00:00:00Z');
      await expect(service.purgeExpiredRowData(now)).resolves.toEqual({ purgedRows: 4, before: new Date('2026-07-15T00:00:00Z') });
      expect(repository.purgeRowData).toHaveBeenCalledWith(new Date('2026-07-15T00:00:00Z'));
    });
  });
});

describe('sanitizeFileName (H.2)', () => {
  it('quita control y separadores de ruta y acota a 255', () => {
    expect(sanitizeFileName('a/b\\c\td.csv')).toBe('a_b_c_d.csv');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(255);
    expect(sanitizeFileName('   ')).toBe('archivo');
  });
});
