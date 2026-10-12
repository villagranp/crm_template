import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

export const CONTACTS_REPOSITORY = Symbol('CONTACTS_REPOSITORY');

/** Campos de orden de la lista de contactos (02 F.4). */
export const CONTACT_SORT_FIELDS = ['lastName', 'firstName', 'jobTitle', 'createdAt'] as const;
export type ContactSortField = (typeof CONTACT_SORT_FIELDS)[number];

export const CONTACT_STATUS_FILTERS = ['ACTIVE', 'INACTIVE', 'ALL'] as const;
export type ContactStatusFilter = (typeof CONTACT_STATUS_FILTERS)[number];

/** Contacto tal como lo ve quien tiene `contactos.ver` (PII: nunca va a logs). */
export interface ContactRecord {
  readonly id: string;
  readonly customerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly emailNormalized: string | null;
  readonly isActive: boolean;
  /** Derivado de `customers.primary_contact_id` (00 §2.5). */
  readonly isPrimary: boolean;
  readonly comments: string | null;
  /** Referenciado por `interaction_participants` (RN-02.27). */
  readonly hasHistory: boolean;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ListContactsCriteria extends PageRequest {
  readonly sortBy: ContactSortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Contiene, sin distinguir mayúsculas, en nombre, apellidos, correo o cargo. */
  readonly search: string | null;
  readonly status: ContactStatusFilter;
  /** `true` = solo eliminados (D-02.6); `false` = solo no eliminados. */
  readonly deleted: boolean;
}

export interface CreateContactInput {
  readonly customerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly emailNormalized: string | null;
  readonly isActive: boolean;
  readonly comments: string | null;
  readonly createdById: string | null;
}

export type UpdateContactInput = Partial<Omit<CreateContactInput, 'customerId' | 'createdById'>> & {
  readonly updatedById: string | null;
};

/** Candidato a duplicado de contacto: siempre del mismo cliente, que el actor ya ve. */
export interface ContactDuplicateCandidate {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
  readonly isDeleted: boolean;
}

export interface ContactDuplicateRow {
  readonly rules: readonly ('nombreCompleto' | 'telefono')[];
  readonly candidate: ContactDuplicateCandidate;
}

/** Valores normalizados a comparar dentro del cliente. Solo se buscan las claves presentes y no nulas. */
export interface ContactDuplicateProbe {
  readonly customerId: string;
  readonly excludeContactId: string | null;
  /** `normalizeName(nombre + ' ' + apellidos)`. */
  readonly nombreCompleto?: string | null;
  /** Solo dígitos. */
  readonly telefono?: string | null;
}

export interface ContactEmailHolder {
  readonly id: string;
  readonly isDeleted: boolean;
}

/** El índice `uq_contacts_customer_email` rechazó el correo (carrera entre dos altas). */
export class ContactEmailConflictError extends Error {
  constructor() {
    super('contact email unique constraint violated');
    this.name = 'ContactEmailConflictError';
  }
}

/**
 * Persistencia de contactos y del contacto principal (02 L.1). Todo se acota al
 * cliente: un contacto de otro cliente no existe bajo este.
 */
export interface ContactsRepository {
  list(customerId: string, criteria: ListContactsCriteria): Promise<Page<ContactRecord>>;
  findById(
    customerId: string,
    contactId: string,
    options: { readonly includeDeleted: boolean },
    tx?: TransactionContext,
  ): Promise<ContactRecord | null>;
  /** Contacto (incluidos eliminados) que ya usa el correo normalizado en el cliente. */
  findEmailHolder(
    customerId: string,
    emailNormalized: string,
    excludeContactId: string | null,
    tx?: TransactionContext,
  ): Promise<ContactEmailHolder | null>;
  findDuplicateCandidates(probe: ContactDuplicateProbe, tx?: TransactionContext): Promise<ContactDuplicateRow[]>;
  /** Lanza `ContactEmailConflictError` si el índice único rechaza el correo. */
  create(input: CreateContactInput, tx: TransactionContext): Promise<string>;
  /** Lanza `ContactEmailConflictError` si el índice único rechaza el correo. */
  update(customerId: string, contactId: string, input: UpdateContactInput, tx: TransactionContext): Promise<void>;
  /**
   * Bloquea la fila del cliente (`FOR UPDATE`) y devuelve su principal actual, o
   * `null` si el cliente no existe o está eliminado. Toda operación que toca el
   * principal lo llama primero en su transacción (RN-02.26: como máximo un principal activo).
   */
  lockCustomerPrimary(customerId: string, tx: TransactionContext): Promise<{ readonly primaryContactId: string | null } | null>;
  /**
   * Bloquea la fila del contacto (`FOR UPDATE` o `FOR SHARE`). `FOR UPDATE` espera a
   * quien esté insertando una participación que lo referencia (RN-02.27). `false`
   * si no existe en el cliente.
   */
  lockContactRow(customerId: string, contactId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext): Promise<boolean>;
  /**
   * Fija `customers.primary_contact_id` solo si el contacto es del cliente, está
   * activo y no eliminado; `false` si no se cumplió. La FK compuesta impide un contacto de otro cliente.
   */
  setPrimary(customerId: string, contactId: string, actorId: string | null, tx: TransactionContext): Promise<boolean>;
  /** Limpia el principal solo si sigue siendo `contactId`; `null` = cualquiera. `true` si limpió. */
  clearPrimary(customerId: string, contactId: string | null, actorId: string | null, tx: TransactionContext): Promise<boolean>;
  softDelete(customerId: string, contactId: string, actorId: string | null, tx: TransactionContext): Promise<void>;
  restore(customerId: string, contactId: string, actorId: string | null): Promise<void>;
  /** ¿Lo referencia `interaction_participants`? (RN-02.27). */
  hasHistory(contactId: string, tx?: TransactionContext): Promise<boolean>;
}
