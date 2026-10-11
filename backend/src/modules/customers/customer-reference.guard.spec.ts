import { BusinessRuleViolationError, ResourceNotFoundError } from '@/common/errors/application-error';

import { CustomerReferenceGuard } from './customer-reference.guard';
import type { CustomerVisibilityService } from './customer-visibility.service';
import type { ContactsRepository } from './ports/contacts.repository.port';
import { makeActor, makeContact, makeCustomer, makeVisible, TX } from './testing/customer-fixtures';

describe('CustomerReferenceGuard', () => {
  const actor = makeActor(['clientes.ver', 'proyectos.crear']);
  let visibleCustomers: { findVisible: jest.Mock };
  let contacts: { findById: jest.Mock };
  let guard: CustomerReferenceGuard;

  beforeEach(() => {
    visibleCustomers = { findVisible: jest.fn().mockResolvedValue(makeVisible()) };
    contacts = { findById: jest.fn().mockResolvedValue(makeContact()) };
    guard = new CustomerReferenceGuard(visibleCustomers as unknown as CustomerVisibilityService, contacts as unknown as ContactsRepository);
  });

  describe('assertUsableCustomer', () => {
    it('propaga el 404 de la visibilidad', async () => {
      visibleCustomers.findVisible.mockRejectedValue(new ResourceNotFoundError('Customer', 'customer-x'));

      await expect(guard.assertUsableCustomer('customer-x', actor, { requireActive: true })).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it('busca el cliente sin admitir eliminados y dentro de la transacción del llamador', async () => {
      await guard.assertUsableCustomer('customer-1', actor, { requireActive: false, tx: TX });

      expect(visibleCustomers.findVisible).toHaveBeenCalledWith(actor, 'customer-1', { tx: TX });
    });

    it('rechaza con 422 CUSTOMER_INACTIVE un cliente cuyo estado no cuenta como activo', async () => {
      visibleCustomers.findVisible.mockResolvedValue(
        makeVisible(makeCustomer({ status: { id: 'status-closed', code: 'CERRADO', label: 'Cerrado', isActive: true, countsAsActive: false } })),
      );

      const error = await guard.assertUsableCustomer('customer-1', actor, { requireActive: true }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error).toMatchObject({ code: 'CUSTOMER_INACTIVE', details: [{ field: 'customerId', customerId: 'customer-1' }] });
    });

    it('devuelve el resumen de un cliente inactivo si no se exige activo', async () => {
      visibleCustomers.findVisible.mockResolvedValue(
        makeVisible(makeCustomer({ status: { id: 'status-closed', code: 'CERRADO', label: 'Cerrado', isActive: true, countsAsActive: false } })),
      );

      await expect(guard.assertUsableCustomer('customer-1', actor, { requireActive: false })).resolves.toMatchObject({ isActive: false });
    });

    it('devuelve el resumen del cliente activo', async () => {
      await expect(guard.assertUsableCustomer('customer-1', actor, { requireActive: true })).resolves.toEqual({
        id: 'customer-1',
        crmCode: 'CLI-000001',
        legalName: 'Constructora Peña S.A.',
        countryId: 'country-gt',
        salesOwnerId: 'user-1',
        isActive: true,
      });
    });
  });

  describe('assertContactOfCustomer', () => {
    it('rechaza con 422 INVALID_CONTACT un contacto que no es del cliente, no existe o está eliminado', async () => {
      contacts.findById.mockResolvedValue(null);

      await expect(
        guard.assertContactOfCustomer('contact-x', 'customer-1', { requireActive: true, field: 'participants[0].contactId', tx: TX }),
      ).rejects.toMatchObject({ code: 'INVALID_CONTACT', details: [{ field: 'participants[0].contactId' }] });
      expect(contacts.findById).toHaveBeenCalledWith('customer-1', 'contact-x', { includeDeleted: false }, TX);
    });

    it('rechaza con 422 CONTACT_INACTIVE un contacto inactivo si se exige activo', async () => {
      contacts.findById.mockResolvedValue(makeContact({ isActive: false }));

      await expect(guard.assertContactOfCustomer('contact-1', 'customer-1', { requireActive: true })).rejects.toMatchObject({
        code: 'CONTACT_INACTIVE',
        details: [{ field: 'contactId' }],
      });
      await expect(guard.assertContactOfCustomer('contact-1', 'customer-1', { requireActive: false })).resolves.toMatchObject({
        isActive: false,
      });
    });

    it('devuelve el resumen del contacto', async () => {
      await expect(guard.assertContactOfCustomer('contact-1', 'customer-1', { requireActive: true })).resolves.toEqual({
        id: 'contact-1',
        customerId: 'customer-1',
        fullName: 'Ana Peña',
        isActive: true,
      });
    });
  });
});
