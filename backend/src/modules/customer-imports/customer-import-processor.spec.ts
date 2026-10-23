import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { ContactsService } from '@/modules/customers/contacts.service';
import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';
import type { CustomerCreationContext, CustomerCreationService } from '@/modules/customers/customer-creation.service';

import { CustomerImportProcessor, EXTRA_EMAIL_CONTACT_FIRST_NAME, HEARTBEAT_EVERY_ROWS } from './customer-import-processor';
import type { ImportRowValues } from './cell-sanitizer';
import type { StoredImportIssue } from './import-issues';
import type { CustomerImportsRepository, PendingImportRow } from './ports/customer-imports.repository.port';

const TX = {} as TransactionContext;
const ACTOR: CustomerActor = {
  userId: 'confirmer',
  permissions: new Set(['clientes.crear']),
  audit: { correlationId: 'corr-1', actorId: 'confirmer', actorEmail: null, ipAddress: null },
};

function values(legalName: string): ImportRowValues {
  return {
    customerCode: null, legalName, tradeName: null, country: 'GT', city: null, address: null, phone: null,
    email: null, companyType: null, status: null, rating: null, salesOwner: null, taxId: null,
  };
}

function pending(rowNumber: number, issues: StoredImportIssue[] = []): PendingImportRow {
  return { id: `row-${rowNumber}`, rowNumber, values: values(`Cliente ${rowNumber}`), issues };
}

const WARNING: StoredImportIssue = { field: 'taxId', code: 'DUPLICATE_TAX_ID', message: 'm', severity: 'WARNING', candidateIds: ['seen-1'] };

describe('CustomerImportProcessor (06 RN-06.18, RN-06.21–RN-06.25)', () => {
  let rows: PendingImportRow[];
  let repository: Record<'listPendingRows' | 'markRowImported' | 'markRowRejected' | 'touch' | 'complete' | 'findById' | 'failStale', jest.Mock>;
  let creation: { create: jest.Mock };
  let contacts: { create: jest.Mock };
  let audit: { record: jest.Mock };
  let logger: { info: jest.Mock; error: jest.Mock; warn: jest.Mock };
  let processor: CustomerImportProcessor;
  let created = 0;

  const options = (includeRowsWithWarnings = false) => ({ importId: 'imp-1', importCode: 'IMP-2026-0001', actor: ACTOR, includeRowsWithWarnings });

  beforeEach(() => {
    created = 0;
    rows = [pending(1), pending(2)];
    repository = {
      listPendingRows: jest.fn(async () => rows),
      markRowImported: jest.fn().mockResolvedValue(true),
      markRowRejected: jest.fn().mockResolvedValue(true),
      touch: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue('COMPLETED'),
      findById: jest.fn().mockResolvedValue({ status: 'COMPLETED', totalRows: 2, validRows: 2, invalidRows: 0, importedRows: 2, stats: { rejectedRows: 0 } }),
      failStale: jest.fn().mockResolvedValue(['imp-1']),
    };
    creation = {
      create: jest.fn(async (_draft: unknown, context: CustomerCreationContext) => {
        created += 1;
        const id = `cust-${created}`;
        await context.withinTransaction?.(id, TX);
        return { id };
      }),
    };
    contacts = { create: jest.fn().mockResolvedValue({ id: 'contact-1' }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    processor = new CustomerImportProcessor(
      repository as unknown as CustomerImportsRepository,
      creation as unknown as CustomerCreationService,
      audit as unknown as AuditService,
      logger as unknown as AppLogger,
      contacts as unknown as ContactsService,
    );
  });

  it('crea cada fila con el alta del Módulo 2 (IMPORT, confirmador, rowNumber) y la marca IMPORTED en la misma transacción', async () => {
    await processor.run(options());

    expect(creation.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ legalName: 'Cliente 1' }), expect.objectContaining({
      actor: ACTOR,
      mode: 'BY_NATURAL_KEY',
      source: 'IMPORT',
      lenientPhone: true,
      sourceImportId: 'imp-1',
      auditMetadata: { rowNumber: 1 },
    }));
    expect(creation.create.mock.calls[0]?.[1]).not.toHaveProperty('acknowledgedDuplicateIds');
    expect(repository.markRowImported).toHaveBeenNthCalledWith(1, 'row-1', 'cust-1', TX);
    expect(repository.complete).toHaveBeenCalledWith('imp-1');
    expect(audit.record).toHaveBeenCalledWith('crm.customer_import.completed', ACTOR.audit, expect.objectContaining({ resourceId: 'imp-1' }));
  });

  it('sin la marca, las filas con advertencias se rechazan con su código sin intentar el alta', async () => {
    rows = [pending(1, [WARNING])];
    await processor.run(options(false));
    expect(creation.create).not.toHaveBeenCalled();
    expect(repository.markRowRejected).toHaveBeenCalledWith('row-1', [{ ...WARNING, severity: 'ERROR' }], null);
  });

  it('con la marca, reconoce los candidatos vistos y los clientes creados por la misma carga (PF-06.52)', async () => {
    rows = [pending(1), pending(2, [WARNING])];
    await processor.run(options(true));
    expect(creation.create.mock.calls[1]?.[1]).toMatchObject({ acknowledgedDuplicateIds: ['seen-1', 'cust-1'] });
  });

  it('un error de dominio rechaza solo esa fila con los códigos del Módulo 2 y el campo de la plantilla', async () => {
    creation.create.mockRejectedValueOnce(
      new BusinessRuleViolationError('INVALID_CATALOG_VALUE', 'm', [{ field: 'companyTypeId', code: 'INVALID_CATALOG_VALUE', message: 'x' }]),
    );
    await processor.run(options());
    expect(repository.markRowRejected).toHaveBeenCalledWith('row-1', [expect.objectContaining({ field: 'companyType', code: 'INVALID_CATALOG_VALUE', severity: 'ERROR' })], null);
    expect(repository.markRowImported).toHaveBeenCalledWith('row-2', 'cust-1', TX);
  });

  it('CUSTOMER_CODE_TAKEN (carrera con el único) → REJECTED con el cliente existente (RN-06.23)', async () => {
    creation.create.mockRejectedValueOnce(new ResourceConflictError('m', [{ field: 'customerCode', customerId: 'holder-1' }], 'CUSTOMER_CODE_TAKEN'));
    await processor.run(options());
    expect(repository.markRowRejected).toHaveBeenCalledWith('row-1', [expect.objectContaining({ code: 'CUSTOMER_CODE_TAKEN' })], 'holder-1');
  });

  it('un aviso nuevo no reconocido → REJECTED con DUPLICATE_TAX_ID si el motivo es el NIT', async () => {
    creation.create.mockRejectedValueOnce(new ResourceConflictError('m', [{ rule: 'nit', reason: 'TAX_ID', candidate: { id: 'other' } }], 'POSSIBLE_DUPLICATE'));
    await processor.run(options());
    expect(repository.markRowRejected).toHaveBeenCalledWith('row-1', [expect.objectContaining({ field: 'taxId', code: 'DUPLICATE_TAX_ID', severity: 'ERROR' })], null);
  });

  it('un error inesperado → CREATE_FAILED, registrado con correlation ID y sin valores', async () => {
    creation.create.mockRejectedValueOnce(new Error('boom con Cliente 1'));
    await processor.run(options());
    expect(repository.markRowRejected).toHaveBeenCalledWith('row-1', [expect.objectContaining({ field: 'row', code: 'CREATE_FAILED' })], null);
    expect(logger.error).toHaveBeenCalledWith('customer_import_row_failed', { correlationId: 'corr-1', importId: 'imp-1', rowNumber: 1, errorName: 'Error' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Cliente 1');
  });

  it('si la fila dejó de estar VALID (carga interrumpida), el alta se deshace y la fila no se toca', async () => {
    repository.markRowImported.mockResolvedValueOnce(false);
    await processor.run(options());
    expect(repository.markRowRejected).not.toHaveBeenCalled();
  });

  it(`emite la señal de vida cada ${HEARTBEAT_EVERY_ROWS} filas`, async () => {
    rows = Array.from({ length: HEARTBEAT_EVERY_ROWS * 2 + 1 }, (_value, index) => pending(index + 1));
    await processor.run(options());
    expect(repository.touch).toHaveBeenCalledTimes(2);
  });

  it('un fallo que impide continuar marca la carga FAILED con sus filas pendientes rechazadas', async () => {
    repository.listPendingRows.mockRejectedValueOnce(new Error('db down'));
    await processor.run(options());
    expect(repository.failStale).toHaveBeenCalledWith({ staleBefore: expect.any(Date), importId: 'imp-1' }, expect.objectContaining({ code: 'IMPORT_INTERRUPTED' }));
    expect(audit.record).toHaveBeenCalledWith('crm.customer_import.failed', ACTOR.audit, expect.objectContaining({ metadata: { code: 'IMP-2026-0001', failureReason: 'PROCESS_INTERRUPTED' } }));
  });

  it('start() no espera y whenIdle() espera a que termine', async () => {
    processor.start(options());
    expect(repository.complete).not.toHaveBeenCalled();
    await processor.whenIdle();
    expect(repository.complete).toHaveBeenCalled();
  });
  describe('correos adicionales de la celda «Correo» (ADR-028)', () => {
    const withEmails = (email: string): PendingImportRow => ({ ...pending(1), values: { ...values('Cliente 1'), email } });

    it('crea el cliente con el primer correo y los demás como contactos, sin repetir', async () => {
      rows = [withEmails('uno@ejemplo.com, dos@ejemplo.com; DOS@ejemplo.com ,tres@ejemplo.com')];

      await processor.run(options());

      expect(creation.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'uno@ejemplo.com' }), expect.anything());
      expect(contacts.create).toHaveBeenCalledTimes(2);
      expect(contacts.create).toHaveBeenNthCalledWith(1, ACTOR, 'cust-1', expect.objectContaining({
        firstName: EXTRA_EMAIL_CONTACT_FIRST_NAME,
        lastName: 'dos',
        email: 'dos@ejemplo.com',
        comments: 'Correo adicional de la carga IMP-2026-0001',
      }));
      expect(contacts.create).toHaveBeenNthCalledWith(2, ACTOR, 'cust-1', expect.objectContaining({ email: 'tres@ejemplo.com' }));
      expect(repository.markRowRejected).not.toHaveBeenCalled();
    });

    it('no crea contactos con un solo correo', async () => {
      rows = [withEmails('uno@ejemplo.com')];
      await processor.run(options());
      expect(contacts.create).not.toHaveBeenCalled();
    });

    it('un contacto que falla o un correo adicional inválido no rechazan la fila: se cuentan en el registro', async () => {
      rows = [withEmails('uno@ejemplo.com, dos@ejemplo.com, no-es-correo')];
      contacts.create.mockRejectedValueOnce(new Error('sin permiso'));

      await processor.run(options());

      expect(repository.markRowRejected).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('customer_import_email_contacts', expect.objectContaining({ rowNumber: 1, created: 0, failed: 2 }));
    });
  });
});
