import type { AttachmentLimits } from '@/features/crm/common/attachments.api';
import type { ProjectListItem } from '@/features/crm/projects';
import type { ListQuery } from '@/lib/query-keys';
import { httpClient } from '@/services/api';
import type { PaginatedResponse } from '@/types/api';

/**
 * Cliente HTTP del Módulo 2 (02 §F.1–F.5). Los tipos reflejan los DTO del
 * backend (`backend/src/modules/customers/dto`), nunca el modelo de datos.
 * Los adjuntos (F17–F20) los sirve `crm/common/attachments.api.ts` con la ruta
 * base de `customerAttachmentsPath`.
 */

const CUSTOMERS_PATH = '/customers';

export type CustomerAccess = 'DIRECT' | 'INHERITED';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface CountryRef {
  id: string;
  isoCode: string;
  name: string;
}

export interface CatalogValue {
  id: string;
  code: string;
  label: string;
}

/** En `status`, `isActive` es `metadata.isActive` del estado (`false` = cliente desactivado, RN-02.21). */
export interface CatalogValueWithState extends CatalogValue {
  isActive: boolean;
}

/** `CustomerListItemDto` (F1). */
export interface CustomerListItem {
  id: string;
  crmCode: string;
  customerCode: string | null;
  legalName: string;
  tradeName: string | null;
  country: CountryRef;
  city: string | null;
  status: CatalogValueWithState;
  rating: CatalogValue | null;
  salesOwner: UserRef;
  access: CustomerAccess;
  isDeleted: boolean;
  updatedAt: string;
}

/** Campos que la edición puede devolver en `capabilities.editableFields`. */
export type CustomerFormField =
  | 'customerCode'
  | 'legalName'
  | 'tradeName'
  | 'taxId'
  | 'countryId'
  | 'city'
  | 'address'
  | 'phone'
  | 'email'
  | 'companyTypeId'
  | 'statusId'
  | 'ratingId'
  | 'salesOwnerId';

export interface CustomerCapabilities {
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
  canManageAttachments: boolean;
  canManageContacts: boolean;
  canReassignOwner: boolean;
  editableFields: string[];
}

/** `CustomerResponseDto` (F4–F6, F8). */
export interface Customer {
  id: string;
  crmCode: string;
  customerCode: string | null;
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  country: CountryRef & { taxIdLabel: string };
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  companyType: CatalogValueWithState | null;
  status: CatalogValueWithState;
  rating: CatalogValueWithState | null;
  salesOwner: UserRef & { isActive: boolean };
  /** Sólo con `contactos.ver` (H.5); sin él, siempre `null`. */
  primaryContact: { id: string; fullName: string } | null;
  sourceImport: { id: string; code: string } | null;
  access: CustomerAccess;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  createdBy: UserRef | null;
  updatedAt: string;
  updatedBy: UserRef | null;
  capabilities: CustomerCapabilities;
}

export interface CountryOption {
  id: string;
  isoCode: string;
  name: string;
  phonePrefix: string | null;
  taxIdLabel: string;
  /** Expresión regular sobre el NIT normalizado (sin espacios, guiones ni puntos). */
  taxIdPattern: string | null;
  phonePattern: string | null;
}

export interface CatalogOption {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
}

export interface StatusOption extends CatalogOption {
  isActive: boolean;
}

/** `CustomerFormOptionsDto` (F2): toda lista de valores del formulario sale de aquí. */
export interface CustomerFormOptions {
  countries: CountryOption[];
  companyTypes: CatalogOption[];
  statuses: StatusOption[];
  ratings: CatalogOption[];
  defaults: { statusId: string | null; companyTypeId: string | null; ratingId: string | null };
  /** Nombres de campo del DTO (base + `crm.campos_obligatorios.customer`). */
  requiredFields: string[];
  attachments: AttachmentLimits & { enabled: boolean };
}

/** `SalesOwnerOptionDto` (F3): sin correo ni teléfono. */
export interface SalesOwnerOption {
  id: string;
  displayName: string;
  employeeCode: string | null;
  country: { id: string; name: string } | null;
}

/** Cuerpo de F5. Omitido = valor por defecto del backend. */
export interface CreateCustomerInput {
  customerCode?: string | null;
  legalName: string;
  tradeName?: string | null;
  taxId?: string | null;
  countryId: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  companyTypeId?: string | null;
  statusId?: string;
  ratingId?: string | null;
  salesOwnerId?: string;
  /** Su presencia (aunque sea `[]`) confirma un `409 POSSIBLE_DUPLICATE` (F.3). */
  acknowledgedDuplicateIds?: string[];
}

/** Cuerpo de F6: omitido = sin cambio; `null` = quitar un opcional. */
export type UpdateCustomerInput = Partial<CreateCustomerInput>;

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

export const CUSTOMER_FILTER_KEYS = [
  'customerCode',
  'crmCode',
  'legalName',
  'countryId',
  'city',
  'statusId',
  'salesOwnerId',
  'deleted',
] as const;
export type CustomerFilterKey = (typeof CUSTOMER_FILTER_KEYS)[number];

function customerPath(customerId: string): string {
  return `${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`;
}

/** Ruta base de los adjuntos del cliente para `AttachmentsSection` (F17–F20). */
export function customerAttachmentsPath(customerId: string): string {
  return `${customerPath(customerId)}/attachments`;
}

// --- Clientes (F1–F8) ---

export function listCustomers(query: ListQuery): Promise<PaginatedResponse<CustomerListItem>> {
  return httpClient.get<PaginatedResponse<CustomerListItem>>(CUSTOMERS_PATH, { query });
}

export function getCustomerFormOptions(): Promise<CustomerFormOptions> {
  return httpClient.get<CustomerFormOptions>(`${CUSTOMERS_PATH}/form-options`);
}

export function listSalesOwnerOptions(query: ListQuery): Promise<PaginatedResponse<SalesOwnerOption>> {
  return httpClient.get<PaginatedResponse<SalesOwnerOption>>(`${CUSTOMERS_PATH}/sales-owner-options`, { query });
}

export function getCustomer(customerId: string): Promise<Customer> {
  return httpClient.get<Customer>(customerPath(customerId));
}

export function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return httpClient.post<Customer>(CUSTOMERS_PATH, { body: input });
}

export function updateCustomer(customerId: string, input: UpdateCustomerInput): Promise<Customer> {
  return httpClient.patch<Customer>(customerPath(customerId), { body: input });
}

export function deleteCustomer(customerId: string): Promise<void> {
  return httpClient.delete<void>(customerPath(customerId));
}

export function restoreCustomer(customerId: string): Promise<Customer> {
  return httpClient.post<Customer>(`${customerPath(customerId)}/restore`);
}

// --- Contactos (F9–F16) ---

export type ContactStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
export const CONTACT_SORT_FIELDS = ['lastName', 'firstName', 'jobTitle', 'createdAt'] as const;

/** `ContactResponseDto`. Es PII (00 §4.5): nunca va a logs ni a almacenamiento local. */
export interface Contact {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  isPrimary: boolean;
  comments: string | null;
  hasHistory: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  comments?: string | null;
  isPrimary?: boolean;
  acknowledgedDuplicateIds?: string[];
}

/** Sin `isPrimary`: el principal se cambia con F13/F14. */
export type UpdateContactInput = Partial<Omit<CreateContactInput, 'isPrimary'>>;

function contactsPath(customerId: string): string {
  return `${customerPath(customerId)}/contacts`;
}

function contactPath(customerId: string, contactId: string): string {
  return `${contactsPath(customerId)}/${encodeURIComponent(contactId)}`;
}

export function listContacts(customerId: string, query: ListQuery): Promise<PaginatedResponse<Contact>> {
  return httpClient.get<PaginatedResponse<Contact>>(contactsPath(customerId), { query });
}

export function createContact(customerId: string, input: CreateContactInput): Promise<Contact> {
  return httpClient.post<Contact>(contactsPath(customerId), { body: input });
}

export function updateContact(customerId: string, contactId: string, input: UpdateContactInput): Promise<Contact> {
  return httpClient.patch<Contact>(contactPath(customerId, contactId), { body: input });
}

export function setPrimaryContact(
  customerId: string,
  contactId: string,
): Promise<{ primaryContact: { id: string; fullName: string } }> {
  return httpClient.put<{ primaryContact: { id: string; fullName: string } }>(`${customerPath(customerId)}/primary-contact`, {
    body: { contactId },
  });
}

export function clearPrimaryContact(customerId: string): Promise<void> {
  return httpClient.delete<void>(`${customerPath(customerId)}/primary-contact`);
}

export function deleteContact(customerId: string, contactId: string): Promise<void> {
  return httpClient.delete<void>(contactPath(customerId, contactId));
}

export function restoreContact(customerId: string, contactId: string): Promise<Contact> {
  return httpClient.post<Contact>(`${contactPath(customerId, contactId)}/restore`);
}

// --- Proyectos del cliente (F.7, contrato del Módulo 3) ---

/**
 * Lo que la ficha usa de `ProjectListItemDto` (03 F.1, "Contrato para Clientes
 * F-08"; AC-03.86), con el tipo que publica el barril del Módulo 3. Los
 * decimales llegan como cadena (`phase.progress: "75.00"`).
 */
export type CustomerProjectItem = Pick<
  ProjectListItem,
  'id' | 'code' | 'name' | 'city' | 'country' | 'phase' | 'commercialStatus' | 'owner' | 'estimatedDecisionDate'
>;

/**
 * Filtros de `GET /projects` que admite la sección (03 F.1): `commercialStatus`
 * es `OPEN_STAGE:<stageId>`, `WON`, `LOST` o `NO_OPPORTUNITIES`.
 */
export const CUSTOMER_PROJECT_FILTER_KEYS = ['phaseId', 'ownerId', 'commercialStatus'] as const;

/** Subconjunto de la lista blanca de `sortBy` de `GET /projects` (03 F.1) con columna en la sección. */
export const CUSTOMER_PROJECT_SORT_FIELDS = ['code', 'name', 'phaseOrder', 'estimatedDecisionDate'] as const;

/** Lo llama el frontend directamente; el backend de Clientes no lo reexpone (F.7). */
export function listCustomerProjects(customerId: string, query: ListQuery): Promise<PaginatedResponse<CustomerProjectItem>> {
  return httpClient.get<PaginatedResponse<CustomerProjectItem>>('/projects', { query: { ...query, customerId } });
}
