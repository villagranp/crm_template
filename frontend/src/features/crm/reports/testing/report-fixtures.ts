import { vi, type Mock } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { jsonResponse } from '@/test/api-mocks';

import type { ReportFilterOptions } from '../common/report-types';
import type { ActivityReportRow, ActivityReportSummary } from '../activities/activities-report.api';
import type { ForecastGroup, ForecastReportRow, ForecastReportSummary } from '../forecast/forecast-report.api';
import type { OpportunityReportRow, OpportunityReportSummary } from '../opportunities/opportunities-report.api';
import type { ProjectReportRow } from '../projects/projects-report.api';
import type { VisitReportRow, VisitReportSummary } from '../visits/visits-report.api';

/**
 * Datos y ayudantes de las pruebas de Reportes. Datos ficticios (dominios `.example`), nunca de
 * clientes reales. Los ids son cortos y legibles: el frontend no los valida como UUID.
 */

export const ME = { id: 'u-1', displayName: 'Ana Asesora' };
export const OTHER_OWNER = { id: 'u-2', displayName: 'Luis Gerente' };
export const CUSTOMER = { id: 'c-1', name: 'Constructora Peña S.A.' };
export const PROJECT = { id: 'p-1', code: 'PRY-2026-00001', name: 'Torre Norte' };
export const GUATEMALA = { id: 'gt', name: 'Guatemala' };
export const EL_SALVADOR = { id: 'sv', name: 'El Salvador' };

export const STAGE_CONTACTED = { id: 'st-contact', code: 'CONTACTADO', label: 'Contactado', isActive: true, order: 1, isClosed: false, inFunnel: true };
export const STAGE_QUOTING = { id: 'st-quote', code: 'COTIZANDO', label: 'Cotizando', isActive: true, order: 2, isClosed: false, inFunnel: true };
export const STAGE_CLOSED = { id: 'st-closed', code: 'CERRADA', label: 'Cerrada', isActive: true, order: 9, isClosed: true, inFunnel: false };

export const FILTER_OPTIONS: ReportFilterOptions = {
  owners: [OTHER_OWNER, ME],
  countries: [GUATEMALA, EL_SALVADOR],
  catalogs: {
    opportunityStages: [STAGE_QUOTING, STAGE_CONTACTED, STAGE_CLOSED],
    projectPhases: [
      { id: 'ph-design', code: 'DISENO', label: 'Diseño', isActive: true, order: 1, isFinal: false },
      { id: 'ph-done', code: 'TERMINADO', label: 'Terminado', isActive: true, order: 9, isFinal: true },
    ],
    projectTypes: [{ id: 'pt-res', code: 'RESIDENCIAL', label: 'Residencial', isActive: true }],
    visitStatuses: [
      { id: 'vs-prog', code: 'PROGRAMADA', label: 'Programada', isActive: true, category: 'SCHEDULED' },
      { id: 'vs-done', code: 'REALIZADA', label: 'Realizada', isActive: true, category: 'COMPLETED' },
    ],
    activityStatuses: [
      { id: 'as-pend', code: 'PENDIENTE', label: 'Pendiente', isActive: true, group: 'OPEN' },
      { id: 'as-done', code: 'COMPLETADA', label: 'Completada', isActive: true, group: 'COMPLETED' },
    ],
    activityTypes: [{ id: 'at-call', code: 'LLAMADA', label: 'Llamada', isActive: true }],
    priorities: [{ id: 'pr-high', code: 'ALTA', label: 'Alta', isActive: true, weight: 30 }],
    companyTypes: [{ id: 'ct-const', code: 'CONSTRUCTORA', label: 'Constructora', isActive: true }],
  },
  productFamilies: [{ id: 'fam-steel', name: 'Acero' }],
  scope: 'TEAM',
};

export const PROJECT_ROW: ProjectReportRow = {
  id: 'p-1',
  code: PROJECT.code,
  name: PROJECT.name,
  customer: CUSTOMER,
  country: GUATEMALA,
  city: 'Mixco',
  owner: ME,
  projectType: { id: 'pt-res', label: 'Residencial' },
  phase: { id: 'ph-design', label: 'Diseño', isFinal: false },
  phaseProgress: '45.00',
  commercialStatus: { kind: 'OPEN_STAGE', label: 'Cotizando', stage: { id: STAGE_QUOTING.id, label: 'Cotizando' } },
  estimatedDecisionDate: '2026-11-30',
  lastActivityAt: '2026-10-12T15:00:00.000Z',
};

export const OPPORTUNITY_ROW_GTQ: OpportunityReportRow = {
  id: 'o-1',
  code: 'OPO-2026-00001',
  project: PROJECT,
  customer: CUSTOMER,
  owner: ME,
  stage: { id: STAGE_CLOSED.id, label: 'Cerrada', isClosed: true },
  result: { outcome: 'PARTIAL', reason: null, awardedPercent: '60.00' },
  estimate: {
    amount: '7750.0000',
    currencyCode: 'GTQ',
    exchangeRate: '7.75000000',
    exchangeRateDate: '2026-10-01',
    amountUsd: '1000.0000',
    tonnage: '12.5000',
  },
  decisionDate: '2026-10-05',
  decisionDateKind: 'ACTUAL',
  updatedAt: '2026-10-06T15:00:00.000Z',
};

export const OPPORTUNITY_ROW_USD: OpportunityReportRow = {
  id: 'o-2',
  code: 'OPO-2026-00002',
  project: PROJECT,
  customer: CUSTOMER,
  owner: OTHER_OWNER,
  stage: { id: STAGE_QUOTING.id, label: 'Cotizando', isClosed: false },
  result: null,
  estimate: { amount: '2500.0000', currencyCode: 'USD', exchangeRate: '1.00000000', exchangeRateDate: null, amountUsd: '2500.0000', tonnage: null },
  decisionDate: '2026-11-30',
  decisionDateKind: 'ESTIMATED',
  updatedAt: '2026-10-07T15:00:00.000Z',
};

export function opportunitySummary(overrides: Partial<OpportunityReportSummary['estimateTotals']> = {}): OpportunityReportSummary {
  return {
    total: 10,
    open: 4,
    won: 3,
    wonFull: 1,
    partial: 2,
    lost: 2,
    closedWithoutResult: 1,
    byStage: [
      { stage: { ...STAGE_CONTACTED, isActive: true }, count: 0 },
      { stage: { ...STAGE_QUOTING, isActive: true }, count: 4 },
      { stage: { ...STAGE_CLOSED, isActive: true }, count: 6 },
    ],
    byOwner: [
      { owner: ME, total: 6, open: 2, won: 2, partial: 1, lost: 1 },
      { owner: OTHER_OWNER, total: 4, open: 2, won: 1, partial: 1, lost: 1 },
    ],
    estimateTotals: {
      amountUsd: '125000.0000',
      currencyCode: 'USD',
      tonnage: '340.5000',
      localReference: null,
      localReferenceUnavailableReason: 'MULTIPLE_COUNTRIES',
      ...overrides,
    },
  };
}

export const KG = { id: 'un-kg', code: 'KG', symbol: 'kg' };
export const VAR = { id: 'un-var', code: 'VAR', symbol: 'VAR' };

export const FORECAST_ROW: ForecastReportRow = {
  id: 'fl-1',
  project: PROJECT,
  customer: CUSTOMER,
  product: { id: 'pr-1', sku: 'VAR-3', description: 'Varilla corrugada #3' },
  family: { id: 'fam-steel', name: 'Acero' },
  year: 2026,
  month: 11,
  quantity: '120.0000',
  unit: VAR,
  tonnage: null,
  owner: ME,
  updatedAt: '2026-10-10T15:00:00.000Z',
};

export const FORECAST_SUMMARY: ForecastReportSummary = {
  range: { from: { year: 2026, month: 11 }, to: { year: 2026, month: 12 } },
  months: [
    {
      year: 2026,
      month: 11,
      tonnage: '10.0000',
      cumulativeTonnage: '10.0000',
      quantities: [
        { unit: KG, quantity: '10000.0000', cumulative: '10000.0000' },
        { unit: VAR, quantity: '120.0000', cumulative: '120.0000' },
      ],
      lineCount: 2,
      linesWithoutConversion: 1,
    },
    {
      year: 2026,
      month: 12,
      tonnage: '5.5000',
      cumulativeTonnage: '15.5000',
      quantities: [{ unit: KG, quantity: '5500.0000', cumulative: '15500.0000' }],
      lineCount: 1,
      linesWithoutConversion: 0,
    },
  ],
  totals: {
    tonnage: '15.5000',
    quantities: [
      { unit: KG, quantity: '15500.0000' },
      { unit: VAR, quantity: '120.0000' },
    ],
    lineCount: 3,
    linesWithoutConversion: 1,
  },
  tonnageUnit: 'TON',
  lastUpdatedAt: '2026-10-10T15:00:00.000Z',
  lineCount: 3,
};

export const FORECAST_GROUP: ForecastGroup = {
  key: { type: 'PRODUCT', id: 'pr-1', label: 'VAR-3 · Varilla corrugada #3' },
  months: [
    { year: 2026, month: 11, tonnage: '10.0000', quantities: [{ unit: KG, quantity: '10000.0000' }], lineCount: 1, linesWithoutConversion: 0 },
    { year: 2026, month: 12, tonnage: '5.5000', quantities: [{ unit: KG, quantity: '5500.0000' }], lineCount: 1, linesWithoutConversion: 0 },
  ],
  total: { tonnage: '15.5000', quantities: [{ unit: KG, quantity: '15500.0000' }], lineCount: 2, linesWithoutConversion: 0 },
  subgroups: null,
};

export const VISIT_ROW: VisitReportRow = {
  id: 'v-1',
  code: 'VIS-2026-00001',
  customer: CUSTOMER,
  project: PROJECT,
  owner: ME,
  scheduledStartAt: '2026-10-20T15:00:00.000Z',
  originalScheduledAt: '2026-09-20T15:00:00.000Z',
  rescheduleCount: 2,
  actualStartAt: null,
  status: { id: 'vs-prog', label: 'Reprogramada', category: 'SCHEDULED' },
  result: null,
  resultSummary: null,
  confirmedAt: null,
};

export const VISIT_SUMMARY: VisitReportSummary = {
  total: 9,
  scheduled: 4,
  completed: 2,
  confirmed: 2,
  cancelled: 1,
  completedTotal: 4,
  rescheduledVisits: 1,
  rescheduleEvents: 2,
  overduePending: 1,
};

export const ACTIVITY_ROW: ActivityReportRow = {
  id: 'a-1',
  code: 'ACT-2026-000001',
  type: { id: 'at-call', label: 'Llamada' },
  subject: 'Llamar para cotización',
  customer: CUSTOMER,
  project: null,
  owner: ME,
  activityDate: '2026-10-09T15:00:00.000Z',
  dueAt: '2026-10-10T15:00:00.000Z',
  priority: { id: 'pr-high', label: 'Alta', weight: 30 },
  status: { id: 'as-pend', label: 'Pendiente', category: 'OVERDUE' },
  isOverdue: true,
  result: null,
  resultNotes: null,
};

export const ACTIVITY_SUMMARY: ActivityReportSummary = { total: 10, pending: 3, overdue: 2, completed: 4, cancelled: 1, dueSoon: 1, dueSoonHours: 48 };

/** Respuesta paginada estándar (`{ data, pagination }`). */
export function page<T>(items: T[], totalItems = items.length) {
  return jsonResponse({ data: items, pagination: { page: 1, pageSize: 20, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 20)) } });
}

/** Permisos de un manager con reportes y exportación (sin `actividades.ver`: zona del navegador). */
export const MANAGER_PERMISSIONS = ['reportes.ver', 'reportes.exportar', 'proyectos.ver', 'oportunidades.ver', 'clientes.ver'];
/** Asesor: ve reportes, sin exportar (DM-11). */
export const ADVISOR_PERMISSIONS = ['reportes.ver'];

export function signInWith(permissions: string[]): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: ME.id, displayName: ME.displayName, email: 'ana@example.test', roles: ['manager'], permissions },
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

/** Pantalla estrecha (tarjetas en lugar de tabla). */
export function simulateNarrowScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
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

/** Parámetros de la última llamada a una ruta (sin el prefijo `/api/v1`). */
export function lastQuery(fetchMock: Mock, path: string): URLSearchParams {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.replace(/^\/api\/v1/, '') === path);
  return urls[urls.length - 1]?.searchParams ?? new URLSearchParams();
}

/** Número de llamadas a una ruta. */
export function callCount(fetchMock: Mock, path: string): number {
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/v1/, '') === path).length;
}

/** Respuesta `.xlsx` de una exportación con sus cabeceras (F.4). */
export function xlsxResponse(fileName: string, rows: number): Response {
  return new Response('xlsx', {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${fileName}"`,
      'x-export-rows': String(rows),
    },
  });
}
