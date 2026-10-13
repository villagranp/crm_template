import { vi } from 'vitest';

import type { MenuModule } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse } from '@/test/api-mocks';

import type { Product, ProjectProduct, ProjectProductsResponse } from '../products/project-products.api';
import type {
  ProjectCapabilities,
  ProjectDetail,
  ProjectFormOptions,
  ProjectHistoryEntry,
  ProjectListItem,
  TeamProjectItem,
} from '../projects.api';

/**
 * Datos y ayudantes de las pruebas del submódulo de Proyectos. Datos ficticios
 * (dominios `.example`, nombres inventados), nunca de clientes reales.
 */

export const GT = { id: '11111111-1111-4111-8111-111111111111', isoCode: 'GT', name: 'Guatemala' };
export const SV = { id: '22222222-2222-4222-8222-222222222222', isoCode: 'SV', name: 'El Salvador' };

export const PHASES = [
  { id: 'ph-diseno', code: 'DISENO', label: 'Diseño', sortOrder: 1, order: 1, isFinal: false, defaultProgress: '10.00' },
  { id: 'ph-cotizacion', code: 'COTIZACION', label: 'Cotización', sortOrder: 2, order: 2, isFinal: false, defaultProgress: '30.00' },
  { id: 'ph-construccion', code: 'CONSTRUCCION', label: 'Construcción', sortOrder: 3, order: 3, isFinal: false, defaultProgress: null },
  { id: 'ph-finalizado', code: 'FINALIZADO', label: 'Finalizado', sortOrder: 4, order: 4, isFinal: true, defaultProgress: '100.00' },
];

export const UNITS = [
  { id: 'u-ton', code: 'TON', symbol: 't', dimension: 'MASS' as const, name: 'Tonelada' },
  { id: 'u-m2', code: 'M2', symbol: 'm²', dimension: 'AREA' as const, name: 'Metro cuadrado' },
  { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' as const, name: 'Varilla' },
];

export const FORM_OPTIONS: ProjectFormOptions = {
  countries: [
    { ...GT, currencyCode: 'GTQ' },
    { ...SV, currencyCode: 'USD' },
  ],
  projectTypes: [
    { id: 'pt-vivienda', code: 'VIVIENDA', label: 'Vivienda', sortOrder: 1 },
    { id: 'pt-industrial', code: 'INDUSTRIAL', label: 'Industrial', sortOrder: 2 },
  ],
  sectors: [{ id: 'sc-privado', code: 'PRIVADO', label: 'Privado', sortOrder: 1 }],
  phases: PHASES,
  stages: [
    { id: 'st-contactado', code: 'CONTACTADO', label: 'Contactado', sortOrder: 1, order: 1, isClosed: false, outcome: null },
    { id: 'st-cotizando', code: 'COTIZANDO', label: 'Cotizando', sortOrder: 2, order: 2, isClosed: false, outcome: null },
    { id: 'st-ganado', code: 'GANADO', label: 'Ganado', sortOrder: 3, order: 3, isClosed: true, outcome: 'WON' },
    { id: 'st-perdido', code: 'PERDIDO', label: 'Perdido', sortOrder: 4, order: 4, isClosed: true, outcome: 'LOST' },
  ],
  units: UNITS,
  productStatuses: [
    { id: 'ps-propuesto', code: 'PROPUESTO', label: 'Propuesto', sortOrder: 1, isActive: true },
    { id: 'ps-descartado', code: 'DESCARTADO', label: 'Descartado', sortOrder: 4, isActive: false },
  ],
  requiredFields: ['name', 'customerId', 'countryId', 'ownerId'],
  defaults: { phaseId: 'ph-diseno', stageId: 'st-contactado' },
  baseCurrencyCode: 'USD',
  progressRules: { FINALIZADO: { progresoMinimo: 100 } },
  tonnageUnit: { id: 'u-ton', code: 'TON', symbol: 't' },
  attachments: { maxMb: 1, allowedTypes: ['application/pdf', 'image/png'] },
};

export const ALL_CAPABILITIES: ProjectCapabilities = {
  canEdit: true,
  canAdminister: false,
  canDelete: false,
  canDuplicate: true,
  canCreateOpportunity: true,
  canEditForecast: true,
};

export const READ_ONLY: ProjectCapabilities = {
  canEdit: false,
  canAdminister: false,
  canDelete: false,
  canDuplicate: false,
  canCreateOpportunity: false,
  canEditForecast: false,
};

export const LIST_ITEM: ProjectListItem = {
  id: 'p-1',
  code: 'PRY-2026-00042',
  name: 'Torre Norte',
  customer: { id: 'c-1', legalName: 'Constructora Peña S.A.' },
  country: GT,
  city: 'Mixco',
  owner: { id: 'u-1', displayName: 'Ana Asesora' },
  projectType: { id: 'pt-vivienda', code: 'VIVIENDA', label: 'Vivienda' },
  phase: { id: 'ph-diseno', code: 'DISENO', label: 'Diseño', progress: '10.00' },
  commercialStatus: { kind: 'OPEN_STAGE', label: 'Cotizando', stage: { id: 'st-cotizando', code: 'COTIZANDO', label: 'Cotizando' } },
  opportunityCount: 2,
  estimatedDecisionDate: '2026-12-01',
  lastActivityAt: '2026-10-10T15:00:00.000Z',
  capabilities: ALL_CAPABILITIES,
};

export const PROJECT: ProjectDetail = {
  ...LIST_ITEM,
  phase: {
    phase: { id: 'ph-diseno', code: 'DISENO', label: 'Diseño', order: 1, isFinal: false },
    progress: '10.00',
    updatedAt: '2026-10-01T15:00:00.000Z',
    comment: null,
  },
  address: 'Zona 10',
  description: 'Torre de 12 niveles',
  estimatedStartDate: '2026-11-01',
  estimatedEndDate: '2027-06-30',
  classification: {
    projectType: null,
    sector: null,
    measureUnit: null,
    estimatedQuantity: null,
    tonnageMode: 'NONE',
    conversion: null,
    estimatedTonnage: null,
  },
  duplicatedFrom: null,
  summary: { openOpportunities: 1, wonOpportunities: 1, partialOpportunities: 0, lostOpportunities: 0, productLines: 2, attachments: 0 },
  createdAt: '2026-09-01T15:00:00.000Z',
  createdBy: { id: 'u-1', displayName: 'Ana Asesora' },
  updatedAt: '2026-10-01T15:00:00.000Z',
  updatedBy: null,
};

export function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return { ...PROJECT, ...overrides };
}

export const TEAM_ITEM: TeamProjectItem = {
  id: 'p-2',
  code: 'PRY-2026-00050',
  name: 'Bodega Sur',
  customer: { id: 'c-2', legalName: 'Distribuidora Sur' },
  owner: { id: 'u-2', displayName: 'Luis Asesor' },
  team: { id: 't-norte', code: 'NORTE', name: 'Norte' },
  phase: { id: 'ph-cotizacion', code: 'COTIZACION', label: 'Cotización', progress: '30.00' },
  commercialStatus: { kind: 'WON', label: 'Ganado', stage: null },
  lastActivityAt: '2026-10-09T15:00:00.000Z',
  capabilities: READ_ONLY,
};

export const PRODUCT: Product = {
  id: 'pr-var3',
  sku: 'VAR-3',
  description: 'Varilla corrugada #3',
  family: { id: 'fam-var', code: 'VARILLA', name: 'Varilla' },
  baseUnit: { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' },
  isActive: true,
};

export function projectProduct(overrides: Partial<ProjectProduct> = {}): ProjectProduct {
  return {
    id: 'pp-1',
    product: { id: PRODUCT.id, sku: PRODUCT.sku, description: PRODUCT.description, family: PRODUCT.family, isActive: true },
    opportunity: null,
    quantity: '120.0000',
    unit: { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' },
    conversion: { ruleId: 'r-1', scope: 'PRODUCT', factor: '0.00335000' },
    tonnage: '0.4020',
    status: { id: 'ps-propuesto', code: 'PROPUESTO', label: 'Propuesto', isActive: true },
    notes: null,
    updatedAt: '2026-10-01T15:00:00.000Z',
    updatedBy: null,
    ...overrides,
  };
}

export function productsPage(lines: ProjectProduct[], totals: Partial<ProjectProductsResponse['totals']> = {}): Response {
  const body: ProjectProductsResponse = {
    data: lines,
    pagination: { page: 1, pageSize: 20, totalItems: lines.length, totalPages: 1 },
    totals: { tonnage: '0', quantitiesByUnit: [], linesWithoutConversion: 0, ...totals },
  };
  return jsonResponse(body);
}

export function historyEntry(overrides: Partial<ProjectHistoryEntry> = {}): ProjectHistoryEntry {
  return {
    id: 'h-1',
    occurredAt: '2026-10-05T15:00:00.000Z',
    actor: { id: 'u-1', displayName: 'Ana Asesora' },
    kind: 'PROJECT_DATA',
    event: 'crm.project.updated',
    subject: null,
    changes: [{ field: 'name', before: 'Torre', after: 'Torre Norte' }],
    comment: null,
    ...overrides,
  };
}

export function page<T>(items: T[], totalItems = items.length): Response {
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

export const ASESOR_PERMISSIONS = ['proyectos.ver', 'proyectos.crear', 'proyectos.editar', 'clientes.ver', 'productos.ver'];

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

/** jsdom no implementa `matchMedia`: pantalla ancha (tablas y pestañas, no tarjetas ni acordeón). */
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

/** Parámetros de la última llamada a una ruta (para comprobar la consulta enviada). */
export function lastQuery(fetchMock: { mock: { calls: unknown[][] } }, path: string): URLSearchParams {
  const calls = fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.replace(/^\/api\/v1/, '') === path);
  return calls.at(-1)?.searchParams ?? new URLSearchParams();
}
