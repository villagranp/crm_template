import { vi, type Mock } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { errorResponse, jsonResponse } from '@/test/api-mocks';

import type { CustomerImport, CustomerImportListItem, CustomerImportRow, CustomerImportSettings } from '../customer-imports.api';

/**
 * Datos y ayudantes de las pruebas de la carga masiva de clientes. Datos
 * ficticios (nombres inventados, dominios `.example`), nunca de clientes reales.
 */

export const IMPORT_ID = '33333333-3333-4333-8333-333333333333';

export const SETTINGS: CustomerImportSettings = {
  enabled: true,
  maxFileSizeMb: 10,
  maxRows: 5000,
  formats: ['CSV', 'XLSX'],
  templateVersion: '1',
  columns: [
    { key: 'customerCode', header: 'Código de cliente', isRequired: false, maxLength: 50, description: 'Código propio.' },
    { key: 'legalName', header: 'Razón social', isRequired: true, maxLength: 200, description: 'Nombre legal de la empresa.' },
    { key: 'country', header: 'País', isRequired: true, maxLength: 2, description: 'Código ISO del país.' },
    { key: 'taxId', header: 'NIT', isRequired: false, maxLength: 30, description: 'Identificador fiscal.' },
  ],
};

export const DISABLED_SETTINGS: CustomerImportSettings = { ...SETTINGS, enabled: false };

export const LIST_ITEM: CustomerImportListItem = {
  id: IMPORT_ID,
  code: 'IMP-2026-0007',
  format: 'XLSX',
  originalFileName: 'clientes-octubre.xlsx',
  status: 'VALIDATED',
  totalRows: 10,
  validRows: 7,
  invalidRows: 3,
  importedRows: 0,
  startedBy: { id: 'u-1', displayName: 'Ana Asesora' },
  createdAt: '2026-10-05T15:00:00.000Z',
  completedAt: null,
};

export const VALIDATED_IMPORT: CustomerImport = {
  ...LIST_ITEM,
  templateVersion: '1',
  rejectedRows: 0,
  warningRows: 3,
  failureReason: null,
  validatedAt: '2026-10-05T15:00:05.000Z',
  confirmedBy: null,
  confirmedAt: null,
  isPurged: false,
  canConfirm: true,
  canCancel: true,
  hasErrorFile: true,
};

export function importWith(overrides: Partial<CustomerImport>): CustomerImport {
  return { ...VALIDATED_IMPORT, ...overrides };
}

export const VALID_ROW: CustomerImportRow = {
  rowNumber: 1,
  fileRowNumber: 2,
  status: 'VALID',
  values: {
    customerCode: 'AB-1',
    legalName: 'Constructora Ficticia S.A.',
    tradeName: null,
    country: 'GT',
    city: 'Guatemala',
    address: null,
    phone: null,
    email: 'info@ficticia.example',
    companyType: null,
    status: null,
    rating: null,
    salesOwner: null,
    taxId: '1234567K',
  },
  issues: [],
  duplicateOfRowNumber: null,
  duplicateOfCustomer: null,
  customer: null,
};

export const INVALID_ROW: CustomerImportRow = {
  ...VALID_ROW,
  rowNumber: 6,
  fileRowNumber: 7,
  status: 'INVALID',
  values: { ...VALID_ROW.values!, legalName: 'Inmobiliaria Inventada', country: 'ZZ' },
  issues: [
    { field: 'country', code: 'INVALID_COUNTRY', message: 'El país no existe o no está activo.', severity: 'ERROR' },
    {
      field: 'taxId',
      code: 'DUPLICATE_TAX_ID',
      message: 'Ya existe un cliente del mismo país con este NIT; puede tratarse de otro establecimiento del mismo cliente.',
      severity: 'WARNING',
    },
  ],
};

export const DUPLICATE_EXISTING_ROW: CustomerImportRow = {
  ...VALID_ROW,
  rowNumber: 8,
  fileRowNumber: 9,
  status: 'DUPLICATE_EXISTING',
  issues: [{ field: 'customerCode', code: 'CUSTOMER_CODE_TAKEN', message: 'Ya existe un cliente con este código de cliente.', severity: 'ERROR' }],
  duplicateOfCustomer: { id: 'c-9', crmCode: 'CLI-000009', legalName: 'Cliente Existente S.A.' },
};

export const IMPORTED_ROW: CustomerImportRow = {
  ...VALID_ROW,
  status: 'IMPORTED',
  customer: { id: 'c-20', crmCode: 'CLI-000020' },
};

export const PURGED_ROW: CustomerImportRow = { ...INVALID_ROW, values: null };

export function page<T>(items: T[], totalItems = items.length) {
  return jsonResponse({ data: items, pagination: { page: 1, pageSize: 20, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 20)) } });
}

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

export const ALL_IMPORT_PERMISSIONS = ['importaciones.ver', 'importaciones.crear', 'clientes.crear', 'clientes.ver'];

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

/** Archivo de prueba con el tamaño indicado (contenido ficticio). */
export function testFile(name: string, sizeBytes = 64, type = ''): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

export type UrlRouteHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/**
 * Como `mockApi` de `@/test/api-mocks`, pero el manejador recibe también la URL
 * (con sus parámetros): las filas se piden con filtros distintos según la
 * vista. Responde `MÉTODO /ruta` sin el prefijo `/api/v1`; sin manejador, 404.
 */
export function mockImportApi(routes: Record<string, UrlRouteHandler>): Mock {
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const handler = routes[`${init.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}`];
    return handler ? handler(url, init) : errorResponse(404, 'NOT_FOUND');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** URLs de las llamadas a una ruta (sin el prefijo `/api/v1`). */
export function urlsTo(fetchMock: Mock, method: string, path: string): URL[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (((init ?? {}) as RequestInit).method ?? 'GET') === method)
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.replace(/^\/api\/v1/, '') === path);
}
