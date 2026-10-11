import {
  AccessDeniedError,
  PermissionDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AttachmentsService } from '@/modules/attachments/attachments.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { CatalogDetailRecord, CatalogItemRecord } from '@/modules/catalogs/ports/catalogs.repository.port';

import type { CustomerActorResolver } from './customer-actor.resolver';
import { customerAuditState } from './customer-audit';
import type { CustomerCreationService } from './customer-creation.service';
import type { CustomerValidationService, NormalizedCustomer, ValidationOutcome } from './customer-validation.service';
import type { CustomerVisibilityService } from './customer-visibility.service';
import { CustomersService, type ListCustomersRequest } from './customers.service';
import type { CustomerListRecord, CustomerRecord, CustomersRepository } from './ports/customers.repository.port';
import { AUDIT, CREATED_AT, makeActor, makeCountry, makeCustomer, makeVisibility, makeVisible, TX } from './testing/customer-fixtures';

const EDITOR = ['clientes.ver', 'clientes.editar'];
const ADMIN = ['clientes.ver', 'clientes.editar', 'clientes.administrar'];

/** Estado normalizado idéntico al registro: la validación no cambia nada. */
function normalizedFrom(record: CustomerRecord): NormalizedCustomer {
  return {
    customerCode: record.customerCode,
    customerCodeNormalized: record.customerCodeNormalized,
    legalName: record.legalName,
    legalNameNormalized: record.legalNameNormalized,
    tradeName: record.tradeName,
    taxId: record.taxId,
    taxIdNormalized: record.taxIdNormalized,
    countryId: record.country.id,
    city: record.city,
    address: record.address,
    phone: record.phone,
    email: record.email,
    companyTypeId: record.companyType?.id ?? null,
    statusId: record.status.id,
    ratingId: record.rating?.id ?? null,
    salesOwnerId: record.salesOwner.id,
  };
}

function outcome(normalized: NormalizedCustomer | null, overrides: Partial<ValidationOutcome> = {}): ValidationOutcome {
  return { errors: [], duplicates: [], blockingDuplicates: [], codeConflict: null, normalized, ...overrides };
}

function listRecord(id: string, salesOwnerId: string): CustomerListRecord {
  return {
    id,
    crmCode: `CLI-${id}`,
    customerCode: null,
    legalName: 'Cliente',
    tradeName: null,
    country: { id: 'country-gt', isoCode: 'GT', name: 'Guatemala' },
    city: null,
    status: { id: 'status-active', code: 'ACTIVO', label: 'Activo', countsAsActive: true },
    rating: null,
    salesOwner: { id: salesOwnerId, displayName: 'Responsable' },
    salesOwnerId,
    countryId: 'country-gt',
    isDeleted: false,
    updatedAt: CREATED_AT,
  };
}

function catalogItem(id: string, isActive: boolean, metadata: Record<string, unknown> | null = null): CatalogItemRecord {
  return { id, catalogId: 'catalog', code: id.toUpperCase(), label: id, metadata, sortOrder: 1, isActive, createdAt: CREATED_AT, updatedAt: CREATED_AT };
}

function catalog(key: string, items: CatalogItemRecord[]): CatalogDetailRecord {
  return {
    id: key,
    key,
    name: key,
    description: null,
    isSystem: true,
    itemCount: items.length,
    activeItemCount: items.length,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    items,
  };
}

const LIST_REQUEST: ListCustomersRequest = { page: 1, pageSize: 20, sortOrder: 'asc' };

describe('CustomersService', () => {
  let repository: {
    search: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
    countDependencies: jest.Mock;
    lockCustomerCode: jest.Mock;
    findCustomerCodeHolder: jest.Mock;
    listActiveCountries: jest.Mock;
  };
  let transactions: { run: jest.Mock };
  let actors: { visibility: jest.Mock; assignableSalesOwners: jest.Mock };
  let visibleCustomers: { findVisible: jest.Mock };
  let validation: { codeUniqueness: jest.Mock; validate: jest.Mock; defaultCatalogValues: jest.Mock; requiredFieldNames: jest.Mock };
  let catalogs: { findByKey: jest.Mock };
  let attachments: { limits: jest.Mock };
  let audit: { record: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    repository = {
      search: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
      countDependencies: jest.fn().mockResolvedValue({ projects: 0, openActivities: 0, pendingVisits: 0 }),
      lockCustomerCode: jest.fn().mockResolvedValue(undefined),
      findCustomerCodeHolder: jest.fn().mockResolvedValue(null),
      listActiveCountries: jest.fn().mockResolvedValue([makeCountry()]),
    };
    transactions = { run: jest.fn((work: (tx: TransactionContext) => Promise<unknown>) => work(TX)) };
    actors = { visibility: jest.fn().mockResolvedValue(makeVisibility()), assignableSalesOwners: jest.fn() };
    visibleCustomers = { findVisible: jest.fn().mockResolvedValue(makeVisible()) };
    validation = {
      codeUniqueness: jest.fn().mockResolvedValue('PAIS'),
      validate: jest.fn().mockResolvedValue(outcome(normalizedFrom(makeCustomer()))),
      defaultCatalogValues: jest.fn().mockResolvedValue({}),
      requiredFieldNames: jest.fn().mockResolvedValue(['legalName', 'countryId', 'statusId', 'salesOwnerId']),
    };
    catalogs = { findByKey: jest.fn().mockResolvedValue(null) };
    attachments = { limits: jest.fn().mockResolvedValue({ maxBytes: 10 * 1024 * 1024, allowedTypes: ['application/pdf'] }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new CustomersService(
      repository as unknown as CustomersRepository,
      transactions as unknown as TransactionRunner,
      actors as unknown as CustomerActorResolver,
      visibleCustomers as unknown as CustomerVisibilityService,
      validation as unknown as CustomerValidationService,
      {} as unknown as CustomerCreationService,
      catalogs as unknown as CatalogLookupService,
      attachments as unknown as AttachmentsService,
      audit as unknown as AuditService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger,
    );
  });

  describe('list', () => {
    it('exige clientes.eliminar para ver eliminados', async () => {
      const error = await service.list(makeActor(['clientes.ver']), { ...LIST_REQUEST, deleted: true }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(error).toMatchObject({ details: [{ requiredPermission: 'clientes.eliminar' }] });
      expect(repository.search).not.toHaveBeenCalled();
    });

    it('construye los criterios normalizados con sus valores por defecto', async () => {
      await service.list(makeActor(['clientes.ver']), {
        ...LIST_REQUEST,
        search: '  ab-12 Peña ',
        customerCode: ' ab-1 ',
        legalName: 'PEÑA',
        city: ' Ciudad   de  Guatemala ',
      });

      expect(repository.search).toHaveBeenCalledWith(
        {
          page: 1,
          pageSize: 20,
          sortBy: 'legalName',
          sortOrder: 'asc',
          searchTerms: ['ab-12', 'pena'],
          searchCrmCodePrefix: 'ab-12 Peña',
          searchCustomerCodePrefix: 'AB12PEÑA',
          searchTaxIdPrefix: 'AB12PEÑA',
          customerCodePrefix: 'AB1',
          crmCodePrefix: null,
          legalNameContains: 'pena',
          countryId: null,
          cityContains: 'ciudad de guatemala',
          statusId: null,
          salesOwnerId: null,
          activeOnly: false,
          deleted: false,
        },
        makeVisibility(),
      );
    });

    it('sin búsqueda deja vacíos los criterios de texto libre', async () => {
      await service.list(makeActor(['clientes.ver']), { ...LIST_REQUEST, search: '   ' });

      expect(repository.search).toHaveBeenCalledWith(
        expect.objectContaining({ searchTerms: [], searchCrmCodePrefix: null, searchCustomerCodePrefix: null, searchTaxIdPrefix: null }),
        expect.anything(),
      );
    });

    it('marca cada fila como DIRECT o INHERITED según el alcance de clientes.ver', async () => {
      repository.search.mockResolvedValue({ items: [listRecord('own', 'user-1'), listRecord('via-project', 'user-9')], totalItems: 2, page: 1, pageSize: 20 });

      const page = await service.list(makeActor(['clientes.ver']), LIST_REQUEST);

      expect(page.items.map((item) => [item.record.id, item.access])).toEqual([
        ['own', 'DIRECT'],
        ['via-project', 'INHERITED'],
      ]);
      expect(page.totalItems).toBe(2);
    });
  });

  describe('update', () => {
    it('propaga el 404 de la visibilidad', async () => {
      visibleCustomers.findVisible.mockRejectedValue(new ResourceNotFoundError('Customer', 'customer-x'));

      await expect(service.update(makeActor(EDITOR), 'customer-x', { city: 'Mixco' })).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(validation.validate).not.toHaveBeenCalled();
    });

    it('rechaza sin clientes.editar con 403 PERMISSION_DENIED', async () => {
      await expect(service.update(makeActor(['clientes.ver']), 'customer-1', { city: 'Mixco' })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'clientes.editar' }],
      });
    });

    it('rechaza un cliente ajeno sin clientes.administrar', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer({ salesOwner: { id: 'user-9', displayName: 'Otro', isActive: true } })));

      await expect(service.update(makeActor(EDITOR), 'customer-1', { city: 'Mixco' })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'clientes.administrar' }],
      });
    });

    it('rechaza un cliente visible solo por herencia aunque sea administrador', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer(), 'INHERITED'));

      await expect(service.update(makeActor(ADMIN), 'customer-1', { city: 'Mixco' })).rejects.toBeInstanceOf(PermissionDeniedError);
      expect(transactions.run).not.toHaveBeenCalled();
    });

    it('rechaza con 403 FIELD_NOT_EDITABLE los campos reservados que cambian', async () => {
      const error = await service
        .update(makeActor(EDITOR), 'customer-1', { customerCode: 'ZZ-99', salesOwnerId: 'user-2', countryId: 'country-sv', city: 'Mixco' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AccessDeniedError);
      expect(error).toMatchObject({
        code: 'FIELD_NOT_EDITABLE',
        details: [
          { field: 'customerCode', requiredPermission: 'clientes.administrar' },
          { field: 'salesOwnerId', requiredPermission: 'clientes.administrar' },
          { field: 'countryId', requiredPermission: 'clientes.administrar' },
        ],
      });
      expect(validation.validate).not.toHaveBeenCalled();
    });

    it('admite reenviar los campos reservados con su valor actual', async () => {
      await expect(
        service.update(makeActor(EDITOR), 'customer-1', { customerCode: ' AB-12 ', salesOwnerId: 'user-1', countryId: 'country-gt' }),
      ).resolves.toBeDefined();
      expect(validation.validate).toHaveBeenCalled();
    });

    it('compara el código normalizado: otra escritura del mismo código no es un cambio reservado', async () => {
      await expect(service.update(makeActor(EDITOR), 'customer-1', { customerCode: 'ab 12' })).resolves.toBeDefined();
      expect(validation.validate).toHaveBeenCalled();
    });

    it('valida en la transacción con el estado actual', async () => {
      await service.update(makeActor(EDITOR), 'customer-1', { city: 'Mixco' });

      expect(validation.validate).toHaveBeenCalledWith(expect.objectContaining({ city: 'Mixco' }), {
        mode: 'BY_ID',
        actor: expect.anything(),
        existing: makeCustomer(),
        tx: TX,
      });
    });

    it('sin cambios no escribe ni audita', async () => {
      const view = await service.update(makeActor(EDITOR), 'customer-1', { city: 'Guatemala' });

      expect(repository.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(view.record).toEqual(makeCustomer());
    });

    it('no escribe si la validación falla', async () => {
      validation.validate.mockResolvedValue(outcome(null, { errors: [{ field: 'legalName', code: 'FORMULA_NOT_ALLOWED', message: 'm' }] }));

      await expect(service.update(makeActor(EDITOR), 'customer-1', { legalName: '=x' })).rejects.toMatchObject({ code: 'FORMULA_NOT_ALLOWED' });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('escribe solo los campos cambiados y audita antes y después', async () => {
      const before = makeCustomer();
      const after = makeCustomer({ legalName: 'Constructora Nueva', legalNameNormalized: 'constructora nueva' });
      validation.validate.mockResolvedValue(
        outcome({ ...normalizedFrom(before), legalName: 'Constructora Nueva', legalNameNormalized: 'constructora nueva' }),
      );
      repository.findById.mockResolvedValue(after);

      const view = await service.update(makeActor(EDITOR), 'customer-1', { legalName: 'Constructora Nueva' });

      expect(repository.update).toHaveBeenCalledWith(
        'customer-1',
        { legalName: 'Constructora Nueva', legalNameNormalized: 'constructora nueva', updatedById: 'user-1' },
        TX,
      );
      expect(audit.record).toHaveBeenCalledWith('crm.customer.updated', AUDIT, {
        resourceType: 'crm.customer',
        resourceId: 'customer-1',
        before: customerAuditState(before),
        after: customerAuditState(after),
      });
      expect(view.record).toBe(after);
    });
  });

  describe('remove', () => {
    it('rechaza sin clientes.eliminar', async () => {
      await expect(service.remove(makeActor(EDITOR), 'customer-1')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'clientes.eliminar' }],
      });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('rechaza un cliente visible solo por herencia', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer(), 'INHERITED'));

      await expect(service.remove(makeActor(['clientes.eliminar']), 'customer-1')).rejects.toBeInstanceOf(PermissionDeniedError);
    });

    it('rechaza con 409 CUSTOMER_HAS_DEPENDENCIES listando solo las dependencias presentes', async () => {
      repository.countDependencies.mockResolvedValue({ projects: 2, openActivities: 0, pendingVisits: 1 });

      const error = await service.remove(makeActor(['clientes.eliminar']), 'customer-1').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({
        code: 'CUSTOMER_HAS_DEPENDENCIES',
        details: [
          { dependency: 'projects', count: 2 },
          { dependency: 'pendingVisits', count: 1 },
        ],
      });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('elimina lógicamente y audita crm.customer.deleted', async () => {
      await service.remove(makeActor(['clientes.eliminar']), 'customer-1');

      expect(repository.softDelete).toHaveBeenCalledWith('customer-1', 'user-1');
      expect(audit.record).toHaveBeenCalledWith('crm.customer.deleted', AUDIT, {
        resourceType: 'crm.customer',
        resourceId: 'customer-1',
        metadata: { crmCode: 'CLI-000001' },
      });
    });
  });

  describe('restore', () => {
    const deleted = makeCustomer({ deletedAt: CREATED_AT });

    it('rechaza con 409 CUSTOMER_NOT_DELETED un cliente vigente', async () => {
      await expect(service.restore(makeActor(['clientes.eliminar']), 'customer-1')).rejects.toMatchObject({ code: 'CUSTOMER_NOT_DELETED' });
      expect(visibleCustomers.findVisible).toHaveBeenCalledWith(expect.anything(), 'customer-1', { includeDeleted: true });
    });

    it('con GLOBAL rechaza con 409 CUSTOMER_CODE_TAKEN si otro cliente ocupa el código', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(deleted));
      validation.codeUniqueness.mockResolvedValue('GLOBAL');
      repository.findCustomerCodeHolder.mockResolvedValue({ id: 'customer-9', crmCode: 'CLI-000009', isDeleted: false, isInScope: false });

      await expect(service.restore(makeActor(['clientes.eliminar']), 'customer-1')).rejects.toMatchObject({
        code: 'CUSTOMER_CODE_TAKEN',
        details: [{ field: 'customerCode', customerId: null, crmCode: 'CLI-000009', isDeleted: false }],
      });
      expect(repository.lockCustomerCode).toHaveBeenCalledWith('AB12', TX);
      expect(repository.findCustomerCodeHolder).toHaveBeenCalledWith('AB12', { countryId: null, excludeCustomerId: 'customer-1' }, makeVisibility(), TX);
      expect(repository.restore).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('restaura, audita crm.customer.restored y devuelve la ficha', async () => {
      visibleCustomers.findVisible.mockResolvedValueOnce(makeVisible(deleted)).mockResolvedValueOnce(makeVisible());

      const view = await service.restore(makeActor(['clientes.eliminar']), 'customer-1');

      expect(repository.findCustomerCodeHolder).not.toHaveBeenCalled();
      expect(repository.restore).toHaveBeenCalledWith('customer-1', 'user-1', TX);
      expect(audit.record).toHaveBeenCalledWith('crm.customer.restored', AUDIT, {
        resourceType: 'crm.customer',
        resourceId: 'customer-1',
        metadata: { crmCode: 'CLI-000001' },
      });
      expect(view.record.deletedAt).toBeNull();
    });
  });

  describe('formOptions', () => {
    it('devuelve solo elementos activos, el isActive de estado desde metadata, defectos y límites', async () => {
      catalogs.findByKey.mockImplementation(async (key: string) => {
        if (key === 'crm.tipo_empresa') return catalog(key, [catalogItem('type-sa', true), catalogItem('type-old', false)]);
        if (key === 'crm.estado_cliente') {
          return catalog(key, [
            catalogItem('status-active', true, { isActive: true }),
            catalogItem('status-closed', true, { isActive: false }),
            catalogItem('status-plain', true),
            catalogItem('status-retired', false, { isActive: true }),
          ]);
        }
        return null;
      });
      validation.defaultCatalogValues.mockResolvedValue({ status: 'status-active' });
      attachments.limits.mockResolvedValue({ maxBytes: 10 * 1024 * 1024 + 1, allowedTypes: ['application/pdf'] });

      const options = await service.formOptions();

      expect(validation.defaultCatalogValues).toHaveBeenCalledWith('BY_ID');
      expect(options).toEqual({
        countries: [makeCountry()],
        companyTypes: [{ id: 'type-sa', code: 'TYPE-SA', label: 'type-sa', sortOrder: 1 }],
        statuses: [
          { id: 'status-active', code: 'STATUS-ACTIVE', label: 'status-active', sortOrder: 1, isActive: true },
          { id: 'status-closed', code: 'STATUS-CLOSED', label: 'status-closed', sortOrder: 1, isActive: false },
          { id: 'status-plain', code: 'STATUS-PLAIN', label: 'status-plain', sortOrder: 1, isActive: false },
        ],
        ratings: [],
        defaults: { statusId: 'status-active', companyTypeId: null, ratingId: null },
        requiredFields: ['legalName', 'countryId', 'statusId', 'salesOwnerId'],
        attachments: { enabled: true, maxMb: 10, allowedTypes: ['application/pdf'] },
      });
    });
  });

  describe('assertCanManageAttachments', () => {
    it('permite al editor del cliente propio', async () => {
      await expect(service.assertCanManageAttachments(makeActor(EDITOR), 'customer-1')).resolves.toBeUndefined();
      expect(visibleCustomers.findVisible).toHaveBeenCalledWith(expect.anything(), 'customer-1');
    });

    it('rechaza sin poder editar el cliente', async () => {
      await expect(service.assertCanManageAttachments(makeActor(['clientes.ver']), 'customer-1')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'clientes.editar' }],
      });
    });

    it('rechaza un cliente visible solo por herencia', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer(), 'INHERITED'));

      await expect(service.assertCanManageAttachments(makeActor(ADMIN), 'customer-1')).rejects.toBeInstanceOf(PermissionDeniedError);
    });
  });
});
