/**
 * Puerto de **lectura** de la carga inicial por scripts: resuelve referencias por código (clientes,
 * usuarios, países, catálogos, unidades, familias) y consulta qué ya existe (proyectos, SKU,
 * minutos). **No escribe nada**: toda creación pasa por los servicios de aplicación existentes
 * (invariantes, folios, unicidad, visibilidad y auditoría). El adaptador Prisma vive en
 * `infrastructure/database/prisma/repositories/prisma-initial-data-lookup.repository.ts`.
 */

export const INITIAL_DATA_LOOKUP = Symbol('INITIAL_DATA_LOOKUP');

export interface LookupUser {
  readonly id: string;
  readonly email: string;
  readonly employeeCode: string | null;
  readonly status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  readonly isDeleted: boolean;
}

/** Identidad `ENTRA_ID` ya vinculada: a qué usuario pertenece cada `oid`. */
export interface LookupEntraIdentity {
  readonly userId: string;
  /** `oid` en minúsculas. */
  readonly subject: string;
}

export interface LookupCustomer {
  readonly id: string;
  readonly crmCode: string;
  readonly isDeleted: boolean;
}

export interface LookupReference {
  readonly id: string;
  readonly code: string;
  readonly isActive: boolean;
}

export interface LookupFamily extends LookupReference {
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
}

export interface LookupProduct {
  readonly sku: string;
  readonly description: string;
  readonly familyCode: string;
  readonly baseUnitCode: string;
}

export interface LookupExistingProject {
  readonly code: string;
  readonly customerId: string;
  /** Nombre en la forma comparable (`normalizeName`). */
  readonly nameNormalized: string;
}

/** Valores activos que lista la hoja «Valores válidos» de una plantilla generada desde la base. */
export interface TemplateValueSet {
  readonly countries: readonly { readonly code: string; readonly label: string }[];
  readonly projectTypes: readonly { readonly code: string; readonly label: string }[];
  readonly sectors: readonly { readonly code: string; readonly label: string }[];
  readonly units: readonly { readonly code: string; readonly label: string }[];
  readonly families: readonly { readonly code: string; readonly label: string }[];
}

export interface InitialDataLookup {
  /** Por correo normalizado (minúsculas) o por código de colaborador exacto. */
  findUsers(identifiers: { readonly emails: readonly string[]; readonly employeeCodes: readonly string[] }): Promise<LookupUser[]>;
  /** Por código CRM (`customers.crm_code`, único en todo el sistema). */
  findCustomersByCrmCode(crmCodes: readonly string[]): Promise<LookupCustomer[]>;
  /**
   * Identidades `ENTRA_ID` cuyo `oid` está en `subjects` **o** que pertenecen a alguno de `userIds`,
   * para decidir «ya existe», «otro `oid`» y «`oid` de otro usuario» (ADR-027).
   */
  findEntraIdentities(query: { readonly subjects: readonly string[]; readonly userIds: readonly string[] }): Promise<LookupEntraIdentity[]>;
  findCountriesByIso(isoCodes: readonly string[]): Promise<LookupReference[]>;
  findCatalogItems(catalogKey: string, codes: readonly string[]): Promise<LookupReference[]>;
  findFamilies(codes: readonly string[]): Promise<LookupFamily[]>;
  findUnits(codes: readonly string[]): Promise<LookupReference[]>;
  /** Productos ya registrados con esos SKU (para decidir «ya existe» y avisar si difieren). */
  findProducts(skus: readonly string[]): Promise<LookupProduct[]>;
  /** Proyectos con esos códigos, incluidos los eliminados (el código es único en toda la tabla). */
  findProjectsByCodes(codes: readonly string[]): Promise<LookupExistingProject[]>;
  /** Proyectos no eliminados de esos clientes, para decidir «ya existe» por cliente + nombre. */
  findProjectsOfCustomers(customerIds: readonly string[]): Promise<LookupExistingProject[]>;
  /** Fechas `AAAA-MM-DD` que ya tienen minuto de seguridad, entre las consultadas. */
  findExistingSafetyMinuteDates(dates: readonly string[]): Promise<string[]>;
  listTemplateValues(): Promise<TemplateValueSet>;
}
