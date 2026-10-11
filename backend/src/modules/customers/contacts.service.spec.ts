import { BusinessRuleViolationError, PermissionDeniedError, ResourceConflictError } from '@/common/errors/application-error';
import type { TransactionContext, TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import { ContactsService, type CreateContactRequest } from './contacts.service';
import type { CustomerVisibilityService } from './customer-visibility.service';
import { ContactEmailConflictError, type ContactRecord, type ContactsRepository } from './ports/contacts.repository.port';
import { AUDIT, CREATED_AT, makeActor, makeContact, makeCountry, makeCustomer, makeVisible, TX } from './testing/customer-fixtures';

const WRITER = ['contactos.ver', 'contactos.crear', 'contactos.editar'];
const NEW_CONTACT: CreateContactRequest = { firstName: ' Ana ', lastName: ' Peña ', email: ' Ana@Example.com ', phone: '2222 3333' };

describe('ContactsService', () => {
  let rules: unknown;
  let stored: Map<string, ContactRecord>;
  let repository: {
    list: jest.Mock;
    findById: jest.Mock;
    findEmailHolder: jest.Mock;
    findDuplicateCandidates: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setPrimary: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
  };
  let transactions: { run: jest.Mock };
  let visibleCustomers: { findVisible: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ContactsService;

  const writer = makeActor(WRITER);
  const auditEvents = (): unknown[] => audit.record.mock.calls.map((call: unknown[]) => call[0]);

  beforeEach(() => {
    rules = {};
    stored = new Map([['contact-1', makeContact()]]);
    repository = {
      list: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
      findById: jest.fn(async (_customerId: string, contactId: string) => stored.get(contactId) ?? null),
      findEmailHolder: jest.fn().mockResolvedValue(null),
      findDuplicateCandidates: jest.fn().mockResolvedValue([]),
      create: jest.fn(async () => {
        stored.set('contact-new', makeContact({ id: 'contact-new', email: 'Ana@Example.com', emailNormalized: 'ana@example.com' }));
        return 'contact-new';
      }),
      update: jest.fn().mockResolvedValue(undefined),
      setPrimary: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };
    transactions = { run: jest.fn((work: (tx: TransactionContext) => Promise<unknown>) => work(TX)) };
    visibleCustomers = { findVisible: jest.fn().mockResolvedValue(makeVisible()) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ContactsService(
      repository as unknown as ContactsRepository,
      transactions as unknown as TransactionRunner,
      visibleCustomers as unknown as CustomerVisibilityService,
      // Las reglas solo se devuelven para la clave correcta del parámetro.
      { get: jest.fn(async (key: string) => (key === 'crm.contactos.reglas_duplicidad' ? rules : undefined)) } as unknown as ParameterReader,
      audit as unknown as AuditService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as AppLogger,
    );
  });

  describe('cliente que admite cambios en sus contactos (D-02.7)', () => {
    const otherOwner = makeCustomer({ salesOwner: { id: 'user-9', displayName: 'Otro', isActive: true } });

    it('rechaza un cliente ajeno sin clientes.administrar', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(otherOwner));

      const error = await service.create(writer, 'customer-1', NEW_CONTACT).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(error).toMatchObject({ details: [{ requiredPermission: 'clientes.administrar' }] });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('admite un cliente ajeno con clientes.administrar', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(otherOwner));

      await expect(service.create(makeActor([...WRITER, 'clientes.administrar']), 'customer-1', NEW_CONTACT)).resolves.toBeDefined();
    });

    it('rechaza un cliente visible solo por herencia aunque sea propio', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer(), 'INHERITED'));

      await expect(service.create(makeActor([...WRITER, 'clientes.administrar']), 'customer-1', NEW_CONTACT)).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });

    it('rechaza un cliente eliminado', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer({ deletedAt: CREATED_AT })));

      await expect(service.setPrimary(writer, 'customer-1', 'contact-1')).rejects.toBeInstanceOf(PermissionDeniedError);
      expect(repository.setPrimary).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('exige contactos.eliminar para ver eliminados', async () => {
      await expect(service.list(writer, 'customer-1', { page: 1, pageSize: 20, sortOrder: 'asc', deleted: true })).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'contactos.eliminar' }],
      });
      expect(repository.list).not.toHaveBeenCalled();
    });

    it('aplica los valores por defecto tras comprobar la visibilidad del cliente', async () => {
      await service.list(writer, 'customer-1', { page: 1, pageSize: 20, sortOrder: 'asc', search: '  ' });

      expect(visibleCustomers.findVisible).toHaveBeenCalledWith(writer, 'customer-1');
      expect(repository.list).toHaveBeenCalledWith('customer-1', {
        page: 1,
        pageSize: 20,
        sortBy: 'lastName',
        sortOrder: 'asc',
        search: null,
        status: 'ACTIVE',
        deleted: false,
      });
    });
  });

  describe('create', () => {
    it('valida el teléfono con el patrón del país del cliente', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer({ country: makeCountry({ phonePattern: '\\+502 \\d{4}-\\d{4}' }) })));

      const error = await service.create(writer, 'customer-1', NEW_CONTACT).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error).toMatchObject({ code: 'INVALID_PHONE_FORMAT', details: [expect.objectContaining({ field: 'phone' })] });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un principal inactivo con 422 CONTACT_INACTIVE', async () => {
      await expect(service.create(writer, 'customer-1', { ...NEW_CONTACT, isActive: false, isPrimary: true })).rejects.toMatchObject({
        code: 'CONTACT_INACTIVE',
        details: [{ field: 'isPrimary' }],
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un correo ya usado en el cliente con 409 CONTACT_EMAIL_TAKEN', async () => {
      repository.findEmailHolder.mockResolvedValue({ id: 'contact-9', isDeleted: true });

      const error = await service.create(writer, 'customer-1', NEW_CONTACT).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({ code: 'CONTACT_EMAIL_TAKEN', details: [{ field: 'email', contactId: 'contact-9', isDeleted: true }] });
      expect(repository.findEmailHolder).toHaveBeenCalledWith('customer-1', 'ana@example.com', null);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('avisa de un nombre completo repetido con 409 POSSIBLE_DUPLICATE', async () => {
      rules = { nombreCompleto: 'AVISAR', telefono: 'NO' };
      repository.findDuplicateCandidates.mockResolvedValue([
        { rules: ['nombreCompleto'], candidate: { id: 'contact-2', firstName: 'ANA', lastName: ' peña', jobTitle: 'Gerente', isDeleted: false } },
      ]);

      await expect(service.create(writer, 'customer-1', NEW_CONTACT)).rejects.toMatchObject({
        code: 'POSSIBLE_DUPLICATE',
        details: [
          { rule: 'nombreCompleto', reason: 'FULL_NAME', candidate: { id: 'contact-2', fullName: 'ANA peña', jobTitle: 'Gerente', isDeleted: false } },
        ],
      });
      expect(repository.findDuplicateCandidates).toHaveBeenCalledWith({ customerId: 'customer-1', excludeContactId: null, nombreCompleto: 'ana pena' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('crea al confirmar el aviso', async () => {
      rules = { nombreCompleto: 'AVISAR' };
      repository.findDuplicateCandidates.mockResolvedValue([
        { rules: ['nombreCompleto'], candidate: { id: 'contact-2', firstName: 'Ana', lastName: 'Peña', jobTitle: null, isDeleted: false } },
      ]);

      await expect(service.create(writer, 'customer-1', { ...NEW_CONTACT, acknowledgedDuplicateIds: ['contact-2'] })).resolves.toMatchObject({
        id: 'contact-new',
      });
    });

    it('bloquea con 409 DUPLICATE_BLOCKED una regla en BLOQUEAR aunque se confirme', async () => {
      rules = { telefono: 'BLOQUEAR' };
      repository.findDuplicateCandidates.mockResolvedValue([
        { rules: ['telefono'], candidate: { id: 'contact-2', firstName: 'Luis', lastName: 'Pérez', jobTitle: null, isDeleted: true } },
      ]);

      await expect(service.create(writer, 'customer-1', { ...NEW_CONTACT, acknowledgedDuplicateIds: ['contact-2'] })).rejects.toMatchObject({
        code: 'DUPLICATE_BLOCKED',
        details: [{ rule: 'telefono', reason: 'PHONE', candidate: { id: 'contact-2', isDeleted: true } }],
      });
      expect(repository.findDuplicateCandidates).toHaveBeenCalledWith({ customerId: 'customer-1', excludeContactId: null, telefono: '22223333' });
    });

    it('crea con valores recortados y audita con los datos personales enmascarados', async () => {
      const created = await service.create(writer, 'customer-1', NEW_CONTACT);

      expect(repository.create).toHaveBeenCalledWith(
        {
          customerId: 'customer-1',
          firstName: 'Ana',
          lastName: 'Peña',
          jobTitle: null,
          phone: '2222 3333',
          email: 'Ana@Example.com',
          emailNormalized: 'ana@example.com',
          isActive: true,
          comments: null,
          createdById: 'user-1',
        },
        TX,
      );
      expect(audit.record).toHaveBeenCalledWith(
        'crm.contact.created',
        AUDIT,
        expect.objectContaining({
          resourceType: 'crm.contact',
          resourceId: 'contact-new',
          before: null,
          metadata: { customerId: 'customer-1' },
          maskedFields: ['firstName', 'lastName', 'email', 'phone'],
        }),
      );
      expect(repository.setPrimary).not.toHaveBeenCalled();
      expect(created.id).toBe('contact-new');
    });

    it('como principal lo fija en la misma transacción y audita el cambio de principal', async () => {
      visibleCustomers.findVisible.mockResolvedValue(
        makeVisible(makeCustomer({ primaryContact: { id: 'contact-1', firstName: 'Ana', lastName: 'Peña' } })),
      );

      await service.create(writer, 'customer-1', { ...NEW_CONTACT, isPrimary: true });

      expect(transactions.run).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(expect.anything(), TX);
      expect(repository.setPrimary).toHaveBeenCalledWith('customer-1', 'contact-new', 'user-1', TX);
      expect(audit.record).toHaveBeenCalledWith('crm.customer.primary_contact_changed', AUDIT, {
        resourceType: 'crm.customer',
        resourceId: 'customer-1',
        before: { primaryContactId: 'contact-1' },
        after: { primaryContactId: 'contact-new' },
      });
    });

    it('traduce la carrera del índice de correo a 409 CONTACT_EMAIL_TAKEN', async () => {
      repository.create.mockRejectedValue(new ContactEmailConflictError());

      await expect(service.create(writer, 'customer-1', NEW_CONTACT)).rejects.toMatchObject({ code: 'CONTACT_EMAIL_TAKEN' });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('solo revisa las claves que cambian', async () => {
      rules = { nombreCompleto: 'AVISAR', telefono: 'AVISAR' };

      await service.update(writer, 'customer-1', 'contact-1', { phone: '5555 6666', email: 'ANA@example.com' });

      expect(repository.findEmailHolder).not.toHaveBeenCalled();
      expect(repository.findDuplicateCandidates).toHaveBeenCalledWith({ customerId: 'customer-1', excludeContactId: 'contact-1', telefono: '55556666' });
    });

    it('sin cambios no escribe ni audita', async () => {
      const result = await service.update(writer, 'customer-1', 'contact-1', { firstName: ' Ana ', phone: '2222 3333' });

      expect(transactions.run).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(result).toEqual(makeContact());
    });

    it('escribe solo los cambios y recalcula el correo normalizado', async () => {
      await service.update(writer, 'customer-1', 'contact-1', { email: 'Nuevo@Example.com', lastName: 'Peña' });

      expect(repository.update).toHaveBeenCalledWith(
        'customer-1',
        'contact-1',
        { email: 'Nuevo@Example.com', emailNormalized: 'nuevo@example.com', updatedById: 'user-1' },
        TX,
      );
      expect(auditEvents()).toEqual(['crm.contact.updated']);
    });

    it('desactivar el principal lo limpia en la misma transacción y audita los tres eventos', async () => {
      stored.set('contact-1', makeContact({ isPrimary: true }));
      repository.update.mockImplementation(async () => {
        stored.set('contact-1', makeContact({ isPrimary: false, isActive: false }));
      });

      await service.update(writer, 'customer-1', 'contact-1', { isActive: false });

      expect(transactions.run).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith('customer-1', 'contact-1', { isActive: false, updatedById: 'user-1' }, TX);
      expect(repository.setPrimary).toHaveBeenCalledWith('customer-1', null, 'user-1', TX);
      expect(auditEvents()).toEqual(['crm.contact.updated', 'crm.contact.deactivated', 'crm.customer.primary_contact_changed']);
      expect(audit.record).toHaveBeenLastCalledWith('crm.customer.primary_contact_changed', AUDIT, expect.objectContaining({
        before: { primaryContactId: 'contact-1' },
        after: { primaryContactId: null },
      }));
    });

    it('valida el teléfono enviado con el patrón del país', async () => {
      visibleCustomers.findVisible.mockResolvedValue(makeVisible(makeCustomer({ country: makeCountry({ phonePattern: '\\d{8}' }) })));

      await expect(service.update(writer, 'customer-1', 'contact-1', { phone: '1234' })).rejects.toMatchObject({ code: 'INVALID_PHONE_FORMAT' });
      await expect(service.update(writer, 'customer-1', 'contact-1', { jobTitle: 'Gerente' })).resolves.toBeDefined();
    });
  });

  describe('principal', () => {
    it('rechaza fijar un contacto inactivo con 422 CONTACT_INACTIVE', async () => {
      stored.set('contact-1', makeContact({ isActive: false }));

      await expect(service.setPrimary(writer, 'customer-1', 'contact-1')).rejects.toMatchObject({ code: 'CONTACT_INACTIVE' });
      expect(repository.setPrimary).not.toHaveBeenCalled();
    });

    it('fija el principal y audita el cambio', async () => {
      const result = await service.setPrimary(writer, 'customer-1', 'contact-1');

      expect(repository.setPrimary).toHaveBeenCalledWith('customer-1', 'contact-1', 'user-1', TX);
      expect(auditEvents()).toEqual(['crm.customer.primary_contact_changed']);
      expect(result.isPrimary).toBe(true);
    });

    it('no escribe si ya es el principal', async () => {
      visibleCustomers.findVisible.mockResolvedValue(
        makeVisible(makeCustomer({ primaryContact: { id: 'contact-1', firstName: 'Ana', lastName: 'Peña' } })),
      );

      await service.setPrimary(writer, 'customer-1', 'contact-1');

      expect(repository.setPrimary).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('quitar el principal no hace nada si no hay', async () => {
      await service.clearPrimary(writer, 'customer-1');

      expect(transactions.run).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('quita el principal existente y lo audita', async () => {
      visibleCustomers.findVisible.mockResolvedValue(
        makeVisible(makeCustomer({ primaryContact: { id: 'contact-1', firstName: 'Ana', lastName: 'Peña' } })),
      );

      await service.clearPrimary(writer, 'customer-1');

      expect(repository.setPrimary).toHaveBeenCalledWith('customer-1', null, 'user-1', TX);
      expect(auditEvents()).toEqual(['crm.customer.primary_contact_changed']);
    });
  });

  describe('remove', () => {
    const deleter = makeActor([...WRITER, 'contactos.eliminar']);

    it('exige contactos.eliminar', async () => {
      await expect(service.remove(writer, 'customer-1', 'contact-1')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
        details: [{ requiredPermission: 'contactos.eliminar' }],
      });
    });

    it('rechaza un contacto con historial con 409 CONTACT_HAS_HISTORY', async () => {
      stored.set('contact-1', makeContact({ hasHistory: true }));

      await expect(service.remove(deleter, 'customer-1', 'contact-1')).rejects.toMatchObject({ code: 'CONTACT_HAS_HISTORY' });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('elimina el principal limpiándolo en la misma transacción', async () => {
      stored.set('contact-1', makeContact({ isPrimary: true }));

      await service.remove(deleter, 'customer-1', 'contact-1');

      expect(transactions.run).toHaveBeenCalledTimes(1);
      expect(repository.setPrimary).toHaveBeenCalledWith('customer-1', null, 'user-1', TX);
      expect(repository.softDelete).toHaveBeenCalledWith('customer-1', 'contact-1', 'user-1', TX);
      expect(auditEvents()).toEqual(['crm.contact.deleted', 'crm.customer.primary_contact_changed']);
    });

    it('elimina un contacto que no es principal sin tocar el principal', async () => {
      await service.remove(deleter, 'customer-1', 'contact-1');

      expect(repository.setPrimary).not.toHaveBeenCalled();
      expect(auditEvents()).toEqual(['crm.contact.deleted']);
    });
  });

  describe('restore', () => {
    it('rechaza un contacto no eliminado con 409 CONTACT_NOT_DELETED', async () => {
      await expect(service.restore(makeActor([...WRITER, 'contactos.eliminar']), 'customer-1', 'contact-1')).rejects.toMatchObject({
        code: 'CONTACT_NOT_DELETED',
      });
      expect(repository.findById).toHaveBeenCalledWith('customer-1', 'contact-1', { includeDeleted: true });
      expect(repository.restore).not.toHaveBeenCalled();
    });
  });
});
