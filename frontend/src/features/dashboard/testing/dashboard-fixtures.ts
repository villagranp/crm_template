import type { Mock } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';

import type {
  ActivityIndicators,
  AlertsSummary,
  DashboardAlert,
  ForecastIndicators,
  OpportunityIndicators,
  PaginatedAlerts,
  PaginatedRecentActivity,
  PaginatedUpcomingVisits,
  ProjectIndicators,
  RecentActivityItem,
  TargetIndicators,
  UpcomingVisit,
  VisitIndicators,
} from '../dashboard.types';

/** Datos de prueba del Panel de control (forma exacta de los DTO de 01 §F.1). */

export const GENERATED_AT = '2026-10-13T15:04:00Z';

/** Todos los permisos de fuente del panel. */
export const ALL_SOURCE_PERMISSIONS = [
  'proyectos.ver',
  'oportunidades.ver',
  'forecast.ver',
  'visitas.ver',
  'actividades.ver',
  'metas.ver',
  'clientes.ver',
];

/** Sesión autenticada con estos permisos efectivos. */
export function setSessionPermissions(permissions: string[]): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'u-1',
      displayName: 'Ana López',
      email: 'ana@example.test',
      roles: ['asesor'],
      permissions,
    },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

export function resetSession(): void {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

export function projectIndicators(overrides: Partial<ProjectIndicators> = {}): ProjectIndicators {
  return { activeProjects: 42, generatedAt: GENERATED_AT, ...overrides };
}

export function opportunityIndicators(
  overrides: Partial<OpportunityIndicators> = {},
): OpportunityIndicators {
  return {
    open: {
      count: 17,
      byStage: [
        { stageId: 's-1', code: 'CONTACTADO', label: 'Contactado', order: 1, count: 4 },
        { stageId: 's-2', code: 'COTIZANDO', label: 'Cotizando', order: 2, count: 11 },
        { stageId: 's-3', code: 'NEGOCIANDO', label: 'Negociando', order: 3, count: 2 },
        { stageId: 's-4', code: 'PROPUESTA', label: 'Propuesta', order: 4, count: 0 },
      ],
    },
    won: { count: 5, wonCount: 4, partialCount: 1 },
    lost: { count: 2 },
    period: { from: '2026-10-01', to: '2026-10-31', kind: 'MONTH' },
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

export function forecastIndicators(
  overrides: Partial<ForecastIndicators> = {},
): ForecastIndicators {
  return {
    window: { from: { year: 2026, month: 11 }, to: { year: 2027, month: 4 } },
    tonnageUnit: { code: 'TON', symbol: 't' },
    totalTonnage: '1250.5000',
    months: [
      { year: 2026, month: 11, tonnage: '210.0000', lineCount: 8 },
      { year: 2026, month: 12, tonnage: '1040.5000', lineCount: 3 },
    ],
    unconvertedLines: 3,
    quantitiesByUnit: [{ unitCode: 'VAR', unitSymbol: 'var', quantity: '1200.0000' }],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

export function visitIndicators(overrides: Partial<VisitIndicators> = {}): VisitIndicators {
  return {
    pending: { count: 9, overdueCount: 2 },
    upcoming: { count: 4, days: 7 },
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

export function activityIndicators(
  overrides: Partial<ActivityIndicators> = {},
): ActivityIndicators {
  return {
    pending: { count: 14, dueSoonCount: 3, dueSoonHours: 48 },
    overdue: { count: 5 },
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

export function targetIndicators(overrides: Partial<TargetIndicators> = {}): TargetIndicators {
  return {
    hasTargets: true,
    period: { from: '2026-10-01', to: '2026-10-31', kind: 'MONTH' },
    items: [
      {
        targetId: 't-1',
        metric: 'TONNAGE',
        subject: { type: 'USER', id: 'u-1', label: 'Ana López' },
        targetValue: '500.0000',
        achievedValue: '320.0000',
        compliancePercent: '64.00',
        unit: { code: 'TON', symbol: 't' },
        currencyCode: null,
      },
    ],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

export function emptyTargets(): TargetIndicators {
  return targetIndicators({ hasTargets: false, items: [] });
}

export function upcomingVisit(overrides: Partial<UpcomingVisit> = {}): UpcomingVisit {
  return {
    id: 'v-1',
    code: 'VIS-2026-00042',
    scheduledStartAt: '2026-10-14T15:30:00Z',
    scheduledEndAt: null,
    status: { code: 'PROGRAMADA', label: 'Programada' },
    objective: 'Presentar la cotización',
    owner: { id: 'u-1', displayName: 'Ana López' },
    customer: { id: 'c-1', crmCode: 'CLI-000123', name: 'Constructora Uno' },
    project: { id: 'p-1', code: 'PRY-2026-00042', name: 'Torre Norte' },
    reminderDue: false,
    ...overrides,
  };
}

export function paginated<T>(data: T[], totalItems = data.length, page = 1, pageSize = 20) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

export function upcomingVisitsPage(
  visits: UpcomingVisit[],
  totalItems = visits.length,
): PaginatedUpcomingVisits {
  return paginated(visits, totalItems, 1, 5);
}

export function recentActivityItem(
  overrides: Partial<RecentActivityItem> = {},
): RecentActivityItem {
  return {
    id: 'OPORTUNIDAD_ETAPA:h-1',
    eventType: 'OPORTUNIDAD_ETAPA',
    occurredAt: '2026-10-13T13:00:00Z',
    summary: 'Contactado → Cotizando',
    responsible: { id: 'u-1', displayName: 'Ana López' },
    customer: { id: 'c-1', crmCode: 'CLI-000123', name: 'Constructora Uno' },
    project: { id: 'p-1', code: 'PRY-2026-00042', name: 'Torre Norte' },
    source: { type: 'OPPORTUNITY', id: 'o-1', code: 'OPO-2026-00042', projectId: 'p-1' },
    ...overrides,
  };
}

export function recentActivityPage(
  items: RecentActivityItem[],
  page = 1,
  totalItems = items.length,
): PaginatedRecentActivity {
  return paginated(items, totalItems, page, 20);
}

export function dashboardAlert(overrides: Partial<DashboardAlert> = {}): DashboardAlert {
  return {
    id: 'PROYECTO_SIN_ACTUALIZAR:p-1',
    type: 'PROYECTO_SIN_ACTUALIZAR',
    description: 'Proyecto PRY-2026-00042 sin actualizaciones desde hace 31 días',
    priority: { code: 'MEDIA', label: 'Media', weight: 2 },
    responsible: { id: 'u-1', displayName: 'Ana López' },
    referenceDate: '2026-09-12T10:00:00Z',
    customer: { id: 'c-1', crmCode: 'CLI-000123', name: 'Constructora Uno' },
    project: { id: 'p-1', code: 'PRY-2026-00042', name: 'Torre Norte' },
    source: { type: 'PROJECT', id: 'p-1', code: 'PRY-2026-00042', projectId: null },
    ...overrides,
  };
}

export function alertsPage(alerts: DashboardAlert[], totalItems = alerts.length): PaginatedAlerts {
  return paginated(alerts, totalItems, 1, 10);
}

export function alertsSummary(overrides: Partial<AlertsSummary> = {}): AlertsSummary {
  return {
    items: [
      {
        type: 'ACTIVIDAD_VENCIDA',
        enabled: true,
        disabledReason: null,
        count: 5,
        priority: { code: 'ALTA', label: 'Alta', weight: 3 },
      },
      {
        type: 'PROYECTO_SIN_ACTUALIZAR',
        enabled: true,
        disabledReason: null,
        count: 1,
        priority: { code: 'MEDIA', label: 'Media', weight: 2 },
      },
      {
        type: 'VISITA_SIN_CONFIRMAR',
        enabled: false,
        disabledReason: 'PARAMETER_INVALID',
        count: 0,
        priority: null,
      },
    ],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

/** URLs (ruta + query, sin `/api/v1`) de las llamadas registradas por `mockApi`. */
export function requestedUrls(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([input]) => {
    const url = new URL(String(input), 'http://localhost');
    return `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
  });
}

/** Llamadas a rutas bajo `/dashboard`. */
export function dashboardRequests(fetchMock: Mock): string[] {
  return requestedUrls(fetchMock).filter((url) => url.startsWith('/dashboard'));
}
