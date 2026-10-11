import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError, ResourceConflictError } from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { CustomerActor } from './customer-actor.resolver';
import { CONTACT_PERMISSIONS, CUSTOMER_PERMISSIONS, isCustomerWritableForContacts } from './customer-access-policy';
import {
  CONTACT_AUDIT_EVENTS,
  CONTACT_AUDIT_RESOURCE,
  CONTACT_MASKED_FIELDS,
  contactAuditState,
  CUSTOMER_AUDIT_EVENTS,
  CUSTOMER_AUDIT_RESOURCE,
} from './customer-audit';
import {
  contactInactiveError,
  contactNotFound,
  CUSTOMER_ERROR_CODES,
  duplicateBlockedError,
  fieldIssue,
  fieldIssuesError,
  possibleDuplicateError,
} from './customer-errors';
import { isValidPhone } from './customer-field-rules';
import { contactFullName, normalizeEmail, normalizeName, phoneDigits } from './customer-normalization';
import { CustomerVisibilityService, type VisibleCustomer } from './customer-visibility.service';
import {
  activeRuleKeys,
  areWarningsAcknowledged,
  CONTACT_DUPLICATE_REASONS,
  CONTACT_DUPLICATE_RULE_KEYS,
  type ContactDuplicateRuleKey,
  evaluateDuplicates,
  parseDuplicateRules,
} from './duplicate-rules';
import {
  ContactEmailConflictError,
  type ContactDuplicateCandidate,
  type ContactRecord,
  CONTACTS_REPOSITORY,
  type ContactsRepository,
  type ContactSortField,
  type ContactStatusFilter,
  type UpdateContactInput,
} from './ports/contacts.repository.port';

export const CONTACT_DUPLICATE_RULES_PARAMETER = 'crm.contactos.reglas_duplicidad';

export interface ListContactsRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: ContactSortField;
  readonly sortOrder: 'asc' | 'desc';
  readonly search?: string;
  readonly status?: ContactStatusFilter;
  readonly deleted?: boolean;
}

export interface ContactFieldsRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly jobTitle?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly isActive?: boolean;
  readonly comments?: string | null;
  readonly acknowledgedDuplicateIds?: readonly string[];
}

export type CreateContactRequest = ContactFieldsRequest & {
  readonly firstName: string;
  readonly lastName: string;
  readonly isPrimary?: boolean;
};

type ContactSoftRule = Exclude<ContactDuplicateRuleKey, 'correo'>;

interface ContactValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly isActive: boolean;
  readonly comments: string | null;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** `details` de los avisos de contacto: `{ rule, reason: 'FULL_NAME' | 'PHONE', candidate }` (02 F.4). */
function contactDuplicateDetails(matches: readonly { rule: ContactSoftRule; candidate: ContactDuplicateCandidate }[]): Record<string, unknown>[] {
  return matches.map((match) => ({
    rule: match.rule,
    reason: CONTACT_DUPLICATE_REASONS[match.rule],
    candidate: {
      id: match.candidate.id,
      fullName: contactFullName(match.candidate.firstName, match.candidate.lastName),
      jobTitle: match.candidate.jobTitle,
      isDeleted: match.candidate.isDeleted,
    },
  }));
}

/**
 * Contactos del cliente y contacto principal (02 F9–F16, RN-02.24–RN-02.28, D-02.7).
 *
 * - El cliente sale de la ruta y debe ser visible y no eliminado (`404`).
 * - Escribir exige el permiso de contactos de la operación **y** que el cliente
 *   sea propio, o ajeno en el alcance directo con `clientes.administrar` (D-02.7).
 * - Como máximo un principal activo (RN-02.26): elegir otro lo sustituye; desactivar
 *   o eliminar el principal lo limpia en la misma transacción.
 * - Auditoría con nombre, apellidos, correo y teléfono enmascarados (DM-29).
 */
@Injectable()
export class ContactsService {
  constructor(
    @Inject(CONTACTS_REPOSITORY) private readonly contacts: ContactsRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly visibleCustomers: CustomerVisibilityService,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async list(actor: CustomerActor, customerId: string, request: ListContactsRequest): Promise<Page<ContactRecord>> {
    if (request.deleted && !actor.permissions.has(CONTACT_PERMISSIONS.delete)) {
      // D-02.6: ver contactos eliminados exige `contactos.eliminar`.
      throw new PermissionDeniedError(CONTACT_PERMISSIONS.delete);
    }
    await this.visibleCustomers.findVisible(actor, customerId);
    return this.contacts.list(customerId, {
      page: request.page,
      pageSize: request.pageSize,
      sortBy: request.sortBy ?? 'lastName',
      sortOrder: request.sortOrder,
      search: request.search?.trim() || null,
      status: request.status ?? 'ACTIVE',
      deleted: request.deleted ?? false,
    });
  }

  async findById(actor: CustomerActor, customerId: string, contactId: string): Promise<ContactRecord> {
    await this.visibleCustomers.findVisible(actor, customerId);
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: false });
    if (!contact) throw contactNotFound(contactId);
    return contact;
  }

  async create(actor: CustomerActor, customerId: string, request: CreateContactRequest): Promise<ContactRecord> {
    const customer = await this.writableCustomer(actor, customerId);
    const values: ContactValues = {
      firstName: request.firstName.trim(),
      lastName: request.lastName.trim(),
      jobTitle: trimToNull(request.jobTitle),
      phone: trimToNull(request.phone),
      email: trimToNull(request.email),
      isActive: request.isActive ?? true,
      comments: trimToNull(request.comments),
    };
    this.assertPhone(values.phone, customer);
    if (request.isPrimary && !values.isActive) {
      throw contactInactiveError('isPrimary');
    }
    await this.assertNoDuplicates(customerId, values, null, request.acknowledgedDuplicateIds);

    let contactId: string;
    try {
      contactId = await this.transactions.run(async (tx) => {
        const id = await this.contacts.create(
          { customerId, ...values, emailNormalized: normalizeEmail(values.email), createdById: actor.userId },
          tx,
        );
        if (request.isPrimary) {
          await this.contacts.setPrimary(customerId, id, actor.userId, tx);
        }
        return id;
      });
    } catch (error) {
      if (error instanceof ContactEmailConflictError) throw await this.emailTakenError(customerId, values.email, null);
      throw error;
    }

    const created = await this.requireContact(customerId, contactId);
    this.logger.info('contact_created', { correlationId: actor.audit.correlationId, customerId, contactId });
    await this.audit.record(CONTACT_AUDIT_EVENTS.created, actor.audit, {
      resourceType: CONTACT_AUDIT_RESOURCE,
      resourceId: contactId,
      before: null,
      after: contactAuditState(created),
      metadata: { customerId },
      maskedFields: CONTACT_MASKED_FIELDS,
    });
    if (request.isPrimary) {
      await this.recordPrimaryChange(actor, customerId, customer.record.primaryContact?.id ?? null, contactId);
    }
    return created;
  }

  async update(actor: CustomerActor, customerId: string, contactId: string, request: ContactFieldsRequest): Promise<ContactRecord> {
    const customer = await this.writableCustomer(actor, customerId);
    const before = await this.contacts.findById(customerId, contactId, { includeDeleted: false });
    if (!before) throw contactNotFound(contactId);

    const values: ContactValues = {
      firstName: request.firstName === undefined ? before.firstName : request.firstName.trim(),
      lastName: request.lastName === undefined ? before.lastName : request.lastName.trim(),
      jobTitle: request.jobTitle === undefined ? before.jobTitle : trimToNull(request.jobTitle),
      phone: request.phone === undefined ? before.phone : trimToNull(request.phone),
      email: request.email === undefined ? before.email : trimToNull(request.email),
      isActive: request.isActive ?? before.isActive,
      comments: request.comments === undefined ? before.comments : trimToNull(request.comments),
    };
    if (request.phone !== undefined) this.assertPhone(values.phone, customer);
    await this.assertNoDuplicates(customerId, values, before, request.acknowledgedDuplicateIds);

    const changes: Record<string, unknown> = {};
    for (const field of Object.keys(values) as (keyof ContactValues)[]) {
      if (values[field] !== before[field]) changes[field] = values[field];
    }
    if (Object.keys(changes).length === 0) {
      return before;
    }
    if ('email' in changes) changes['emailNormalized'] = normalizeEmail(values.email);
    const clearsPrimary = before.isPrimary && !values.isActive;

    try {
      await this.transactions.run(async (tx) => {
        await this.contacts.update(customerId, contactId, { ...(changes as Partial<UpdateContactInput>), updatedById: actor.userId }, tx);
        if (clearsPrimary) {
          // RN-02.26: desactivar el principal deja al cliente sin principal en la misma transacción.
          await this.contacts.setPrimary(customerId, null, actor.userId, tx);
        }
      });
    } catch (error) {
      if (error instanceof ContactEmailConflictError) throw await this.emailTakenError(customerId, values.email, contactId);
      throw error;
    }

    const after = await this.requireContact(customerId, contactId);
    await this.recordContactUpdate(actor, customerId, before, after);
    if (clearsPrimary) {
      await this.recordPrimaryChange(actor, customerId, contactId, null);
    }
    return after;
  }

  async setPrimary(actor: CustomerActor, customerId: string, contactId: string): Promise<ContactRecord> {
    const customer = await this.writableCustomer(actor, customerId);
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: false });
    if (!contact) throw contactNotFound(contactId);
    if (!contact.isActive) throw contactInactiveError();
    const previous = customer.record.primaryContact?.id ?? null;
    if (previous !== contactId) {
      await this.transactions.run((tx) => this.contacts.setPrimary(customerId, contactId, actor.userId, tx));
      await this.recordPrimaryChange(actor, customerId, previous, contactId);
    }
    return { ...contact, isPrimary: true };
  }

  async clearPrimary(actor: CustomerActor, customerId: string): Promise<void> {
    const customer = await this.writableCustomer(actor, customerId);
    const previous = customer.record.primaryContact?.id ?? null;
    if (previous === null) return;
    await this.transactions.run((tx) => this.contacts.setPrimary(customerId, null, actor.userId, tx));
    await this.recordPrimaryChange(actor, customerId, previous, null);
  }

  async remove(actor: CustomerActor, customerId: string, contactId: string): Promise<void> {
    await this.writableCustomer(actor, customerId, CONTACT_PERMISSIONS.delete);
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: false });
    if (!contact) throw contactNotFound(contactId);
    if (contact.hasHistory) {
      // RN-02.27: un contacto con visitas o actividades se desactiva, no se elimina.
      throw new ResourceConflictError('The contact takes part in visits or activities; deactivate it instead', [], CUSTOMER_ERROR_CODES.contactHasHistory);
    }

    await this.transactions.run(async (tx) => {
      if (contact.isPrimary) {
        await this.contacts.setPrimary(customerId, null, actor.userId, tx);
      }
      await this.contacts.softDelete(customerId, contactId, actor.userId, tx);
    });

    this.logger.info('contact_deleted', { correlationId: actor.audit.correlationId, customerId, contactId });
    await this.audit.record(CONTACT_AUDIT_EVENTS.deleted, actor.audit, {
      resourceType: CONTACT_AUDIT_RESOURCE,
      resourceId: contactId,
      metadata: { customerId },
    });
    if (contact.isPrimary) {
      await this.recordPrimaryChange(actor, customerId, contactId, null);
    }
  }

  async restore(actor: CustomerActor, customerId: string, contactId: string): Promise<ContactRecord> {
    await this.writableCustomer(actor, customerId, CONTACT_PERMISSIONS.delete);
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: true });
    if (!contact) throw contactNotFound(contactId);
    if (contact.deletedAt === null) {
      throw new ResourceConflictError('The contact is not deleted', [], CUSTOMER_ERROR_CODES.contactNotDeleted);
    }
    if (contact.emailNormalized) {
      // El índice incluye eliminados (RN-02.28): solo otro contacto activo podría ocuparlo si se saltó la regla.
      const holder = await this.contacts.findEmailHolder(customerId, contact.emailNormalized, contactId);
      if (holder) throw await this.emailTakenError(customerId, contact.email, contactId);
    }
    await this.contacts.restore(customerId, contactId, actor.userId);

    this.logger.info('contact_restored', { correlationId: actor.audit.correlationId, customerId, contactId });
    await this.audit.record(CONTACT_AUDIT_EVENTS.restored, actor.audit, {
      resourceType: CONTACT_AUDIT_RESOURCE,
      resourceId: contactId,
      metadata: { customerId },
    });
    return this.requireContact(customerId, contactId);
  }

  /**
   * Cliente visible, no eliminado y que admite cambios en sus contactos por este
   * actor (D-02.7). El permiso de contactos de la operación ya lo exige el
   * guard; se vuelve a comprobar si se pide uno distinto.
   */
  private async writableCustomer(actor: CustomerActor, customerId: string, permission?: string): Promise<VisibleCustomer> {
    const visible = await this.visibleCustomers.findVisible(actor, customerId);
    if (permission && !actor.permissions.has(permission)) {
      throw new PermissionDeniedError(permission);
    }
    const subject = { salesOwnerId: visible.record.salesOwner.id, access: visible.access, isDeleted: visible.record.deletedAt !== null };
    if (!isCustomerWritableForContacts(actor, subject)) {
      throw new PermissionDeniedError(CUSTOMER_PERMISSIONS.administer);
    }
    return visible;
  }

  private assertPhone(phone: string | null, customer: VisibleCustomer): void {
    if (phone && !isValidPhone(phone, customer.record.country.phonePattern)) {
      throw fieldIssuesError([fieldIssue('phone', CUSTOMER_ERROR_CODES.invalidPhoneFormat)]);
    }
  }

  /**
   * RN-02.16: correo repetido en el cliente → siempre `409 CONTACT_EMAIL_TAKEN`
   * (incluidos eliminados); nombre completo y teléfono según
   * `crm.contactos.reglas_duplicidad`, con la misma confirmación que los clientes.
   * En la edición, solo las claves cuyo valor cambia.
   */
  private async assertNoDuplicates(
    customerId: string,
    values: ContactValues,
    before: ContactRecord | null,
    acknowledgedIds: readonly string[] | undefined,
  ): Promise<void> {
    const email = normalizeEmail(values.email);
    if (email && email !== before?.emailNormalized) {
      const holder = await this.contacts.findEmailHolder(customerId, email, before?.id ?? null);
      if (holder) throw await this.emailTakenError(customerId, values.email, before?.id ?? null);
    }

    const parameter = await this.parameters.get<unknown>(CONTACT_DUPLICATE_RULES_PARAMETER);
    const parsed = parseDuplicateRules(parameter, CONTACT_DUPLICATE_RULE_KEYS, { forced: { correo: 'BLOQUEAR' } });
    for (const warning of parsed.warnings) {
      this.logger.warn('contact_duplicate_rule_ignored', { parameter: CONTACT_DUPLICATE_RULES_PARAMETER, key: warning.key, reason: warning.reason });
    }

    const next: Record<ContactSoftRule, string | null> = {
      nombreCompleto: normalizeName(`${values.firstName} ${values.lastName}`),
      telefono: phoneDigits(values.phone),
    };
    const previous: Record<ContactSoftRule, string | null> | null = before
      ? { nombreCompleto: normalizeName(`${before.firstName} ${before.lastName}`), telefono: phoneDigits(before.phone) }
      : null;
    const keys = activeRuleKeys(parsed.rules).filter(
      (key): key is ContactSoftRule => key !== 'correo' && next[key] !== null && (previous === null || previous[key] !== next[key]),
    );
    if (keys.length === 0) return;

    const rows = await this.contacts.findDuplicateCandidates({
      customerId,
      excludeContactId: before?.id ?? null,
      ...Object.fromEntries(keys.map((key) => [key, next[key]])),
    });
    const matches = rows.flatMap((row) => row.rules.filter((rule) => keys.includes(rule)).map((rule) => ({ rule, candidate: row.candidate })));
    const evaluation = evaluateDuplicates(parsed.rules, matches);
    if (evaluation.blocking.length > 0) {
      throw duplicateBlockedError(contactDuplicateDetails(evaluation.blocking));
    }
    if (!areWarningsAcknowledged(evaluation.warnings.map((match) => match.candidate.id), acknowledgedIds)) {
      throw possibleDuplicateError(contactDuplicateDetails(evaluation.warnings));
    }
  }

  private async emailTakenError(customerId: string, email: string | null, excludeContactId: string | null): Promise<ResourceConflictError> {
    const normalized = normalizeEmail(email);
    const holder = normalized ? await this.contacts.findEmailHolder(customerId, normalized, excludeContactId) : null;
    return new ResourceConflictError(
      'The email is already used by another contact of the customer',
      [{ field: 'email', contactId: holder?.id ?? null, isDeleted: holder?.isDeleted ?? null }],
      CUSTOMER_ERROR_CODES.contactEmailTaken,
    );
  }

  private async requireContact(customerId: string, contactId: string): Promise<ContactRecord> {
    const contact = await this.contacts.findById(customerId, contactId, { includeDeleted: false });
    if (!contact) throw new Error('Contact not found after write');
    return contact;
  }

  /**
   * Edición: los cambios de datos van en `crm.contact.updated`; el cambio de
   * estado, en `crm.contact.activated` / `deactivated` (RN-02.31).
   */
  private async recordContactUpdate(actor: CustomerActor, customerId: string, before: ContactRecord, after: ContactRecord): Promise<void> {
    const { isActive: beforeActive, ...beforeData } = contactAuditState(before);
    const { isActive: afterActive, ...afterData } = contactAuditState(after);
    this.logger.info('contact_updated', { correlationId: actor.audit.correlationId, customerId, contactId: after.id });
    await this.audit.record(CONTACT_AUDIT_EVENTS.updated, actor.audit, {
      resourceType: CONTACT_AUDIT_RESOURCE,
      resourceId: after.id,
      before: beforeData,
      after: afterData,
      metadata: { customerId },
      maskedFields: CONTACT_MASKED_FIELDS,
    });
    if (beforeActive !== afterActive) {
      await this.audit.record(afterActive ? CONTACT_AUDIT_EVENTS.activated : CONTACT_AUDIT_EVENTS.deactivated, actor.audit, {
        resourceType: CONTACT_AUDIT_RESOURCE,
        resourceId: after.id,
        before: { isActive: beforeActive },
        after: { isActive: afterActive },
        metadata: { customerId },
      });
    }
  }

  private async recordPrimaryChange(actor: CustomerActor, customerId: string, previous: string | null, next: string | null): Promise<void> {
    this.logger.info('customer_primary_contact_changed', { correlationId: actor.audit.correlationId, customerId });
    await this.audit.record(CUSTOMER_AUDIT_EVENTS.primaryContactChanged, actor.audit, {
      resourceType: CUSTOMER_AUDIT_RESOURCE,
      resourceId: customerId,
      before: { primaryContactId: previous },
      after: { primaryContactId: next },
    });
  }
}
