import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { CustomerDuplicateRuleKey } from '@/modules/customers/duplicate-rules';
import {
  type CountryLookup,
  type CountryRecord,
  type CreateCustomerInput,
  CustomerCodeConflictError,
  type CustomerCodeHolder,
  type CustomerDependencyCounts,
  type CustomerDuplicateProbe,
  type CustomerDuplicateRow,
  type CustomerListRecord,
  type CustomerRecord,
  type CustomerSearchCriteria,
  type CustomerSortField,
  type CustomersRepository,
  type CustomerVisibility,
  type SalesOwnerAssignableSet,
  type SalesOwnerOptionRecord,
  type SalesOwnerSearch,
  type UpdateCustomerInput,
  type UserLookup,
} from '@/modules/customers/ports/customers.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, isEmptyScope, normalizedTextSql, orSql, visibilityScopeSql } from '../sql-text';

import { eligibleUserWhere } from './user-eligibility';

const UNIQUE_VIOLATION = 'P2002';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_ALIAS = /^[a-z][a-z0-9_]*$/;
/** Tope de candidatos a duplicado por consulta: el aviso no necesita más (y `acknowledgedDuplicateIds` admite 50). */
const MAX_DUPLICATE_CANDIDATES = 50;
const CUSTOMER_CODE_LOCK_PREFIX = 'crm:customer-code:';

// ---------------------------------------------------------------------------
// Predicado de visibilidad de clientes (02 H.1, D-02.12)
// ---------------------------------------------------------------------------

function alias(name: string): Prisma.Sql {
  if (!SQL_ALIAS.test(name)) {
    throw new Error(`Invalid SQL alias: ${name}`);
  }
  return Prisma.raw(name);
}

/**
 * Predicado SQL de visibilidad de clientes (02 H.1) sobre el alias `customerAlias`
 * de `customers`. **No** incluye el filtro de eliminados: lo añade cada consulta.
 *
 * ```text
 * scope = ALL
 * OR sales_owner_id IN (:ownerIds) OR country_id IN (:countryIds)          (alcance directo)
 * OR EXISTS (proyecto no eliminado del cliente dentro del alcance de proyectos)   (herencia, DM-13)
 * ```
 *
 * Exportado para los modelos de lectura de Inicio y Reportes (D-02.12): deben
 * filtrar clientes exactamente igual que este módulo.
 */
export function customerVisibilitySql(customerAlias: string, visibility: CustomerVisibility): Prisma.Sql {
  const c = alias(customerAlias);
  if (visibility.direct.kind === 'ALL') return Prisma.sql`TRUE`;
  const direct = visibilityScopeSql(visibility.direct, Prisma.sql`${c}.sales_owner_id`, Prisma.sql`${c}.country_id`);
  if (isEmptyScope(visibility.inherited)) return direct;
  const projectScope = visibilityScopeSql(visibility.inherited, Prisma.sql`p.owner_id`, Prisma.sql`p.country_id`);
  return Prisma.sql`(${direct} OR EXISTS (
    SELECT 1 FROM projects p
    WHERE p.customer_id = ${c}.id AND p.deleted_at IS NULL AND ${projectScope}
  ))`;
}

/** Mismo predicado que `customerVisibilitySql`, como filtro de Prisma (consultas por id). */
export function customerVisibilityWhere(visibility: CustomerVisibility): Prisma.CustomerWhereInput {
  const { direct, inherited } = visibility;
  if (direct.kind === 'ALL') return {};
  const alternatives: Prisma.CustomerWhereInput[] = [
    { salesOwnerId: { in: [...direct.ownerIds] } },
    { countryId: { in: [...direct.countryIds] } },
  ];
  if (!isEmptyScope(inherited)) {
    const projectScope: Prisma.ProjectWhereInput =
      inherited.kind === 'ALL'
        ? {}
        : { OR: [{ ownerId: { in: [...inherited.ownerIds] } }, { countryId: { in: [...inherited.countryIds] } }] };
    alternatives.push({ projects: { some: { deletedAt: null, ...projectScope } } });
  }
  return { OR: alternatives };
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

const CUSTOMER_INCLUDE = {
  country: true,
  companyType: { select: { id: true, code: true, label: true, isActive: true } },
  status: { select: { id: true, code: true, label: true, isActive: true, metadata: true } },
  rating: { select: { id: true, code: true, label: true, isActive: true } },
  salesOwner: { select: { id: true, displayName: true, status: true, deletedAt: true } },
  primaryContact: { select: { id: true, firstName: true, lastName: true } },
  sourceImport: { select: { id: true, code: true } },
} satisfies Prisma.CustomerInclude;

type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;
type CountryRow = Prisma.CountryGetPayload<object>;

/** `metadata.isActive` de un estado de cliente (00 §3.3). */
function countsAsActive(metadata: Prisma.JsonValue | null): boolean {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) && metadata['isActive'] === true;
}

function toCountryRecord(row: CountryRow): CountryRecord {
  return {
    id: row.id,
    isoCode: row.isoCode,
    name: row.name,
    phonePrefix: row.phonePrefix,
    taxIdLabel: row.taxIdLabel,
    taxIdPattern: row.taxIdPattern,
    phonePattern: row.phonePattern,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function toCustomerRecord(row: CustomerRow, names: ReadonlyMap<string, string>): CustomerRecord {
  const userRef = (id: string | null): { id: string; displayName: string } | null => {
    const displayName = id ? names.get(id) : undefined;
    return id && displayName !== undefined ? { id, displayName } : null;
  };
  return {
    id: row.id,
    crmCode: row.crmCode,
    customerCode: row.customerCode,
    customerCodeNormalized: row.customerCodeNormalized,
    legalName: row.legalName,
    legalNameNormalized: row.legalNameNormalized,
    tradeName: row.tradeName,
    taxId: row.taxId,
    taxIdNormalized: row.taxIdNormalized,
    country: toCountryRecord(row.country),
    city: row.city,
    address: row.address,
    phone: row.phone,
    email: row.email,
    companyType: row.companyType,
    status: {
      id: row.status.id,
      code: row.status.code,
      label: row.status.label,
      isActive: row.status.isActive,
      countsAsActive: countsAsActive(row.status.metadata),
    },
    rating: row.rating,
    salesOwner: {
      id: row.salesOwner.id,
      displayName: row.salesOwner.displayName,
      isActive: row.salesOwner.status === 'ACTIVE' && row.salesOwner.deletedAt === null,
    },
    primaryContact: row.primaryContact,
    sourceImport: row.sourceImport,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    createdBy: userRef(row.createdById),
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedById),
  };
}

/** Columna de orden de cada campo de la lista blanca (F.2). Solo SQL fijo. */
const SORT_COLUMNS: Readonly<Record<CustomerSortField, string>> = {
  crmCode: 'c.crm_code',
  customerCode: 'c.customer_code_normalized',
  legalName: 'c.legal_name_normalized',
  city: 'lower(c.city)',
  country: 'co.name',
  status: 'st.label',
  salesOwner: 'lower(u.display_name)',
  createdAt: 'c.created_at',
  updatedAt: 'c.updated_at',
};

interface CustomerListRow {
  id: string;
  crm_code: string;
  customer_code: string | null;
  legal_name: string;
  trade_name: string | null;
  city: string | null;
  country_id: string;
  sales_owner_id: string;
  deleted_at: Date | null;
  updated_at: Date;
  country_iso_code: string;
  country_name: string;
  status_id: string;
  status_code: string;
  status_label: string;
  status_counts_active: boolean;
  rating_id: string | null;
  rating_code: string | null;
  rating_label: string | null;
  sales_owner_name: string;
}

interface DuplicateSqlRow {
  id: string;
  crm_code: string;
  customer_code: string | null;
  legal_name: string;
  country_iso_code: string;
  country_name: string;
  sales_owner_name: string;
  deleted_at: Date | null;
  in_scope: boolean;
  m_razon: boolean;
  m_comercial: boolean;
  m_correo: boolean;
  m_telefono: boolean;
  m_nit: boolean;
}

function like(value: string, mode: 'contains' | 'prefix'): string {
  const escaped = escapeLikePattern(value);
  return mode === 'contains' ? `%${escaped}%` : `${escaped}%`;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

/** El `P2002` viene del índice `uq_customers_country_customer_code` (y no de `crm_code`). */
function isCustomerCodeViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.['target'];
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('customer_code') || text.includes('customerCode');
}

/** Usuario elegible como responsable (D-02.2): ACTIVE, no eliminado, permiso efectivo y dentro del conjunto asignable. */
function eligibleSalesOwnerWhere(requiredPermission: string, assignable: SalesOwnerAssignableSet, now: Date): Prisma.UserWhereInput {
  return eligibleUserWhere([requiredPermission], assignable, now);
}

/**
 * Adaptador Prisma de clientes (02 L.1, ADR-004). Sin reglas de negocio: aplica el
 * predicado de visibilidad que recibe y escribe lo que el servicio ya validó.
 * Las búsquedas son SQL parametrizado (nunca concatenado) porque necesitan
 * comparar texto normalizado en columnas sin copia normalizada.
 */
@Injectable()
export class PrismaCustomersRepository implements CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: CustomerSearchCriteria, visibility: CustomerVisibility): Promise<Page<CustomerListRecord>> {
    const where = andSql(this.searchConditions(criteria, visibility));
    const direction = criteria.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = Prisma.raw(`${SORT_COLUMNS[criteria.sortBy]} ${direction} NULLS LAST, c.id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<CustomerListRow[]>`
        SELECT c.id, c.crm_code, c.customer_code, c.legal_name, c.trade_name, c.city, c.country_id, c.sales_owner_id,
               c.deleted_at, c.updated_at,
               co.iso_code AS country_iso_code, co.name AS country_name,
               st.id AS status_id, st.code AS status_code, st.label AS status_label,
               COALESCE(st.metadata->>'isActive' = 'true', FALSE) AS status_counts_active,
               ra.id AS rating_id, ra.code AS rating_code, ra.label AS rating_label,
               u.display_name AS sales_owner_name
        FROM customers c
        JOIN countries co ON co.id = c.country_id
        JOIN catalog_items st ON st.id = c.status_id
        LEFT JOIN catalog_items ra ON ra.id = c.rating_id
        JOIN users u ON u.id = c.sales_owner_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM customers c
        JOIN catalog_items st ON st.id = c.status_id
        WHERE ${where}`,
    ]);

    const items: CustomerListRecord[] = rows.map((row) => ({
      id: row.id,
      crmCode: row.crm_code,
      customerCode: row.customer_code,
      legalName: row.legal_name,
      tradeName: row.trade_name,
      country: { id: row.country_id, isoCode: row.country_iso_code, name: row.country_name },
      city: row.city,
      status: { id: row.status_id, code: row.status_code, label: row.status_label, countsAsActive: row.status_counts_active },
      rating:
        row.rating_id && row.rating_code !== null && row.rating_label !== null
          ? { id: row.rating_id, code: row.rating_code, label: row.rating_label }
          : null,
      salesOwner: { id: row.sales_owner_id, displayName: row.sales_owner_name },
      salesOwnerId: row.sales_owner_id,
      countryId: row.country_id,
      isDeleted: row.deleted_at !== null,
      updatedAt: row.updated_at,
    }));
    return createPage(items, totals[0]?.total ?? 0, criteria);
  }

  private searchConditions(criteria: CustomerSearchCriteria, visibility: CustomerVisibility): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      criteria.deleted ? Prisma.sql`c.deleted_at IS NOT NULL` : Prisma.sql`c.deleted_at IS NULL`,
      customerVisibilitySql('c', visibility),
    ];

    const searchAlternatives: Prisma.Sql[] = [];
    if (criteria.searchTerms.length > 0) {
      const tradeName = normalizedTextSql(Prisma.sql`c.trade_name`);
      searchAlternatives.push(
        andSql(
          criteria.searchTerms.map((term) => {
            const pattern = like(term, 'contains');
            return Prisma.sql`(c.legal_name_normalized LIKE ${pattern} OR ${tradeName} LIKE ${pattern})`;
          }),
        ),
      );
    }
    if (criteria.searchCrmCodePrefix) {
      searchAlternatives.push(Prisma.sql`c.crm_code ILIKE ${like(criteria.searchCrmCodePrefix, 'prefix')}`);
    }
    if (criteria.searchCustomerCodePrefix) {
      searchAlternatives.push(Prisma.sql`c.customer_code_normalized LIKE ${like(criteria.searchCustomerCodePrefix, 'prefix')}`);
    }
    if (criteria.searchTaxIdPrefix) {
      searchAlternatives.push(Prisma.sql`c.tax_id_normalized LIKE ${like(criteria.searchTaxIdPrefix, 'prefix')}`);
    }
    if (searchAlternatives.length > 0) {
      conditions.push(orSql(searchAlternatives));
    }

    if (criteria.customerCodePrefix) {
      conditions.push(Prisma.sql`c.customer_code_normalized LIKE ${like(criteria.customerCodePrefix, 'prefix')}`);
    }
    if (criteria.crmCodePrefix) {
      conditions.push(Prisma.sql`c.crm_code ILIKE ${like(criteria.crmCodePrefix, 'prefix')}`);
    }
    if (criteria.legalNameContains) {
      conditions.push(Prisma.sql`c.legal_name_normalized LIKE ${like(criteria.legalNameContains, 'contains')}`);
    }
    if (criteria.countryId) {
      conditions.push(Prisma.sql`c.country_id = ${criteria.countryId}::uuid`);
    }
    if (criteria.cityContains) {
      conditions.push(Prisma.sql`${normalizedTextSql(Prisma.sql`c.city`)} LIKE ${like(criteria.cityContains, 'contains')}`);
    }
    if (criteria.statusId) {
      conditions.push(Prisma.sql`c.status_id = ${criteria.statusId}::uuid`);
    }
    if (criteria.salesOwnerId) {
      conditions.push(Prisma.sql`c.sales_owner_id = ${criteria.salesOwnerId}::uuid`);
    }
    if (criteria.activeOnly) {
      conditions.push(Prisma.sql`st.metadata->>'isActive' = 'true'`);
    }
    return conditions;
  }

  async findById(
    customerId: string,
    options: { readonly visibility: CustomerVisibility | null; readonly includeDeleted: boolean },
    tx?: TransactionContext,
  ): Promise<CustomerRecord | null> {
    if (!UUID_PATTERN.test(customerId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const row = await db.customer.findFirst({
      where: {
        id: customerId,
        ...(options.includeDeleted ? {} : { deletedAt: null }),
        ...(options.visibility ? customerVisibilityWhere(options.visibility) : {}),
      },
      include: CUSTOMER_INCLUDE,
    });
    if (!row) return null;
    const userIds = [row.createdById, row.updatedById].filter((id): id is string => id !== null);
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })
      : [];
    return toCustomerRecord(row, new Map(users.map((user) => [user.id, user.displayName])));
  }

  async findDuplicateCandidates(
    probe: CustomerDuplicateProbe,
    visibility: CustomerVisibility,
    tx?: TransactionContext,
  ): Promise<CustomerDuplicateRow[]> {
    const matchers: Partial<Record<CustomerDuplicateRuleKey, Prisma.Sql>> = {};
    if (probe.razonSocialNormalizada) {
      matchers.razonSocialNormalizada = Prisma.sql`c.legal_name_normalized = ${probe.razonSocialNormalizada}`;
    }
    if (probe.nombreComercialNormalizado) {
      matchers.nombreComercialNormalizado = Prisma.sql`${normalizedTextSql(Prisma.sql`c.trade_name`)} = ${probe.nombreComercialNormalizado}`;
    }
    if (probe.correo) {
      matchers.correo = Prisma.sql`lower(btrim(c.email)) = ${probe.correo}`;
    }
    if (probe.telefono) {
      matchers.telefono = Prisma.sql`regexp_replace(COALESCE(c.phone, ''), ${'\\D'}, '', 'g') = ${probe.telefono}`;
    }
    if (probe.nit) {
      matchers.nit = Prisma.sql`c.tax_id_normalized = ${probe.nit}`;
    }
    const active = Object.values(matchers);
    if (active.length === 0) return [];

    const column = (key: CustomerDuplicateRuleKey): Prisma.Sql => matchers[key] ?? Prisma.sql`FALSE`;
    const exclude = probe.excludeCustomerId ? Prisma.sql`AND c.id <> ${probe.excludeCustomerId}::uuid` : Prisma.empty;
    const db = prismaClientFor(this.prisma, tx);
    const rows = await db.$queryRaw<DuplicateSqlRow[]>`
      SELECT c.id, c.crm_code, c.customer_code, c.legal_name, c.deleted_at,
             co.iso_code AS country_iso_code, co.name AS country_name, u.display_name AS sales_owner_name,
             ${customerVisibilitySql('c', visibility)} AS in_scope,
             COALESCE(${column('razonSocialNormalizada')}, FALSE) AS m_razon,
             COALESCE(${column('nombreComercialNormalizado')}, FALSE) AS m_comercial,
             COALESCE(${column('correo')}, FALSE) AS m_correo,
             COALESCE(${column('telefono')}, FALSE) AS m_telefono,
             COALESCE(${column('nit')}, FALSE) AS m_nit
      FROM customers c
      JOIN countries co ON co.id = c.country_id
      JOIN users u ON u.id = c.sales_owner_id
      WHERE c.country_id = ${probe.countryId}::uuid ${exclude}
        AND ${orSql(active)}
      ORDER BY c.crm_code ASC
      LIMIT ${MAX_DUPLICATE_CANDIDATES}`;

    return rows.map((row) => {
      const rules: CustomerDuplicateRuleKey[] = [];
      if (row.m_razon) rules.push('razonSocialNormalizada');
      if (row.m_comercial) rules.push('nombreComercialNormalizado');
      if (row.m_correo) rules.push('correo');
      if (row.m_telefono) rules.push('telefono');
      if (row.m_nit) rules.push('nit');
      return {
        rules,
        candidate: {
          id: row.id,
          crmCode: row.crm_code,
          customerCode: row.customer_code,
          legalName: row.legal_name,
          country: { isoCode: row.country_iso_code, name: row.country_name },
          salesOwnerName: row.sales_owner_name,
          isDeleted: row.deleted_at !== null,
          isInScope: row.in_scope,
        },
      };
    });
  }

  async findCustomerCodeHolder(
    customerCodeNormalized: string,
    scope: { readonly countryId: string | null; readonly excludeCustomerId: string | null },
    visibility: CustomerVisibility,
    tx?: TransactionContext,
  ): Promise<CustomerCodeHolder | null> {
    const country = scope.countryId ? Prisma.sql`AND c.country_id = ${scope.countryId}::uuid` : Prisma.empty;
    const exclude = scope.excludeCustomerId ? Prisma.sql`AND c.id <> ${scope.excludeCustomerId}::uuid` : Prisma.empty;
    const db = prismaClientFor(this.prisma, tx);
    const rows = await db.$queryRaw<{ id: string; crm_code: string; deleted_at: Date | null; in_scope: boolean }[]>`
      SELECT c.id, c.crm_code, c.deleted_at, ${customerVisibilitySql('c', visibility)} AS in_scope
      FROM customers c
      WHERE c.customer_code_normalized = ${customerCodeNormalized} ${country} ${exclude}
      ORDER BY c.deleted_at NULLS FIRST, c.created_at ASC
      LIMIT 1`;
    const row = rows[0];
    return row ? { id: row.id, crmCode: row.crm_code, isDeleted: row.deleted_at !== null, isInScope: row.in_scope } : null;
  }

  async lockCustomerCode(customerCodeNormalized: string, tx: TransactionContext): Promise<void> {
    const db = prismaClientFor(this.prisma, tx);
    // Clave como parámetro, nunca concatenada en el SQL (ver advisory-lock.ts).
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CUSTOMER_CODE_LOCK_PREFIX + customerCodeNormalized}))`;
  }

  async create(input: CreateCustomerInput, tx: TransactionContext): Promise<string> {
    const db = prismaClientFor(this.prisma, tx);
    try {
      const created = await db.customer.create({ data: { ...input, updatedById: input.createdById }, select: { id: true } });
      return created.id;
    } catch (error) {
      if (isCustomerCodeViolation(error)) throw new CustomerCodeConflictError();
      throw error;
    }
  }

  async update(customerId: string, input: UpdateCustomerInput, tx: TransactionContext): Promise<void> {
    const db = prismaClientFor(this.prisma, tx);
    try {
      await db.customer.update({ where: { id: customerId }, data: input });
    } catch (error) {
      if (isCustomerCodeViolation(error)) throw new CustomerCodeConflictError();
      throw error;
    }
  }

  async softDelete(customerId: string, actorId: string | null, tx?: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).customer.update({
      where: { id: customerId },
      data: { deletedAt: new Date(), updatedById: actorId },
    });
  }

  async lockCustomerRow(customerId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext): Promise<boolean> {
    if (!UUID_PATTERN.test(customerId)) return false;
    const db = prismaClientFor(this.prisma, tx);
    const rows =
      mode === 'UPDATE'
        ? await db.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`
        : await db.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR SHARE`;
    return rows.length > 0;
  }

  async restore(customerId: string, actorId: string | null, tx?: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).customer.update({
      where: { id: customerId },
      data: { deletedAt: null, updatedById: actorId },
    });
  }

  async countDependencies(customerId: string, tx?: TransactionContext): Promise<CustomerDependencyCounts> {
    const projectWhere: Prisma.ProjectWhereInput = { customerId, deletedAt: null };
    const activityWhere: Prisma.ActivityWhereInput = {
      customerId,
      deletedAt: null,
      status: { metadata: { path: ['isOpen'], equals: true } },
    };
    // Las visitas no se eliminan (00 §5.2): cuenta toda visita en un estado pendiente.
    const visitWhere: Prisma.VisitWhereInput = { customerId, status: { metadata: { path: ['isPending'], equals: true } } };
    if (tx) {
      // Dentro de la transacción del llamador (eliminación con la fila del cliente bloqueada).
      const db = prismaClientFor(this.prisma, tx);
      const projects = await db.project.count({ where: projectWhere });
      const openActivities = await db.activity.count({ where: activityWhere });
      const pendingVisits = await db.visit.count({ where: visitWhere });
      return { projects, openActivities, pendingVisits };
    }
    const [projects, openActivities, pendingVisits] = await this.prisma.$transaction([
      this.prisma.project.count({ where: projectWhere }),
      this.prisma.activity.count({ where: activityWhere }),
      this.prisma.visit.count({ where: visitWhere }),
    ]);
    return { projects, openActivities, pendingVisits };
  }

  async findCountry(lookup: CountryLookup, tx?: TransactionContext): Promise<CountryRecord | null> {
    const db = prismaClientFor(this.prisma, tx);
    if (lookup.by === 'id') {
      if (!UUID_PATTERN.test(lookup.value)) return null;
      const row = await db.country.findUnique({ where: { id: lookup.value } });
      return row ? toCountryRecord(row) : null;
    }
    const row = await db.country.findUnique({ where: { isoCode: lookup.value.trim().toUpperCase() } });
    return row ? toCountryRecord(row) : null;
  }

  async listActiveCountries(): Promise<CountryRecord[]> {
    const rows = await this.prisma.country.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(toCountryRecord);
  }

  async findEligibleSalesOwner(
    lookup: UserLookup,
    assignable: SalesOwnerAssignableSet,
    requiredPermission: string,
    tx?: TransactionContext,
  ): Promise<string | null> {
    const db = prismaClientFor(this.prisma, tx);
    const eligible = eligibleSalesOwnerWhere(requiredPermission, assignable, new Date());
    if (lookup.by === 'id') {
      if (!UUID_PATTERN.test(lookup.value)) return null;
      const user = await db.user.findFirst({ where: { id: lookup.value, ...eligible }, select: { id: true } });
      return user?.id ?? null;
    }
    // D-02.17: código de colaborador y, si no hay coincidencia, correo.
    const value = lookup.value.trim();
    const byCode = await db.user.findFirst({ where: { employeeCode: value }, select: { id: true } });
    const byEmail = byCode ? null : await db.user.findFirst({ where: { emailNormalized: value.toLowerCase() }, select: { id: true } });
    const userId = byCode?.id ?? byEmail?.id;
    if (!userId) return null;
    const user = await db.user.findFirst({ where: { id: userId, ...eligible }, select: { id: true } });
    return user?.id ?? null;
  }

  async listEligibleSalesOwners(search: SalesOwnerSearch): Promise<Page<SalesOwnerOptionRecord>> {
    const term = search.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...eligibleSalesOwnerWhere(search.requiredPermission, search.assignable, new Date()),
      ...(term
        ? {
            OR: [
              { displayName: { contains: term, mode: 'insensitive' } },
              { employeeCode: { startsWith: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { id: true, displayName: true, employeeCode: true, country: { select: { id: true, name: true } } },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (search.page - 1) * search.pageSize,
        take: search.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return createPage(
      rows.map((row) => ({ id: row.id, displayName: row.displayName, employeeCode: row.employeeCode, country: row.country })),
      totalItems,
      search,
    );
  }
}
