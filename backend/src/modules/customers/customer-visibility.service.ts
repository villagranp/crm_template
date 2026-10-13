import { Inject, Injectable } from '@nestjs/common';

import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { isWithinScope } from '@/modules/access/visibility-scope';

import { type CustomerAccessScopes, type CustomerActor, CustomerActorResolver } from './customer-actor.resolver';
import { CUSTOMER_PERMISSIONS, type CustomerAccess, type CustomerPolicySubject } from './customer-access-policy';
import { customerNotFound } from './customer-errors';
import {
  CUSTOMERS_REPOSITORY,
  type CustomerRecord,
  type CustomersRepository,
  type CustomerVisibility,
} from './ports/customers.repository.port';

/** Cliente que el actor ve, con el tipo de acceso (H.1) y lo que la política necesita (H.2). */
export interface VisibleCustomer {
  readonly record: CustomerRecord;
  readonly access: CustomerAccess;
  /** Alcances del actor con los que se calculó `subject`. */
  readonly scopes: CustomerAccessScopes;
  /** Sujeto de `CustomerAccessPolicy`: el mismo para hacer cumplir y para las `capabilities`. */
  readonly subject: CustomerPolicySubject;
}

/** Dueño y país del cliente, para evaluar alcances en memoria. */
export interface CustomerScopeRef {
  readonly salesOwnerId: string;
  readonly countryId: string;
}

function scopeRef(record: CustomerScopeRef): { ownerId: string; countryId: string } {
  return { ownerId: record.salesOwnerId, countryId: record.countryId };
}

/** `DIRECT` si el cliente cae en el alcance de `clientes.ver`; si no, solo por herencia (DM-13). */
export function customerAccessFor(visibility: CustomerVisibility, record: CustomerScopeRef): CustomerAccess {
  return isWithinScope(visibility.direct, scopeRef(record)) ? 'DIRECT' : 'INHERITED';
}

/**
 * Sujeto de la política para un cliente ya visible: acceso por `clientes.ver` y
 * pertenencia al alcance de **cada** permiso operativo (02 "Precisiones de
 * implementación", M1): con roles combinados, el alcance de ver no concede el de
 * administrar ni el de eliminar.
 */
export function customerPolicySubject(record: CustomerRecord, scopes: CustomerAccessScopes): CustomerPolicySubject {
  const ref: CustomerScopeRef = { salesOwnerId: record.salesOwner.id, countryId: record.country.id };
  return {
    salesOwnerId: record.salesOwner.id,
    access: customerAccessFor(scopes.visibility, ref),
    isDeleted: record.deletedAt !== null,
    inAdministerScope: isWithinScope(scopes.administer, scopeRef(ref)),
    inDeleteScope: isWithinScope(scopes.delete, scopeRef(ref)),
  };
}

/** `VisibleCustomer` de un registro con los alcances del actor ya resueltos. */
export function toVisibleCustomer(record: CustomerRecord, scopes: CustomerAccessScopes): VisibleCustomer {
  const subject = customerPolicySubject(record, scopes);
  return { record, access: subject.access, scopes, subject };
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
   * `scopes`: alcances del actor ya resueltos (obligatorio dentro de una transacción).
   * `includeDeleted`: admite clientes eliminados, solo si el actor tiene
   * `clientes.eliminar` (D-02.6); sin él, un eliminado es `404`.
   */
  async findVisible(
    actor: CustomerActor,
    customerId: string,
    options: { readonly includeDeleted?: boolean; readonly tx?: TransactionContext; readonly scopes?: CustomerAccessScopes } = {},
  ): Promise<VisibleCustomer> {
    // Con `scopes` ya resueltos no se consulta el perfil de acceso: dentro de una
    // transacción que sostiene bloqueos no se abre otra conexión del pool (AGENTS §9.12).
    const scopes = options.scopes ?? (await this.actors.accessScopes(actor));
    const includeDeleted = (options.includeDeleted ?? false) && actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
    const record = await this.customers.findById(customerId, { visibility: scopes.visibility, includeDeleted }, options.tx);
    if (!record) {
      throw customerNotFound(customerId);
    }
    return toVisibleCustomer(record, scopes);
  }
}
