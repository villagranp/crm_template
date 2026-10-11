/**
 * Datos de prueba de las pruebas unitarias del Módulo 2 (Clientes). Sin base de
 * datos: registros con la forma de los puertos y valores ficticios.
 */
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { AuditContext } from '@/modules/audit/audit.service';

import type { CustomerActor } from '../customer-actor.resolver';
import type { VisibleCustomer } from '../customer-visibility.service';
import type { ContactRecord } from '../ports/contacts.repository.port';
import type { CountryRecord, CustomerRecord, CustomerVisibility } from '../ports/customers.repository.port';

/** Transacción opaca: las pruebas solo comprueban que se propaga. */
export const TX = { tx: 'test-transaction' } as unknown as TransactionContext;

export const AUDIT: AuditContext = { correlationId: 'corr-1', actorId: 'user-1', actorEmail: null, ipAddress: null };

export const CREATED_AT = new Date('2026-01-01T00:00:00Z');

export function makeActor(permissions: readonly string[], userId: string | null = 'user-1'): CustomerActor {
  return { userId, permissions: new Set(permissions), audit: AUDIT };
}

export function makeCountry(overrides: Partial<CountryRecord> = {}): CountryRecord {
  return {
    id: 'country-gt',
    isoCode: 'GT',
    name: 'Guatemala',
    phonePrefix: '+502',
    taxIdLabel: 'NIT',
    taxIdPattern: null,
    phonePattern: null,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

export function makeCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'customer-1',
    crmCode: 'CLI-000001',
    customerCode: 'AB-12',
    customerCodeNormalized: 'AB12',
    legalName: 'Constructora Peña S.A.',
    legalNameNormalized: 'constructora pena s.a.',
    tradeName: null,
    taxId: '1234567',
    taxIdNormalized: '1234567',
    country: makeCountry(),
    city: 'Guatemala',
    address: null,
    phone: '2222 3333',
    email: 'ventas@example.com',
    companyType: null,
    status: { id: 'status-active', code: 'ACTIVO', label: 'Activo', isActive: true, countsAsActive: true },
    rating: null,
    salesOwner: { id: 'user-1', displayName: 'Responsable Uno', isActive: true },
    primaryContact: null,
    sourceImport: null,
    deletedAt: null,
    createdAt: CREATED_AT,
    createdBy: null,
    updatedAt: CREATED_AT,
    updatedBy: null,
    ...overrides,
  };
}

export function makeContact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'contact-1',
    customerId: 'customer-1',
    firstName: 'Ana',
    lastName: 'Peña',
    jobTitle: 'Compras',
    phone: '2222 3333',
    email: 'ana@example.com',
    emailNormalized: 'ana@example.com',
    isActive: true,
    isPrimary: false,
    comments: null,
    hasHistory: false,
    deletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** Alcance `FILTERED` por dueño (alcance OWN/TEAM simplificado). */
export function ownerScope(ownerIds: readonly string[], userId: string | null = 'user-1'): VisibilityScope {
  return { kind: 'FILTERED', userId, dataScope: 'OWN', ownerIds, teamIds: [], countryIds: [] };
}

export function makeVisibility(ownerIds: readonly string[] = ['user-1']): CustomerVisibility {
  return { direct: ownerScope(ownerIds), inherited: ownerScope(ownerIds) };
}

export function makeVisible(record: CustomerRecord = makeCustomer(), access: VisibleCustomer['access'] = 'DIRECT'): VisibleCustomer {
  return { record, access, visibility: makeVisibility() };
}
