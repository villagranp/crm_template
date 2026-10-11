import {
  AccessDeniedError,
  BusinessRuleViolationError,
  ResourceConflictError,
} from '@/common/errors/application-error';
import type { SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import type { CustomerActorResolver } from './customer-actor.resolver';
import { customerAuditState } from './customer-audit';
import { type CustomerCreationContext, CustomerCreationService } from './customer-creation.service';
import type { CustomerDraft, CustomerValidationService, NormalizedCustomer, ValidationOutcome } from './customer-validation.service';
import { CustomerCodeConflictError, type CustomersRepository } from './ports/customers.repository.port';
import { AUDIT, makeActor, makeCountry, makeCustomer, makeVisibility, TX } from './testing/customer-fixtures';

const NORMALIZED: NormalizedCustomer = {
  customerCode: 'AB-12',
  customerCodeNormalized: 'AB12',
  legalName: 'Constructora Peña S.A.',
  legalNameNormalized: 'constructora pena s.a.',
  tradeName: null,
  taxId: null,
  taxIdNormalized: null,
  countryId: 'country-gt',
  city: null,
  address: null,
  phone: null,
  email: null,
  companyTypeId: null,
  statusId: 'status-active',
  ratingId: null,
  salesOwnerId: 'user-1',
};

const DRAFT: CustomerDraft = { customerCode: 'AB-12', legalName: 'Constructora Peña S.A.', country: 'country-gt', status: 'status-active' };

function outcome(overrides: Partial<ValidationOutcome> = {}): ValidationOutcome {
  return { errors: [], duplicates: [], blockingDuplicates: [], codeConflict: null, normalized: NORMALIZED, ...overrides };
}

describe('CustomerCreationService', () => {
  const created = makeCustomer({ id: 'customer-new', crmCode: 'CLI-000123' });
  let repository: {
    lockCustomerCode: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    findCountry: jest.Mock;
    findCustomerCodeHolder: jest.Mock;
  };
  let transactions: { run: jest.Mock };
  let sequences: { next: jest.Mock };
  let validation: { codeUniqueness: jest.Mock; validate: jest.Mock };
  let actors: { visibility: jest.Mock };
  let audit: { record: jest.Mock };
  let service: CustomerCreationService;

  const ownActor = makeActor(['clientes.ver', 'clientes.crear']);
  const uiContext = (overrides: Partial<CustomerCreationContext> = {}): CustomerCreationContext => ({
    actor: ownActor,
    mode: 'BY_ID',
    source: 'UI',
    ...overrides,
  });

  beforeEach(() => {
    repository = {
      lockCustomerCode: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue('customer-new'),
      findById: jest.fn().mockResolvedValue(created),
      findCountry: jest.fn().mockResolvedValue(makeCountry()),
      findCustomerCodeHolder: jest.fn().mockResolvedValue(null),
    };
    transactions = { run: jest.fn((work: (tx: TransactionContext) => Promise<unknown>) => work(TX)) };
    sequences = { next: jest.fn().mockResolvedValue('CLI-000123') };
    validation = { codeUniqueness: jest.fn().mockResolvedValue('PAIS'), validate: jest.fn().mockResolvedValue(outcome()) };
    actors = { visibility: jest.fn().mockResolvedValue(makeVisibility()) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new CustomerCreationService(
      repository as unknown as CustomersRepository,
      transactions as unknown as TransactionRunner,
      sequences as unknown as SequenceGenerator,
      validation as unknown as CustomerValidationService,
      actors as unknown as CustomerActorResolver,
      audit as unknown as AuditService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger,
    );
  });

  describe('responsable propuesto (RN-02.11)', () => {
    it('rechaza con 403 FIELD_NOT_EDITABLE otro responsable sin clientes.administrar', async () => {
      const error = await service.create({ ...DRAFT, salesOwner: 'user-2' }, uiContext()).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AccessDeniedError);
      expect(error).toMatchObject({
        code: 'FIELD_NOT_EDITABLE',
        details: [{ field: 'salesOwnerId', requiredPermission: 'clientes.administrar' }],
      });
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('admite al propio actor como responsable', async () => {
      await expect(service.create({ ...DRAFT, salesOwner: ' user-1 ' }, uiContext())).resolves.toBe(created);
    });

    it('admite otro responsable con clientes.administrar', async () => {
      const admin = makeActor(['clientes.crear', 'clientes.administrar']);

      await expect(service.create({ ...DRAFT, salesOwner: 'user-2' }, uiContext({ actor: admin }))).resolves.toBe(created);
    });

    it('en importación deja la decisión a la elegibilidad del validador', async () => {
      await service.create({ ...DRAFT, salesOwner: 'EMP-02' }, uiContext({ mode: 'BY_NATURAL_KEY', source: 'IMPORT' }));

      expect(validation.validate).toHaveBeenCalled();
    });
  });

  describe('bloqueo consultivo por código (RN-02.13)', () => {
    it('bloquea el código normalizado antes de validar con GLOBAL', async () => {
      validation.codeUniqueness.mockResolvedValue('GLOBAL');

      await service.create({ ...DRAFT, customerCode: ' ab-12 ' }, uiContext());

      expect(repository.lockCustomerCode).toHaveBeenCalledWith('AB12', TX);
      expect(repository.lockCustomerCode.mock.invocationCallOrder[0]).toBeLessThan(validation.validate.mock.invocationCallOrder[0] ?? 0);
    });

    it('no bloquea con PAIS', async () => {
      await service.create(DRAFT, uiContext());

      expect(repository.lockCustomerCode).not.toHaveBeenCalled();
    });

    it('no bloquea ni lee la unicidad sin código', async () => {
      validation.codeUniqueness.mockResolvedValue('GLOBAL');

      await service.create({ ...DRAFT, customerCode: '  ' }, uiContext());

      expect(validation.codeUniqueness).not.toHaveBeenCalled();
      expect(repository.lockCustomerCode).not.toHaveBeenCalled();
    });
  });

  describe('alta', () => {
    it('valida dentro de la transacción y pide el folio después', async () => {
      await service.create(DRAFT, uiContext());

      expect(validation.validate).toHaveBeenCalledWith(DRAFT, { mode: 'BY_ID', actor: ownActor, tx: TX });
      expect(sequences.next).toHaveBeenCalledWith('crm.cliente', TX);
      expect(validation.validate.mock.invocationCallOrder[0]).toBeLessThan(sequences.next.mock.invocationCallOrder[0] ?? 0);
    });

    it('inserta los valores normalizados con folio, autor y sin importación', async () => {
      await service.create(DRAFT, uiContext());

      expect(repository.create).toHaveBeenCalledWith(
        { ...NORMALIZED, crmCode: 'CLI-000123', sourceImportId: null, createdById: 'user-1' },
        TX,
      );
    });

    it('registra crm.customer.created con metadata.source UI', async () => {
      await service.create(DRAFT, uiContext());

      expect(audit.record).toHaveBeenCalledWith('crm.customer.created', AUDIT, {
        resourceType: 'crm.customer',
        resourceId: 'customer-new',
        before: null,
        after: customerAuditState(created),
        metadata: { source: 'UI', crmCode: 'CLI-000123', sourceImportId: null },
      });
    });

    it('en importación guarda la importación de origen y audita con su contexto', async () => {
      const importAudit: AuditContext = { correlationId: 'import-7', actorId: 'user-1', actorEmail: null, ipAddress: null };

      await service.create(DRAFT, uiContext({ mode: 'BY_NATURAL_KEY', source: 'IMPORT', sourceImportId: 'import-1', audit: importAudit }));

      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceImportId: 'import-1' }), TX);
      expect(audit.record).toHaveBeenCalledWith(
        'crm.customer.created',
        importAudit,
        expect.objectContaining({ metadata: { source: 'IMPORT', crmCode: 'CLI-000123', sourceImportId: 'import-1' } }),
      );
    });
  });

  describe('resultado de la validación', () => {
    it('propaga 422 con todas las incidencias sin consumir folio', async () => {
      validation.validate.mockResolvedValue(
        outcome({
          normalized: null,
          errors: [
            { field: 'legalName', code: 'REQUIRED_FIELD_MISSING', message: 'm' },
            { field: 'countryId', code: 'INVALID_COUNTRY', message: 'm' },
          ],
        }),
      );

      const error = await service.create(DRAFT, uiContext()).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error).toMatchObject({ code: 'REQUIRED_FIELD_MISSING', details: [{ field: 'legalName' }, { field: 'countryId' }] });
      expect(sequences.next).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('propaga 409 CUSTOMER_CODE_TAKEN sin consumir folio', async () => {
      validation.validate.mockResolvedValue(outcome({ codeConflict: { customerId: null, crmCode: 'CLI-000009', isDeleted: true } }));

      await expect(service.create(DRAFT, uiContext())).rejects.toMatchObject({
        code: 'CUSTOMER_CODE_TAKEN',
        details: [{ field: 'customerCode', customerId: null, crmCode: 'CLI-000009', isDeleted: true }],
      });
      expect(sequences.next).not.toHaveBeenCalled();
    });

    it('exige confirmar los avisos de duplicado y crea al confirmarlos', async () => {
      const view = {
        id: 'customer-9',
        crmCode: 'CLI-000009',
        customerCode: null,
        legalName: 'Constructora Peña S.A.',
        country: { isoCode: 'GT', name: 'Guatemala' },
        salesOwnerName: 'Otro',
        isVisible: true,
        isDeleted: false,
      };
      validation.validate.mockResolvedValue(outcome({ duplicates: [{ rule: 'razonSocialNormalizada', reason: 'LEGAL_NAME', candidate: view }] }));

      await expect(service.create(DRAFT, uiContext())).rejects.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });
      expect(sequences.next).not.toHaveBeenCalled();

      await expect(service.create(DRAFT, uiContext({ acknowledgedDuplicateIds: ['customer-9'] }))).resolves.toBe(created);
    });
  });

  describe('carrera con el índice único', () => {
    it('traduce CustomerCodeConflictError a 409 CUSTOMER_CODE_TAKEN con el titular', async () => {
      repository.create.mockRejectedValue(new CustomerCodeConflictError());
      repository.findCustomerCodeHolder.mockResolvedValue({ id: 'customer-9', crmCode: 'CLI-000009', isDeleted: false, isInScope: true });

      const error = await service.create(DRAFT, uiContext()).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({
        code: 'CUSTOMER_CODE_TAKEN',
        details: [{ field: 'customerCode', customerId: 'customer-9', crmCode: 'CLI-000009', isDeleted: false }],
      });
      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith('AB12', { countryId: 'country-gt', excludeCustomerId: null }, makeVisibility());
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('con GLOBAL busca el titular en todos los países', async () => {
      validation.codeUniqueness.mockResolvedValue('GLOBAL');
      repository.create.mockRejectedValue(new CustomerCodeConflictError());

      await expect(service.create(DRAFT, uiContext())).rejects.toMatchObject({ code: 'CUSTOMER_CODE_TAKEN' });
      expect(repository.findCountry).not.toHaveBeenCalled();
      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith('AB12', { countryId: null, excludeCustomerId: null }, expect.anything());
    });
  });
});
