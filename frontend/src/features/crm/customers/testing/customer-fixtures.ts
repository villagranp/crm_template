import { vi } from 'vitest';

import type { MenuModule } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse } from '@/test/api-mocks';

import type { Contact, Customer, CustomerFormOptions, CustomerListItem } from '../customers.api';

/**
 * Datos y ayudantes de las pruebas del submódulo de Clientes. Datos ficticios
 * (dominios `.example`), nunca de clientes reales.
 */

export const GT = { id: '11111111-1111-4111-8111-111111111111', isoCode: 'GT', name: 'Guatemala' };
export const SV = { id: '22222222-2222-4222-8222-222222222222', isoCode: 'SV', name: 'El Salvador' };
export const STATUS_ACTIVE = { id: 'st-activo', code: 'ACTIVO', label: 'Activo', isActive: true };
export const STATUS_INACTIVE = { id: 'st-inactivo', code: 'INACTIVO', label: 'Inactivo', isActive: false };

export const FORM_OPTIONS: CustomerFormOptions = {
  countries: [
    { ...GT, phonePrefix: '+502', taxIdLabel: 'NIT', taxIdPattern: '[0-9]{6,9}K?', phonePattern: null },
    { ...SV, phonePrefix: '+503', taxIdLabel: 'NIT', taxIdPattern: null, phonePattern: '\\+?503 ?[0-9]{4}-?[0-9]{4}' },
  ],
  companyTypes: [{ id: 'ct-1', code: 'CONSTRUCTORA', label: 'Constructora', sortOrder: 1 }],
  statuses: [
    { ...STATUS_ACTIVE, sortOrder: 1 },
    { ...STATUS_INACTIVE, sortOrder: 2 },
  ],
  ratings: [{ id: 'rt-a', code: 'A', label: 'A', sortOrder: 1 }],
  defaults: { statusId: STATUS_ACTIVE.id, companyTypeId: null, ratingId: null },
  requiredFields: ['legalName', 'countryId'],
  attachments: { enabled: true, maxMb: 1, allowedTypes: ['application/pdf', 'image/png'] },
};

export const LIST_ITEM: CustomerListItem = {
  id: 'c-1',
  crmCode: 'CLI-000001',
  customerCode: 'AB-12',
  legalName: 'Constructora Peña S.A.',
  tradeName: 'Peña',
  country: GT,
  city: 'Guatemala',
  status: STATUS_ACTIVE,
  rating: null,
  salesOwner: { id: 'u-1', displayName: 'Ana Asesora' },
  access: 'DIRECT',
  isDeleted: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
};

export const CUSTOMER: Customer = {
  id: 'c-1',
  crmCode: 'CLI-000001',
  customerCode: 'AB-12',
  legalName: 'Constructora Peña S.A.',
  tradeName: 'Peña',
  taxId: '1234567K',
  country: { ...GT, taxIdLabel: 'NIT' },
  city: 'Guatemala',
  address: 'Zona 10',
  phone: '+502 2222-3333',
  email: 'info@pena.example',
  companyType: { id: 'ct-1', code: 'CONSTRUCTORA', label: 'Constructora', isActive: true },
  status: STATUS_ACTIVE,
  rating: null,
  salesOwner: { id: 'u-1', displayName: 'Ana Asesora', isActive: true },
  primaryContact: null,
  sourceImport: null,
  access: 'DIRECT',
  isDeleted: false,
  deletedAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  createdBy: { id: 'u-1', displayName: 'Ana Asesora' },
  updatedAt: '2026-10-01T10:00:00.000Z',
  updatedBy: null,
  capabilities: {
    canEdit: true,
    canDelete: false,
    canRestore: false,
    canManageAttachments: true,
    canManageContacts: true,
    canReassignOwner: false,
    editableFields: ['legalName', 'tradeName', 'taxId', 'city', 'address', 'phone', 'email', 'companyTypeId', 'statusId', 'ratingId'],
  },
};

export function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'ct-ana',
    customerId: 'c-1',
    firstName: 'Ana',
    lastName: 'López',
    fullName: 'Ana López',
    jobTitle: 'Compras',
    phone: null,
    email: 'ana@pena.example',
    isActive: true,
    isPrimary: false,
    comments: null,
    hasHistory: false,
    isDeleted: false,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

export function page<T>(items: T[], totalItems = items.length) {
  return jsonResponse({ data: items, pagination: { page: 1, pageSize: 20, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 20)) } });
}

export function menu(optionKeys: string[]): MenuModule[] {
  return [
    {
      key: 'crm',
      label: 'CRM',
      icon: null,
      order: 10,
      isSystem: false,
      options: optionKeys.map((key) => ({ id: `o-${key}`, key, label: key, icon: null, path: `/${key}`, order: 1, requiredPermission: null, children: [] })),
    },
  ];
}

export const ASESOR_PERMISSIONS = ['clientes.ver', 'clientes.crear', 'clientes.editar', 'contactos.ver', 'contactos.crear', 'contactos.editar'];

export function signInWith(permissions: string[]): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u-1', displayName: 'Ana Asesora', email: 'ana@example.test', roles: ['asesor'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

export function signOut(): void {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
}

/** jsdom no implementa `matchMedia`: pantalla ancha (tablas, no tarjetas). */
export function simulateWideScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** Cuerpo JSON enviado en una llamada registrada por `mockApi`. */
export function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}
