/**
 * Política de acceso a clientes (02 H.2, RN-02.18–RN-02.25, DM-34, D-02.7, D-02.9).
 *
 * Pura y sin dependencias: decide qué puede hacer un actor sobre un cliente que
 * **ya sabe que ve** (la visibilidad, que da `404` si no se cumple, la resuelve el
 * repositorio con el predicado de H.1). La misma política calcula las
 * `capabilities` que devuelve la API y hace cumplir las operaciones: el frontend
 * solo oculta (alcance §9.2).
 *
 * Reglas:
 * - Editar: `clientes.editar` **y** (cliente propio, o ajeno con
 *   `clientes.administrar`), siempre con acceso `DIRECT`. Un cliente visible solo
 *   por herencia es de solo lectura (D-02.9). `administrar` sin `editar` no edita (F.1).
 * - Campos reservados (`customerCode`, `salesOwnerId`, `countryId`): solo con `administrar`.
 * - Eliminar / restaurar: `clientes.eliminar` y acceso `DIRECT`.
 * - Contactos (D-02.7): cliente propio, o ajeno en el alcance directo con
 *   `clientes.administrar`; más el permiso de contactos de la operación.
 * - Adjuntos: subir y eliminar como editar el cliente (RN-02.29).
 */

export const CUSTOMER_PERMISSIONS = {
  view: 'clientes.ver',
  create: 'clientes.crear',
  edit: 'clientes.editar',
  delete: 'clientes.eliminar',
  administer: 'clientes.administrar',
} as const;

export const CONTACT_PERMISSIONS = {
  view: 'contactos.ver',
  create: 'contactos.crear',
  edit: 'contactos.editar',
  delete: 'contactos.eliminar',
} as const;

/** Campos de la edición que cualquier editor puede cambiar. */
export const CUSTOMER_EDITABLE_FIELDS = [
  'legalName',
  'tradeName',
  'taxId',
  'city',
  'address',
  'phone',
  'email',
  'companyTypeId',
  'statusId',
  'ratingId',
] as const;

/** Campos que exigen `clientes.administrar` (H.2, DM-18, DM-34, D-02.5). */
export const CUSTOMER_RESERVED_FIELDS = ['customerCode', 'salesOwnerId', 'countryId'] as const;

export type CustomerEditableField = (typeof CUSTOMER_EDITABLE_FIELDS)[number] | (typeof CUSTOMER_RESERVED_FIELDS)[number];

/** `DIRECT`: por su propio alcance; `INHERITED`: solo por un proyecto visible del cliente (DM-13). */
export type CustomerAccess = 'DIRECT' | 'INHERITED';

export interface CustomerPolicyActor {
  /** Usuario local; `null` = sin cuenta local (no es dueño de nada). */
  readonly userId: string | null;
  readonly permissions: ReadonlySet<string>;
}

export interface CustomerPolicySubject {
  readonly salesOwnerId: string;
  readonly access: CustomerAccess;
  readonly isDeleted: boolean;
}

export interface CustomerCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canRestore: boolean;
  readonly canManageAttachments: boolean;
  readonly canManageContacts: boolean;
  readonly canReassignOwner: boolean;
  readonly editableFields: readonly CustomerEditableField[];
}

function isOwner(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  return actor.userId !== null && customer.salesOwnerId === actor.userId;
}

function isDirectAndAlive(customer: CustomerPolicySubject): boolean {
  return customer.access === 'DIRECT' && !customer.isDeleted;
}

/** ¿Puede editar campos no reservados del cliente? */
export function canEditCustomer(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  if (!isDirectAndAlive(customer) || !actor.permissions.has(CUSTOMER_PERMISSIONS.edit)) return false;
  return isOwner(actor, customer) || actor.permissions.has(CUSTOMER_PERMISSIONS.administer);
}

/** ¿Puede editar además los campos reservados (código, responsable, país)? */
export function canAdministerCustomer(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  return canEditCustomer(actor, customer) && actor.permissions.has(CUSTOMER_PERMISSIONS.administer);
}

/** Permiso que falta para editar, para el `403 PERMISSION_DENIED`. */
export function missingEditPermission(actor: CustomerPolicyActor, customer: CustomerPolicySubject): string {
  if (!actor.permissions.has(CUSTOMER_PERMISSIONS.edit) || isOwner(actor, customer)) return CUSTOMER_PERMISSIONS.edit;
  return CUSTOMER_PERMISSIONS.administer;
}

export function canDeleteCustomer(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  return isDirectAndAlive(customer) && actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
}

export function canRestoreCustomer(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  return customer.isDeleted && customer.access === 'DIRECT' && actor.permissions.has(CUSTOMER_PERMISSIONS.delete);
}

/**
 * ¿El cliente admite cambios en sus contactos por este actor (D-02.7)? No incluye
 * el permiso de contactos de la operación, que se comprueba aparte.
 */
export function isCustomerWritableForContacts(actor: CustomerPolicyActor, customer: CustomerPolicySubject): boolean {
  if (!isDirectAndAlive(customer)) return false;
  return isOwner(actor, customer) || actor.permissions.has(CUSTOMER_PERMISSIONS.administer);
}

/** Campos editables del cliente para este actor (vacío si no puede editar). */
export function editableCustomerFields(actor: CustomerPolicyActor, customer: CustomerPolicySubject): CustomerEditableField[] {
  if (!canEditCustomer(actor, customer)) return [];
  return canAdministerCustomer(actor, customer)
    ? [...CUSTOMER_EDITABLE_FIELDS, ...CUSTOMER_RESERVED_FIELDS]
    : [...CUSTOMER_EDITABLE_FIELDS];
}

export function customerCapabilities(actor: CustomerPolicyActor, customer: CustomerPolicySubject): CustomerCapabilities {
  const canEdit = canEditCustomer(actor, customer);
  const contactsWritable = isCustomerWritableForContacts(actor, customer);
  return {
    canEdit,
    canDelete: canDeleteCustomer(actor, customer),
    canRestore: canRestoreCustomer(actor, customer),
    canManageAttachments: canEdit,
    canManageContacts:
      contactsWritable &&
      (actor.permissions.has(CONTACT_PERMISSIONS.create) || actor.permissions.has(CONTACT_PERMISSIONS.edit)),
    canReassignOwner: canAdministerCustomer(actor, customer),
    editableFields: editableCustomerFields(actor, customer),
  };
}

/**
 * Responsable propuesto en el alta (RN-02.11): sin `clientes.administrar`, solo el
 * propio actor. `true` si el actor puede asignar ese responsable.
 */
export function canAssignSalesOwner(actor: CustomerPolicyActor, salesOwnerId: string): boolean {
  return actor.permissions.has(CUSTOMER_PERMISSIONS.administer) || (actor.userId !== null && actor.userId === salesOwnerId);
}
