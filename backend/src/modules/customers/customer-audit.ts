import type { ContactRecord } from './ports/contacts.repository.port';
import type { CustomerRecord } from './ports/customers.repository.port';

/** `resourceType` y eventos de auditoría del módulo (02 RN-02.31). */
export const CUSTOMER_AUDIT_RESOURCE = 'crm.customer';
export const CONTACT_AUDIT_RESOURCE = 'crm.contact';

export const CUSTOMER_AUDIT_EVENTS = {
  created: 'crm.customer.created',
  updated: 'crm.customer.updated',
  deleted: 'crm.customer.deleted',
  restored: 'crm.customer.restored',
  primaryContactChanged: 'crm.customer.primary_contact_changed',
} as const;

export const CONTACT_AUDIT_EVENTS = {
  created: 'crm.contact.created',
  updated: 'crm.contact.updated',
  deactivated: 'crm.contact.deactivated',
  activated: 'crm.contact.activated',
  deleted: 'crm.contact.deleted',
  restored: 'crm.contact.restored',
} as const;

/** Datos personales del contacto: la auditoría los registra enmascarados (DM-29). */
export const CONTACT_MASKED_FIELDS = ['firstName', 'lastName', 'email', 'phone'] as const;

/**
 * Estado auditable de un cliente: ids y valores de empresa (no son PII, 00 §4.5).
 * La diferencia `{ campo: { before, after } }` se calcula sobre esto.
 */
export function customerAuditState(record: CustomerRecord): Record<string, unknown> {
  return {
    crmCode: record.crmCode,
    customerCode: record.customerCode,
    legalName: record.legalName,
    tradeName: record.tradeName,
    taxId: record.taxId,
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

/** Estado auditable de un contacto; `CONTACT_MASKED_FIELDS` se enmascara al registrar. */
export function contactAuditState(record: ContactRecord): Record<string, unknown> {
  return {
    firstName: record.firstName,
    lastName: record.lastName,
    jobTitle: record.jobTitle,
    phone: record.phone,
    email: record.email,
    isActive: record.isActive,
    comments: record.comments,
  };
}
