import { Inject, Injectable } from '@nestjs/common';

import { SEQUENCE_GENERATOR, type SequenceGenerator } from '@/infrastructure/database/ports/sequence-generator.port';
import { type TransactionContext, TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import { type CustomerActor, CustomerActorResolver } from './customer-actor.resolver';
import { canAssignSalesOwner, CUSTOMER_PERMISSIONS } from './customer-access-policy';
import { CUSTOMER_AUDIT_EVENTS, CUSTOMER_AUDIT_RESOURCE, customerAuditState } from './customer-audit';
import { customerCodeTakenError, fieldNotEditableError } from './customer-errors';
import { normalizeCustomerCode } from './customer-normalization';
import { assertCustomerOutcome } from './customer-outcome';
import { type CustomerDraft, type CustomerRefMode, CustomerValidationService } from './customer-validation.service';
import {
  CustomerCodeConflictError,
  type CustomerRecord,
  CUSTOMERS_REPOSITORY,
  type CustomersRepository,
} from './ports/customers.repository.port';

/** Secuencia de folios de clientes (00 §6.1, RN-02.1). */
export const CUSTOMER_SEQUENCE_KEY = 'crm.cliente';

export interface CustomerCreationContext {
  readonly actor: CustomerActor;
  /** Contexto de auditoría; por defecto, el del actor. */
  readonly audit?: AuditContext;
  readonly mode: CustomerRefMode;
  readonly source: 'UI' | 'IMPORT';
  readonly sourceImportId?: string;
  /** Confirmación de avisos de duplicado (RN-02.14). En `IMPORT`, la traduce el Módulo 6 (D-06.6). */
  readonly acknowledgedDuplicateIds?: readonly string[];
  /** Admite un teléfono con formato inválido para el país (carga masiva, ADR-029). */
  readonly lenientPhone?: boolean;
  /**
   * Escritura del llamador en la **misma** transacción del alta, tras el `INSERT`
   * (la importación marca su fila `IMPORTED` con el cliente creado, 06 RN-06.21).
   * Si lanza, el alta se deshace.
   */
  readonly withinTransaction?: (customerId: string, tx: TransactionContext) => Promise<void>;
  /** Metadatos extra del evento `crm.customer.created` (la importación añade `rowNumber`, 06 H.6). */
  readonly auditMetadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Único caso de uso de alta de clientes (02 F.6.2, RN-02.1, RN-02.11, RN-02.12).
 * Lo usan la pantalla (F5) y la importación (Módulo 6, fila a fila).
 *
 * En una transacción: (con `unicidad_codigo = GLOBAL`) bloqueo consultivo por el
 * código → validación completa → folio `crm.cliente` lo más tarde posible →
 * `INSERT`. La auditoría se escribe después (`metadata.source`). Nunca
 * sobrescribe un cliente existente.
 */
@Injectable()
export class CustomerCreationService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    private readonly validation: CustomerValidationService,
    private readonly actors: CustomerActorResolver,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async create(draft: CustomerDraft, context: CustomerCreationContext): Promise<CustomerRecord> {
    const { actor } = context;
    // RN-02.11: sin `clientes.administrar` solo se crean clientes propios. En la
    // importación (claves naturales) lo resuelve la elegibilidad (INVALID_SALES_OWNER).
    const requestedOwner = draft.salesOwner?.trim();
    if (context.mode === 'BY_ID' && requestedOwner && !canAssignSalesOwner(actor, requestedOwner)) {
      throw fieldNotEditableError(['salesOwnerId'], CUSTOMER_PERMISSIONS.administer);
    }

    const codeNormalized = normalizeCustomerCode(draft.customerCode?.trim());
    // Alcances, responsables asignables y parámetros se leen ANTES de abrir la
    // transacción: dentro solo se usa su conexión mientras retiene el bloqueo del
    // código y el de la secuencia (no se piden conexiones extra al pool).
    const prepared = await this.validation.prepare(draft, { mode: context.mode, actor });
    const uniqueness = prepared.codeUniqueness;

    let customerId: string;
    try {
      customerId = await this.transactions.run(async (tx) => {
        if (codeNormalized && uniqueness === 'GLOBAL') {
          await this.customers.lockCustomerCode(codeNormalized, tx);
        }
        const outcome = await this.validation.validate(draft, {
          mode: context.mode,
          actor,
          tx,
          context: prepared,
          ...(context.lenientPhone ? { lenientPhone: true } : {}),
        });
        assertCustomerOutcome(outcome, context.acknowledgedDuplicateIds);
        const normalized = outcome.normalized;
        if (!normalized) throw new Error('Validation outcome without normalized values');

        const crmCode = await this.sequences.next(CUSTOMER_SEQUENCE_KEY, tx);
        const id = await this.customers.create(
          { ...normalized, crmCode, sourceImportId: context.sourceImportId ?? null, createdById: actor.userId },
          tx,
        );
        await context.withinTransaction?.(id, tx);
        return id;
      });
    } catch (error) {
      if (error instanceof CustomerCodeConflictError && codeNormalized) {
        // Carrera con el índice único (RN-02.13): mismo 409 que la comprobación previa, nunca 500.
        throw customerCodeTakenError(await this.codeHolder(codeNormalized, draft, context));
      }
      throw error;
    }

    const created = await this.customers.findById(customerId, { visibility: null, includeDeleted: false });
    if (!created) throw new Error('Created customer not found');

    const audit = context.audit ?? actor.audit;
    this.logger.info('customer_created', { correlationId: audit.correlationId, customerId, source: context.source });
    await this.audit.record(CUSTOMER_AUDIT_EVENTS.created, audit, {
      resourceType: CUSTOMER_AUDIT_RESOURCE,
      resourceId: customerId,
      before: null,
      after: customerAuditState(created),
      metadata: { ...context.auditMetadata, source: context.source, crmCode: created.crmCode, sourceImportId: context.sourceImportId ?? null },
    });
    return created;
  }

  private async codeHolder(
    codeNormalized: string,
    draft: CustomerDraft,
    context: CustomerCreationContext,
  ): Promise<{ customerId: string | null; crmCode: string; isDeleted: boolean } | null> {
    const visibility = await this.actors.visibility(context.actor);
    const uniqueness = await this.validation.codeUniqueness();
    const countryInput = draft.country?.trim();
    const country =
      uniqueness === 'GLOBAL' || !countryInput
        ? null
        : await this.customers.findCountry({ by: context.mode === 'BY_ID' ? 'id' : 'isoCode', value: countryInput });
    if (uniqueness !== 'GLOBAL' && !country) return null;
    const countryId = country?.id ?? null;
    const holder = await this.customers.findCustomerCodeHolder(codeNormalized, { countryId, excludeCustomerId: null }, visibility);
    return holder ? { customerId: holder.isInScope ? holder.id : null, crmCode: holder.crmCode, isDeleted: holder.isDeleted } : null;
  }
}
