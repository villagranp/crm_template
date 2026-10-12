import type { AttachmentRecord } from '@/modules/attachments/ports/attachments.repository.port';

import { contactFullName } from './customer-normalization';
import type { CustomerListItemView, CustomerView } from './customers.service';
import type { ContactResponseDto } from './dto/contact.dto';
import type { AttachmentResponseDto } from './dto/customer-attachment.dto';
import type { CustomerFormOptionsDto, CustomerListItemDto, CustomerResponseDto, SalesOwnerOptionDto } from './dto/customer.dto';
import type { ContactRecord } from './ports/contacts.repository.port';
import type { SalesOwnerOptionRecord } from './ports/customers.repository.port';
import type { CustomerFormOptions } from './customers.service';

/**
 * Registro → DTO de la API (02 F.3–F.5). Los modelos de base y los registros de
 * los puertos nunca salen tal cual (CLAUDE.md §8.9): fechas ISO 8601 UTC y solo
 * los campos del contrato.
 */

export function toCustomerListItemDto(view: CustomerListItemView): CustomerListItemDto {
  const { record } = view;
  return {
    id: record.id,
    crmCode: record.crmCode,
    customerCode: record.customerCode,
    legalName: record.legalName,
    tradeName: record.tradeName,
    country: record.country,
    city: record.city,
    status: { id: record.status.id, code: record.status.code, label: record.status.label, isActive: record.status.countsAsActive },
    rating: record.rating,
    salesOwner: record.salesOwner,
    access: view.access,
    isDeleted: record.isDeleted,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toCustomerResponseDto(view: CustomerView): CustomerResponseDto {
  const { record } = view;
  return {
    id: record.id,
    crmCode: record.crmCode,
    customerCode: record.customerCode,
    legalName: record.legalName,
    tradeName: record.tradeName,
    taxId: record.taxId,
    country: {
      id: record.country.id,
      isoCode: record.country.isoCode,
      name: record.country.name,
      taxIdLabel: record.country.taxIdLabel,
    },
    city: record.city,
    address: record.address,
    phone: record.phone,
    email: record.email,
    companyType: record.companyType
      ? { id: record.companyType.id, code: record.companyType.code, label: record.companyType.label, isActive: record.companyType.isActive }
      : null,
    status: { id: record.status.id, code: record.status.code, label: record.status.label, isActive: record.status.countsAsActive },
    rating: record.rating
      ? { id: record.rating.id, code: record.rating.code, label: record.rating.label, isActive: record.rating.isActive }
      : null,
    salesOwner: { id: record.salesOwner.id, displayName: record.salesOwner.displayName, isActive: record.salesOwner.isActive },
    primaryContact:
      view.canSeeContacts && record.primaryContact
        ? { id: record.primaryContact.id, fullName: contactFullName(record.primaryContact.firstName, record.primaryContact.lastName) }
        : null,
    sourceImport: record.sourceImport,
    access: view.access,
    isDeleted: record.deletedAt !== null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
    capabilities: { ...view.capabilities, editableFields: [...view.capabilities.editableFields] },
  };
}

export function toCustomerFormOptionsDto(options: CustomerFormOptions): CustomerFormOptionsDto {
  return {
    countries: options.countries.map((country) => ({
      id: country.id,
      isoCode: country.isoCode,
      name: country.name,
      phonePrefix: country.phonePrefix,
      taxIdLabel: country.taxIdLabel,
      taxIdPattern: country.taxIdPattern,
      phonePattern: country.phonePattern,
    })),
    companyTypes: [...options.companyTypes],
    statuses: [...options.statuses],
    ratings: [...options.ratings],
    defaults: { ...options.defaults },
    requiredFields: [...options.requiredFields],
    attachments: { ...options.attachments, allowedTypes: [...options.attachments.allowedTypes] },
  };
}

export function toSalesOwnerOptionDto(record: SalesOwnerOptionRecord): SalesOwnerOptionDto {
  return { id: record.id, displayName: record.displayName, employeeCode: record.employeeCode, country: record.country };
}

export function toContactResponseDto(record: ContactRecord): ContactResponseDto {
  return {
    id: record.id,
    customerId: record.customerId,
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: contactFullName(record.firstName, record.lastName),
    jobTitle: record.jobTitle,
    phone: record.phone,
    email: record.email,
    isActive: record.isActive,
    isPrimary: record.isPrimary,
    comments: record.comments,
    hasHistory: record.hasHistory,
    isDeleted: record.deletedAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toAttachmentResponseDto(record: AttachmentRecord): AttachmentResponseDto {
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
  };
}
