import { Inject, Injectable } from '@nestjs/common';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { CustomerActor } from './customer-actor.resolver';
import { contactInactiveError, customerInactiveError, invalidContactError } from './customer-errors';
import { CustomerVisibilityService } from './customer-visibility.service';
import { CONTACTS_REPOSITORY, type ContactsRepository } from './ports/contacts.repository.port';

/** Lo que otro módulo necesita saber del cliente que referencia. */
export interface CustomerSummary {
  readonly id: string;
  readonly crmCode: string;
  readonly legalName: string;
  readonly countryId: string;
  readonly salesOwnerId: string;
  /** Estado con `metadata.isActive = true` (RN-02.21). */
  readonly isActive: boolean;
}

export interface ContactSummary {
  readonly id: string;
  readonly customerId: string;
  readonly fullName: string;
  readonly isActive: boolean;
}

/**
 * Guardas "cliente utilizable" y "contacto de este cliente" (02 F.6.3) para los
 * módulos que referencian clientes (Proyectos, Actividad). Son la única forma de
 * validar esas relaciones fuera de este módulo.
 */
@Injectable()
export class CustomerReferenceGuard {
  constructor(
    private readonly visibleCustomers: CustomerVisibilityService,
    @Inject(CONTACTS_REPOSITORY) private readonly contacts: ContactsRepository,
  ) {}

  /**
   * `404 RESOURCE_NOT_FOUND` si no existe, está eliminado o el actor no lo ve (H.1);
   * `422 CUSTOMER_INACTIVE` si `requireActive` y su estado no cuenta como activo (D-02.16).
   */
  async assertUsableCustomer(
    customerId: string,
    actor: CustomerActor,
    options: { readonly requireActive: boolean; readonly tx?: TransactionContext },
  ): Promise<CustomerSummary> {
    const { record } = await this.visibleCustomers.findVisible(actor, customerId, { tx: options.tx });
    if (options.requireActive && !record.status.countsAsActive) {
      throw customerInactiveError(customerId);
    }
    return {
      id: record.id,
      crmCode: record.crmCode,
      legalName: record.legalName,
      countryId: record.country.id,
      salesOwnerId: record.salesOwner.id,
      isActive: record.status.countsAsActive,
    };
  }

  /**
   * `422 INVALID_CONTACT` si el contacto no existe, es de otro cliente o está
   * eliminado; `422 CONTACT_INACTIVE` si `requireActive` y está inactivo. Supone el
   * cliente ya validado con `assertUsableCustomer`.
   */
  async assertContactOfCustomer(
    contactId: string,
    customerId: string,
    options: { readonly requireActive: boolean; readonly field?: string; readonly tx?: TransactionContext },
  ): Promise<ContactSummary> {
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: false }, options.tx);
    if (!contact) {
      throw invalidContactError(options.field);
    }
    if (options.requireActive && !contact.isActive) {
      throw contactInactiveError(options.field);
    }
    return {
      id: contact.id,
      customerId: contact.customerId,
      fullName: `${contact.firstName} ${contact.lastName}`.trim(),
      isActive: contact.isActive,
    };
  }
}
