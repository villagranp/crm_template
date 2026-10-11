import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';

import type { CustomerDuplicateRuleKey } from '../duplicate-rules';

export const CUSTOMERS_REPOSITORY = Symbol('CUSTOMERS_REPOSITORY');

/** Campos de orden de la búsqueda (lista blanca, 02 F.2). */
export const CUSTOMER_SORT_FIELDS = [
  'crmCode',
  'customerCode',
  'legalName',
  'city',
  'country',
  'status',
  'salesOwner',
  'createdAt',
  'updatedAt',
] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

/**
 * Visibilidad de clientes (02 H.1, RN-02.18): alcance directo sobre
 * `sales_owner_id`/`country_id` **o** herencia por un proyecto no eliminado que
 * el actor ve (DM-13), evaluada con el alcance de proyectos.
 */
export interface CustomerVisibility {
  /** Alcance de `clientes.ver`. */
  readonly direct: VisibilityScope;
  /** Alcance de `proyectos.ver` sobre `projects.owner_id`/`country_id` (herencia, DM-13). */
  readonly inherited: VisibilityScope;
}

export interface CatalogValueRef {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  /** El elemento del catálogo sigue activo (un valor ya desactivado se conserva en registros viejos). */
  readonly isActive: boolean;
}

export interface CustomerStatusRef extends CatalogValueRef {
  /** Semántica `metadata.isActive` de `crm.estado_cliente`: el cliente cuenta como activo (RN-02.21). */
  readonly countsAsActive: boolean;
}

export interface CountryRecord {
  readonly id: string;
  readonly isoCode: string;
  readonly name: string;
  readonly phonePrefix: string | null;
  readonly taxIdLabel: string;
  readonly taxIdPattern: string | null;
  readonly phonePattern: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface UserRef {
  readonly id: string;
  readonly displayName: string;
}

/** Cliente completo para la ficha y las mutaciones. Nunca sale tal cual por la API: se mapea a DTO. */
export interface CustomerRecord {
  readonly id: string;
  readonly crmCode: string;
  readonly customerCode: string | null;
  readonly customerCodeNormalized: string | null;
  readonly legalName: string;
  readonly legalNameNormalized: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly taxIdNormalized: string | null;
  readonly country: CountryRecord;
  readonly city: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly companyType: CatalogValueRef | null;
  readonly status: CustomerStatusRef;
  readonly rating: CatalogValueRef | null;
  readonly salesOwner: UserRef & { readonly isActive: boolean };
  readonly primaryContact: { readonly id: string; readonly firstName: string; readonly lastName: string } | null;
  readonly sourceImport: { readonly id: string; readonly code: string } | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly createdBy: UserRef | null;
  readonly updatedAt: Date;
  readonly updatedBy: UserRef | null;
}

/** Fila de la búsqueda (02 F.3 `CustomerListItemDto`). */
export interface CustomerListRecord {
  readonly id: string;
  readonly crmCode: string;
  readonly customerCode: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly country: { readonly id: string; readonly isoCode: string; readonly name: string };
  readonly city: string | null;
  readonly status: { readonly id: string; readonly code: string; readonly label: string; readonly countsAsActive: boolean };
  readonly rating: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly salesOwner: UserRef;
  readonly salesOwnerId: string;
  readonly countryId: string;
  readonly isDeleted: boolean;
  readonly updatedAt: Date;
}

/**
 * Criterios de búsqueda ya normalizados por el servicio (RN-02.17, D-02.14). El
 * adaptador solo los traduce a condiciones parametrizadas.
 */
export interface CustomerSearchCriteria extends PageRequest {
  readonly sortBy: CustomerSortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Búsqueda libre: cada término debe estar contenido en la razón social o el nombre comercial normalizados… */
  readonly searchTerms: readonly string[];
  /** …o el texto completo es prefijo del código CRM (sin distinguir mayúsculas)… */
  readonly searchCrmCodePrefix: string | null;
  /** …o prefijo del código de cliente normalizado… */
  readonly searchCustomerCodePrefix: string | null;
  /** …o prefijo del NIT normalizado. */
  readonly searchTaxIdPrefix: string | null;
  readonly customerCodePrefix: string | null;
  readonly crmCodePrefix: string | null;
  /** Contenido en `legal_name_normalized`. */
  readonly legalNameContains: string | null;
  readonly countryId: string | null;
  /** Contenido en la ciudad normalizada (DM-19). */
  readonly cityContains: string | null;
  readonly statusId: string | null;
  readonly salesOwnerId: string | null;
  /** Solo estados con `metadata.isActive = true`. */
  readonly activeOnly: boolean;
  /** `true` = solo eliminados; `false` = solo no eliminados. */
  readonly deleted: boolean;
}

export interface CreateCustomerInput {
  readonly crmCode: string;
  readonly customerCode: string | null;
  readonly customerCodeNormalized: string | null;
  readonly legalName: string;
  readonly legalNameNormalized: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly taxIdNormalized: string | null;
  readonly countryId: string;
  readonly city: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly companyTypeId: string | null;
  readonly statusId: string;
  readonly ratingId: string | null;
  readonly salesOwnerId: string;
  readonly sourceImportId: string | null;
  readonly createdById: string | null;
}

/** Cambios de una edición: solo los campos presentes se escriben. */
export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, 'crmCode' | 'sourceImportId' | 'createdById'>> & {
  readonly updatedById: string | null;
};

/** Datos de un candidato a duplicado (02 F.3), con su alcance ya evaluado. */
export interface CustomerDuplicateCandidate {
  readonly id: string;
  readonly crmCode: string;
  readonly customerCode: string | null;
  readonly legalName: string;
  readonly country: { readonly isoCode: string; readonly name: string };
  readonly salesOwnerName: string;
  readonly isDeleted: boolean;
  /** Visible para el actor por el predicado de H.1 (sin considerar si está eliminado). */
  readonly isInScope: boolean;
}

export interface CustomerDuplicateRow {
  readonly rules: readonly CustomerDuplicateRuleKey[];
  readonly candidate: CustomerDuplicateCandidate;
}

/**
 * Valores normalizados a comparar, todos en el mismo país (D-02.4). Solo se
 * buscan las claves presentes (no `undefined`) y no nulas.
 */
export interface CustomerDuplicateProbe {
  readonly countryId: string;
  readonly excludeCustomerId: string | null;
  readonly razonSocialNormalizada?: string | null;
  readonly nombreComercialNormalizado?: string | null;
  readonly correo?: string | null;
  readonly telefono?: string | null;
  readonly nit?: string | null;
}

export interface CustomerCodeHolder {
  readonly id: string;
  readonly crmCode: string;
  readonly isDeleted: boolean;
  readonly isInScope: boolean;
}

export interface CustomerDependencyCounts {
  readonly projects: number;
  readonly openActivities: number;
  readonly pendingVisits: number;
}

/** Usuarios que el actor puede asignar como responsable (D-02.2): todos, o por id / país. */
export type SalesOwnerAssignableSet =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'FILTERED'; readonly userIds: readonly string[]; readonly countryIds: readonly string[] };

export interface SalesOwnerOptionRecord {
  readonly id: string;
  readonly displayName: string;
  readonly employeeCode: string | null;
  readonly country: { readonly id: string; readonly name: string } | null;
}

export interface SalesOwnerSearch extends PageRequest {
  readonly search: string | null;
  readonly assignable: SalesOwnerAssignableSet;
  /** Permiso que debe tener efectivo el responsable (`clientes.ver`, D-02.2). */
  readonly requiredPermission: string;
}

/** Cómo identifica la entrada a un usuario: id (pantalla) o código de colaborador / correo (importación, D-02.17). */
export type UserLookup = { readonly by: 'id'; readonly value: string } | { readonly by: 'naturalKey'; readonly value: string };

export type CountryLookup = { readonly by: 'id' | 'isoCode'; readonly value: string };

/** Fila de `customer_code` ocupada por otro cliente al insertar o actualizar (carrera con el índice único). */
export class CustomerCodeConflictError extends Error {
  constructor() {
    super('customer code unique constraint violated');
    this.name = 'CustomerCodeConflictError';
  }
}

/**
 * Persistencia de clientes (02 L.1). Sin reglas de negocio: la visibilidad que
 * recibe ya está resuelta (`VisibilityScopeResolver`) y los valores llegan normalizados.
 */
export interface CustomersRepository {
  search(criteria: CustomerSearchCriteria, visibility: CustomerVisibility): Promise<Page<CustomerListRecord>>;
  /**
   * Cliente por id. Con `visibility`, `null` si no lo ve (H.1); sin ella, sin filtro
   * (uso interno tras una mutación). `includeDeleted` = admite eliminados.
   */
  findById(
    customerId: string,
    options: { readonly visibility: CustomerVisibility | null; readonly includeDeleted: boolean },
    tx?: TransactionContext,
  ): Promise<CustomerRecord | null>;
  findDuplicateCandidates(
    probe: CustomerDuplicateProbe,
    visibility: CustomerVisibility,
    tx?: TransactionContext,
  ): Promise<CustomerDuplicateRow[]>;
  /**
   * Cliente que ya tiene el código normalizado, incluidos los eliminados.
   * `countryId = null` busca en todos los países (`unicidad_codigo = GLOBAL`).
   */
  findCustomerCodeHolder(
    customerCodeNormalized: string,
    scope: { readonly countryId: string | null; readonly excludeCustomerId: string | null },
    visibility: CustomerVisibility,
    tx?: TransactionContext,
  ): Promise<CustomerCodeHolder | null>;
  /** Bloqueo consultivo por código normalizado (RN-02.13 con `GLOBAL`). Requiere `tx`. */
  lockCustomerCode(customerCodeNormalized: string, tx: TransactionContext): Promise<void>;
  /** Inserta y devuelve el id. Lanza `CustomerCodeConflictError` si el índice único rechaza el código. */
  create(input: CreateCustomerInput, tx: TransactionContext): Promise<string>;
  /** Lanza `CustomerCodeConflictError` si el índice único rechaza el código. */
  update(customerId: string, input: UpdateCustomerInput, tx: TransactionContext): Promise<void>;
  softDelete(customerId: string, actorId: string | null): Promise<void>;
  restore(customerId: string, actorId: string | null, tx?: TransactionContext): Promise<void>;
  countDependencies(customerId: string): Promise<CustomerDependencyCounts>;
  findCountry(lookup: CountryLookup, tx?: TransactionContext): Promise<CountryRecord | null>;
  listActiveCountries(): Promise<CountryRecord[]>;
  /**
   * Id del usuario identificado, solo si es responsable elegible (D-02.2):
   * `ACTIVE`, no eliminado, con `requiredPermission` efectivo y dentro de `assignable`.
   */
  findEligibleSalesOwner(
    lookup: UserLookup,
    assignable: SalesOwnerAssignableSet,
    requiredPermission: string,
    tx?: TransactionContext,
  ): Promise<string | null>;
  listEligibleSalesOwners(search: SalesOwnerSearch): Promise<Page<SalesOwnerOptionRecord>>;
}
