import { Inject, Injectable } from '@nestjs/common';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { isWithinScope } from '@/modules/access/visibility-scope';

import { type CustomerActor, CustomerActorResolver } from './customer-actor.resolver';
import { CUSTOMER_PERMISSIONS, type CustomerAccess } from './customer-access-policy';
import { customerNotFound } from './customer-errors';
import {
  CUSTOMERS_REPOSITORY,
  type CustomerRecord,
  type CustomersRepository,
  type CustomerVisibility,
} from './ports/customers.repository.port';

/** Cliente que el actor ve, con el tipo de acceso (H.1). */
export interface VisibleCustomer {
  readonly record: CustomerRecord;
  readonly access: CustomerAccess;
  readonly visibility: CustomerVisibility;
}

/** `DIRECT` si el cliente cae en el alcance de `clientes.ver`; si no, solo por herencia (DM-13). */
export function customerAccessFor(visibility: CustomerVisibility, record: { salesOwnerId: string; countryId: string }): CustomerAccess {
  return isWithinScope(visibility.direct, { ownerId: record.salesOwnerId, countryId: record.countryId }) ? 'DIRECT' : 'INHERITED';
}

/**
 * Punto único que decide si un actor ve un cliente (02 H.1, RN-02.19): fuera del
 * alcance, inexistente o eliminado (sin `clientes.eliminar`) → el mismo `404`,
 * sin revelar cuál de los tres casos es. Lo usan la ficha, los contactos, los
 * adjuntos y `CustomerReferenceGuard`.
 */
@Injectable()
export class CustomerVisibilityService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository,
    private readonly actors: CustomerActorResolver,
  ) {}

  /**
   * `includeDeleted`: admite clientes eliminados, solo si el actor tiene
   * `clientes.eliminar` (D-02.6); sin él, un eliminado es `404`.
   */
  async findVisible(
    actor: CustomerActor,
    customerId: string,
    options: { readonly includeDeleted?: boolean; readonly tx?: TransactionContext } = {},
  ): Promise<VisibleCustomer> {
    const visibility = await this.actors.visibility(actor);
    const includeDeleted = (options.includeDeleted ?? false) && actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
    const record = await this.customers.findById(customerId, { visibility, includeDeleted }, options.tx);
    if (!record) {
      throw customerNotFound(customerId);
    }
    return { record, access: customerAccessFor(visibility, { salesOwnerId: record.salesOwner.id, countryId: record.country.id }), visibility };
  }
}
