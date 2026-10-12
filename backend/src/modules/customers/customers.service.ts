import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError, ResourceConflictError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';

import { type CustomerActor, CustomerActorResolver } from './customer-actor.resolver';
import {
  CONTACT_PERMISSIONS,
  type CustomerAccess,
  type CustomerCapabilities,
  canAdministerCustomer,
  canDeleteCustomer,
  canEditCustomer,
  canRestoreCustomer,
  CUSTOMER_PERMISSIONS,
  CUSTOMER_RESERVED_FIELDS,
  customerCapabilities,
  missingEditPermission,
} from './customer-access-policy';
import { CUSTOMER_AUDIT_EVENTS, CUSTOMER_AUDIT_RESOURCE, customerAuditState } from './customer-audit';
import { CustomerCreationService } from './customer-creation.service';
import { CUSTOMER_ERROR_CODES, customerCodeTakenError, customerNotFound, fieldNotEditableError } from './customer-errors';
import { normalizeCustomerCode, normalizeName, normalizeTaxId, searchTerms } from './customer-normalization';
import { assertCustomerOutcome } from './customer-outcome';
import { CUSTOMER_CATALOGS, type CustomerDraft, CustomerValidationService, type NormalizedCustomer } from './customer-validation.service';
import { customerAccessFor, CustomerVisibilityService, toVisibleCustomer, type VisibleCustomer } from './customer-visibility.service';
import {
  type CountryRecord,
  CustomerCodeConflictError,
  type CustomerListRecord,
  type CustomerRecord,
  CUSTOMERS_REPOSITORY,
  type CustomerSortField,
  type CustomersRepository,
  type SalesOwnerOptionRecord,
  type UpdateCustomerInput,
} from './ports/customers.repository.port';

/** Cliente con lo que la API necesita para pintarlo (02 F.3). */
export interface CustomerView {
  readonly record: CustomerRecord;
  readonly access: CustomerAccess;
  readonly capabilities: CustomerCapabilities;
  /** `primaryContact` solo se expone con `contactos.ver` (H.5). */
  readonly canSeeContacts: boolean;
}

export interface CustomerListItemView {
  readonly record: CustomerListRecord;
  readonly access: CustomerAccess;
}

export interface ListCustomersRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: CustomerSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly search?: string;
  readonly customerCode?: string;
  readonly crmCode?: string;
  readonly legalName?: string;
  readonly countryId?: string;
  readonly city?: string;
  readonly statusId?: string;
  readonly salesOwnerId?: string;
  readonly activeOnly?: boolean;
  readonly deleted?: boolean;
}

/** Cambios de la edición (F6): campo omitido = sin cambio; `null` = quitar un opcional. */
export interface UpdateCustomerRequest {
  readonly customerCode?: string | null;
  readonly legalName?: string;
  readonly tradeName?: string | null;
  readonly taxId?: string | null;
  readonly countryId?: string;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly companyTypeId?: string | null;
  readonly statusId?: string;
  readonly ratingId?: string | null;
  readonly salesOwnerId?: string;
  readonly acknowledgedDuplicateIds?: readonly string[];
}

export type CreateCustomerRequest = Omit<UpdateCustomerRequest, 'legalName' | 'countryId'> & {
  readonly legalName: string;
  readonly countryId: string;
};

export interface CatalogOption {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

export interface CustomerFormOptions {
  readonly countries: readonly CountryRecord[];
  readonly companyTypes: readonly CatalogOption[];
  readonly statuses: readonly (CatalogOption & { readonly isActive: boolean })[];
  readonly ratings: readonly CatalogOption[];
  readonly defaults: { readonly statusId: string | null; readonly companyTypeId: string | null; readonly ratingId: string | null };
  readonly requiredFields: readonly string[];
  readonly attachments: { readonly enabled: boolean; readonly maxMb: number; readonly allowedTypes: readonly string[] };
}

const NORMALIZED_UPDATE_FIELDS: readonly (keyof NormalizedCustomer)[] = [
  'customerCode',
  'customerCodeNormalized',
  'legalName',
  'legalNameNormalized',
  'tradeName',
  'taxId',
  'taxIdNormalized',
  'countryId',
  'city',
  'address',
  'phone',
  'email',
  'companyTypeId',
  'statusId',
  'ratingId',
  'salesOwnerId',
];

function currentNormalized(record: CustomerRecord): NormalizedCustomer {
  return {
    customerCode: record.customerCode,
    customerCodeNormalized: record.customerCodeNormalized,
    legalName: record.legalName,
    legalNameNormalized: record.legalNameNormalized,
    tradeName: record.tradeName,
    taxId: record.taxId,
    taxIdNormalized: record.taxIdNormalized,
    countryId: record.country.id,
    city: record.city,
    address: record.address,
    phone: record.phone,
    email: record.email,
    companyTypeId: record.companyType?.id ?? null,
    statusId: record.status.id,
    ratingId: record.rating?.id ?? null,
    salesOwnerId: record.salesOwner.id,
  };
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Borrador del validador a partir del DTO de la pantalla (modo `BY_ID`). */
export function draftFromRequest(request: UpdateCustomerRequest): CustomerDraft {
  return {
    customerCode: request.customerCode,
    legalName: request.legalName,
    tradeName: request.tradeName,
    taxId: request.taxId,
    country: request.countryId,
    city: request.city,
    address: request.address,
    phone: request.phone,
    email: request.email,
    companyType: request.companyTypeId,
    status: request.statusId,
    rating: request.ratingId,
    salesOwner: request.salesOwnerId,
  };
}

/**
 * Casos de uso de clientes de la pantalla (02 F1–F8): búsqueda, opciones,
 * ficha, alta (delegada en `CustomerCreationService`), edición, desactivación
 * (`PATCH { statusId }`), eliminación lógica y restauración.
 *
 * Orden de las comprobaciones: visibilidad (`404`) → política (`403`) →
 * validación (`422`) → unicidad y duplicados (`409`).
 */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly actors: CustomerActorResolver,
    private readonly visibleCustomers: CustomerVisibilityService,
    private readonly validation: CustomerValidationService,
    private readonly creation: CustomerCreationService,
    private readonly catalogs: CatalogLookupService,
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async list(actor: CustomerActor, request: ListCustomersRequest): Promise<Page<CustomerListItemView>> {
    if (request.deleted && !actor.permissions.has(CUSTOMER_PERMISSIONS.delete)) {
      // D-02.6: ver eliminados exige `clientes.eliminar`.
      throw new PermissionDeniedError(CUSTOMER_PERMISSIONS.delete);
    }
    const visibility = await this.actors.visibility(actor);
    const search = request.search?.trim() || null;
    const page = await this.customers.search(
      {
        page: request.page,
        pageSize: request.pageSize,
        sortBy: request.sortBy ?? 'legalName',
        sortOrder: request.sortOrder,
        searchTerms: searchTerms(search),
        searchCrmCodePrefix: search,
        searchCustomerCodePrefix: normalizeCustomerCode(search),
        searchTaxIdPrefix: normalizeTaxId(search),
        customerCodePrefix: normalizeCustomerCode(trimToNull(request.customerCode)),
        crmCodePrefix: trimToNull(request.crmCode),
        legalNameContains: normalizeName(request.legalName),
        countryId: request.countryId ?? null,
        cityContains: normalizeName(request.city),
        statusId: request.statusId ?? null,
        salesOwnerId: request.salesOwnerId ?? null,
        activeOnly: request.activeOnly ?? false,
        deleted: request.deleted ?? false,
      },
      visibility,
    );
    return {
      ...page,
      items: page.items.map((record) => ({ record, access: customerAccessFor(visibility, record) })),
    };
  }

  async formOptions(): Promise<CustomerFormOptions> {
    const [countries, companyTypes, statuses, ratings, defaults, requiredFields, limits] = await Promise.all([
      this.customers.listActiveCountries(),
      this.catalogs.findByKey(CUSTOMER_CATALOGS.companyType),
      this.catalogs.findByKey(CUSTOMER_CATALOGS.status),
      this.catalogs.findByKey(CUSTOMER_CATALOGS.rating),
      this.validation.defaultCatalogValues('BY_ID'),
      this.validation.requiredFieldNames(),
      this.attachments.limits(),
    ]);
    const activeItems = (catalog: typeof companyTypes): CatalogOption[] =>
      (catalog?.items ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({ id: item.id, code: item.code, label: item.label, sortOrder: item.sortOrder }));
    return {
      countries,
      companyTypes: activeItems(companyTypes),
      statuses: (statuses?.items ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          code: item.code,
          label: item.label,
          sortOrder: item.sortOrder,
          isActive: item.metadata?.['isActive'] === true,
        })),
      ratings: activeItems(ratings),
      defaults: {
        statusId: defaults.status ?? null,
        companyTypeId: defaults.companyType ?? null,
        ratingId: defaults.rating ?? null,
      },
      requiredFields,
      attachments: {
        enabled: true,
        maxMb: Math.floor(limits.maxBytes / (1024 * 1024)),
        allowedTypes: limits.allowedTypes,
      },
    };
  }

  async salesOwnerOptions(
    actor: CustomerActor,
    request: { page: number; pageSize: number; search?: string },
  ): Promise<Page<SalesOwnerOptionRecord>> {
    return this.customers.listEligibleSalesOwners({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search?.trim() || null,
      assignable: await this.actors.assignableSalesOwners(actor),
      requiredPermission: CUSTOMER_PERMISSIONS.view,
    });
  }

  async findById(actor: CustomerActor, customerId: string): Promise<CustomerView> {
    return this.toView(actor, await this.visibleCustomers.findVisible(actor, customerId, { includeDeleted: true }));
  }

  async create(actor: CustomerActor, request: CreateCustomerRequest): Promise<CustomerView> {
    const created = await this.creation.create(draftFromRequest(request), {
      actor,
      mode: 'BY_ID',
      source: 'UI',
      acknowledgedDuplicateIds: request.acknowledgedDuplicateIds,
    });
    return this.toView(actor, toVisibleCustomer(created, await this.actors.accessScopes(actor)));
  }

  async update(actor: CustomerActor, customerId: string, sent: UpdateCustomerRequest): Promise<CustomerView> {
    const visible = await this.visibleCustomers.findVisible(actor, customerId);
    const { subject } = visible;
    if (!canEditCustomer(actor, subject)) {
      throw new PermissionDeniedError(missingEditPermission(actor, subject));
    }
    const administers = canAdministerCustomer(actor, subject);
    const reserved = this.changedReservedFields(visible.record, sent);
    if (reserved.length > 0 && !administers) {
      throw fieldNotEditableError(reserved, CUSTOMER_PERMISSIONS.administer);
    }
    // Sin `clientes.administrar`, un código "igual" normalizado (`ab-12` = `AB-12`) no cambia nada:
    // se conserva el valor guardado tal cual, sin reescribir su forma de presentación.
    const request: UpdateCustomerRequest = !administers && sent.customerCode !== undefined ? { ...sent, customerCode: undefined } : sent;

    const draft = draftFromRequest(request);
    const codeNormalized = request.customerCode === undefined ? null : normalizeCustomerCode(request.customerCode?.trim());
    const before = visible.record;
    // Alcances, responsables asignables y parámetros se leen ANTES de abrir la transacción
    // (que puede retener el bloqueo consultivo del código): dentro solo se usa su conexión.
    const prepared = await this.validation.prepare(draft, { mode: 'BY_ID', actor, existing: before, visibility: visible.scopes.visibility });
    const uniqueness = codeNormalized ? prepared.codeUniqueness : 'PAIS';

    let changes: Partial<NormalizedCustomer> = {};
    try {
      changes = await this.transactions.run(async (tx) => {
        if (codeNormalized && uniqueness === 'GLOBAL' && codeNormalized !== before.customerCodeNormalized) {
          await this.customers.lockCustomerCode(codeNormalized, tx);
        }
        const outcome = await this.validation.validate(draft, { mode: 'BY_ID', actor, existing: before, tx, context: prepared });
        assertCustomerOutcome(outcome, request.acknowledgedDuplicateIds);
        const normalized = outcome.normalized;
        if (!normalized) throw new Error('Validation outcome without normalized values');

        const current = currentNormalized(before);
        const changed = Object.fromEntries(
          NORMALIZED_UPDATE_FIELDS.filter((field) => normalized[field] !== current[field]).map((field) => [field, normalized[field]]),
        ) as Partial<NormalizedCustomer>;
        if (Object.keys(changed).length > 0) {
          const input: UpdateCustomerInput = { ...changed, updatedById: actor.userId };
          await this.customers.update(customerId, input, tx);
        }
        return changed;
      });
    } catch (error) {
      if (error instanceof CustomerCodeConflictError) {
        // Carrera con el índice único (RN-02.13): mismo 409, nunca 500.
        const holder = codeNormalized
          ? await this.customers.findCustomerCodeHolder(
              codeNormalized,
              { countryId: uniqueness === 'GLOBAL' ? null : (request.countryId ?? before.country.id), excludeCustomerId: customerId },
              visible.scopes.visibility,
            )
          : null;
        throw customerCodeTakenError(
          holder ? { customerId: holder.isInScope ? holder.id : null, crmCode: holder.crmCode, isDeleted: holder.isDeleted } : null,
        );
      }
      throw error;
    }

    if (Object.keys(changes).length === 0) {
      // Edición sin cambios: no se escribe ni se audita (RN-02.31).
      return this.toView(actor, visible);
    }

    const after = await this.customers.findById(customerId, { visibility: null, includeDeleted: false });
    if (!after) throw new Error('Updated customer not found');
    this.logger.info('customer_updated', { correlationId: actor.audit.correlationId, customerId, fields: Object.keys(changes) });
    await this.audit.record(CUSTOMER_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: CUSTOMER_AUDIT_RESOURCE,
      resourceId: customerId,
      before: customerAuditState(before),
      after: customerAuditState(after),
    });
    // Tras reasignar el responsable el actor puede dejar de verlo directamente: se recalculan acceso y capacidades.
    return this.toView(actor, toVisibleCustomer(after, visible.scopes));
  }

  /**
   * RN-02.22 sin TOCTOU: conteo de dependencias y borrado lógico en una
   * transacción con la fila del cliente bloqueada (`FOR UPDATE`). Quien crea un
   * dependiente toma `FOR SHARE`/`FOR KEY SHARE` sobre esa fila, así que o espera
   * al borrado (y ve el cliente eliminado) o el borrado espera y lo cuenta.
   */
  async remove(actor: CustomerActor, customerId: string): Promise<void> {
    const visible = await this.visibleCustomers.findVisible(actor, customerId);
    if (!canDeleteCustomer(actor, visible.subject)) {
      throw new PermissionDeniedError(CUSTOMER_PERMISSIONS.delete);
    }

    await this.transactions.run(async (tx) => {
      if (!(await this.customers.lockCustomerRow(customerId, 'UPDATE', tx))) throw customerNotFound(customerId);
      const counts = await this.customers.countDependencies(customerId, tx);
      const dependencies = [
        { dependency: 'projects', count: counts.projects },
        { dependency: 'openActivities', count: counts.openActivities },
        { dependency: 'pendingVisits', count: counts.pendingVisits },
      ].filter((entry) => entry.count > 0);
      if (dependencies.length > 0) {
        throw new ResourceConflictError(
          'The customer has active dependencies; deactivate it instead',
          dependencies,
          CUSTOMER_ERROR_CODES.customerHasDependencies,
        );
      }
      await this.customers.softDelete(customerId, actor.userId, tx);
    });
    this.logger.info('customer_deleted', { correlationId: actor.audit.correlationId, customerId });
    await this.audit.record(CUSTOMER_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: CUSTOMER_AUDIT_RESOURCE,
      resourceId: customerId,
      metadata: { crmCode: visible.record.crmCode },
    });
  }

  async restore(actor: CustomerActor, customerId: string): Promise<CustomerView> {
    const visible = await this.visibleCustomers.findVisible(actor, customerId, { includeDeleted: true });
    const { subject } = visible;
    if (!subject.isDeleted) {
      throw new ResourceConflictError('The customer is not deleted', [], CUSTOMER_ERROR_CODES.customerNotDeleted);
    }
    if (!canRestoreCustomer(actor, subject)) {
      throw new PermissionDeniedError(CUSTOMER_PERMISSIONS.delete);
    }

    // RN-02.23: con GLOBAL, otro cliente pudo ocupar el código en otro país mientras estaba eliminado.
    // El parámetro se lee antes de abrir la transacción (no se piden conexiones extra con el bloqueo tomado).
    const code = visible.record.customerCodeNormalized;
    const uniqueness = code ? await this.validation.codeUniqueness() : 'PAIS';
    await this.transactions.run(async (tx) => {
      if (code && uniqueness === 'GLOBAL') {
        await this.customers.lockCustomerCode(code, tx);
        const holder = await this.customers.findCustomerCodeHolder(
          code,
          { countryId: null, excludeCustomerId: customerId },
          visible.scopes.visibility,
          tx,
        );
        if (holder) {
          throw customerCodeTakenError({ customerId: holder.isInScope ? holder.id : null, crmCode: holder.crmCode, isDeleted: holder.isDeleted });
        }
      }
      await this.customers.restore(customerId, actor.userId, tx);
    });

    this.logger.info('customer_restored', { correlationId: actor.audit.correlationId, customerId });
    await this.audit.record(CUSTOMER_AUDIT_EVENTS.restored, actor.audit, {
      resourceType: CUSTOMER_AUDIT_RESOURCE,
      resourceId: customerId,
      metadata: { crmCode: visible.record.crmCode },
    });
    return this.findById(actor, customerId);
  }

  /** Ficha visible y política de edición, para los adjuntos (RN-02.29). */
  async assertCanManageAttachments(actor: CustomerActor, customerId: string): Promise<void> {
    const { subject } = await this.visibleCustomers.findVisible(actor, customerId);
    if (!canEditCustomer(actor, subject)) {
      throw new PermissionDeniedError(missingEditPermission(actor, subject));
    }
  }

  /** Cliente visible (incluidos eliminados con `clientes.eliminar`), para listar y descargar adjuntos. */
  async assertCanViewAttachments(actor: CustomerActor, customerId: string): Promise<void> {
    await this.visibleCustomers.findVisible(actor, customerId, { includeDeleted: true });
  }

  private toView(actor: CustomerActor, visible: VisibleCustomer): CustomerView {
    return {
      record: visible.record,
      access: visible.access,
      capabilities: customerCapabilities(actor, visible.subject),
      canSeeContacts: actor.permissions.has(CONTACT_PERMISSIONS.view),
    };
  }

  /**
   * Campos reservados enviados con un valor distinto del actual (H.2). El código se compara
   * normalizado (RN-02.17): `ab-12` y `AB12` son el mismo código y no exigen `clientes.administrar`.
   */
  private changedReservedFields(record: CustomerRecord, request: UpdateCustomerRequest): string[] {
    const current: Record<(typeof CUSTOMER_RESERVED_FIELDS)[number], string | null> = {
      customerCode: normalizeCustomerCode(record.customerCode),
      salesOwnerId: record.salesOwner.id,
      countryId: record.country.id,
    };
    return CUSTOMER_RESERVED_FIELDS.filter((field) => {
      const sent = request[field];
      if (sent === undefined) return false;
      const value = field === 'customerCode' ? normalizeCustomerCode(sent) : trimToNull(sent);
      return value !== current[field];
    });
  }
}
