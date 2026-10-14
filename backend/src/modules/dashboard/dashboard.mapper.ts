import type { Page } from '@/infrastructure/database/ports/pagination';
import type {
  ActivityCounts,
  ForecastWindowSummary,
  TargetCompliance,
  VisitCounts,
} from '@/modules/commercial-metrics/commercial-metrics.service';

import type { AlertSummaryView, AlertView } from './dashboard-alerts.service';
import type { RecentActivityView, UpcomingVisitView } from './dashboard-activity.service';
import type { OpportunityIndicators, ResolvedPeriod } from './dashboard-indicators.service';
import type {
  PaginatedRecentActivityDto,
  PaginatedUpcomingVisitsDto,
} from './dto/dashboard-activity.dto';
import type { AlertsSummaryResponseDto, PaginatedDashboardAlertsDto } from './dto/dashboard-alerts.dto';
import type {
  ActivityIndicatorsResponseDto,
  ForecastIndicatorsResponseDto,
  OpportunityIndicatorsResponseDto,
  PeriodDto,
  ProjectIndicatorsResponseDto,
  TargetIndicatorsResponseDto,
  VisitIndicatorsResponseDto,
} from './dto/dashboard-indicators.dto';
import type { NamedRef } from './ports/dashboard-read-model.port';

function pagination<T>(page: Page<T>): { page: number; pageSize: number; totalItems: number; totalPages: number } {
  return { page: page.page, pageSize: page.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / page.pageSize) };
}

function customer(ref: NamedRef | null): { id: string; crmCode: string; name: string } | null {
  return ref ? { id: ref.id, crmCode: ref.code, name: ref.name } : null;
}

function project(ref: NamedRef | null): { id: string; code: string; name: string } | null {
  return ref ? { id: ref.id, code: ref.code, name: ref.name } : null;
}

function period(value: ResolvedPeriod): PeriodDto {
  return { from: value.from, to: value.to, kind: value.kind };
}

export function toProjectIndicators(activeProjects: number, generatedAt: Date): ProjectIndicatorsResponseDto {
  return { activeProjects, generatedAt: generatedAt.toISOString() };
}

export function toOpportunityIndicators(value: OpportunityIndicators, generatedAt: Date): OpportunityIndicatorsResponseDto {
  return {
    open: { count: value.open.total, byStage: value.open.byStage.map((stage) => ({ ...stage })) },
    won: { count: value.won.total, wonCount: value.won.won, partialCount: value.won.partial },
    lost: { count: value.lost },
    period: period(value.period),
    generatedAt: generatedAt.toISOString(),
  };
}

export function toForecastIndicators(value: ForecastWindowSummary, generatedAt: Date): ForecastIndicatorsResponseDto {
  return {
    window: { from: { ...value.window.from }, to: { ...value.window.to } },
    tonnageUnit: value.tonnageUnit ? { code: value.tonnageUnit.code, symbol: value.tonnageUnit.symbol } : null,
    totalTonnage: value.totalTonnage,
    months: value.months.map((month) => ({ ...month })),
    unconvertedLines: value.unconvertedLines,
    quantitiesByUnit: value.quantitiesByUnit.map((entry) => ({ ...entry })),
    generatedAt: generatedAt.toISOString(),
  };
}

export function toVisitIndicators(value: VisitCounts, generatedAt: Date): VisitIndicatorsResponseDto {
  return {
    pending: { count: value.pending, overdueCount: value.overdue },
    upcoming: { count: value.upcoming, days: value.upcomingDays },
    generatedAt: generatedAt.toISOString(),
  };
}

export function toActivityIndicators(value: ActivityCounts, generatedAt: Date): ActivityIndicatorsResponseDto {
  return {
    pending: { count: value.pending, dueSoonCount: value.dueSoon, dueSoonHours: value.dueSoonHours },
    overdue: { count: value.overdue },
    generatedAt: generatedAt.toISOString(),
  };
}

export function toTargetIndicators(value: { period: ResolvedPeriod; items: readonly TargetCompliance[] }, generatedAt: Date): TargetIndicatorsResponseDto {
  return {
    hasTargets: value.items.length > 0,
    period: period(value.period),
    items: value.items.map((item) => ({
      targetId: item.targetId,
      metric: item.metric,
      subject: { ...item.subject },
      targetValue: item.targetValue,
      achievedValue: item.achievedValue,
      compliancePercent: item.compliancePercent,
      unit: item.unit ? { code: item.unit.code, symbol: item.unit.symbol } : null,
      currencyCode: item.currencyCode,
    })),
    generatedAt: generatedAt.toISOString(),
  };
}

export function toUpcomingVisits(page: Page<UpcomingVisitView>): PaginatedUpcomingVisitsDto {
  return {
    data: page.items.map((visit) => ({
      id: visit.id,
      code: visit.code,
      scheduledStartAt: visit.scheduledStartAt.toISOString(),
      scheduledEndAt: visit.scheduledEndAt ? visit.scheduledEndAt.toISOString() : null,
      status: { ...visit.status },
      objective: visit.objective,
      owner: { ...visit.owner },
      customer: customer(visit.customer) as { id: string; crmCode: string; name: string },
      project: project(visit.project),
      reminderDue: visit.reminderDue,
    })),
    pagination: pagination(page),
  };
}

export function toRecentActivity(page: Page<RecentActivityView>): PaginatedRecentActivityDto {
  return {
    data: page.items.map((event) => ({
      id: `${event.eventType}:${event.eventId}`,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      summary: event.summary,
      responsible: { ...event.responsible },
      customer: customer(event.customer),
      project: project(event.project),
      source: { type: event.sourceType, id: event.sourceId, code: event.sourceCode, projectId: event.sourceProjectId },
    })),
    pagination: pagination(page),
  };
}

const ALERT_SOURCE_TYPES = {
  ACTIVIDAD_VENCIDA: 'ACTIVITY',
  VISITA_SIN_CONFIRMAR: 'VISIT',
  PROYECTO_SIN_ACTUALIZAR: 'PROJECT',
  OPORTUNIDAD_SIN_SIGUIENTE_ACCION: 'OPPORTUNITY',
} as const;

export function toAlerts(page: Page<AlertView>): PaginatedDashboardAlertsDto {
  return {
    data: page.items.map((alert) => ({
      id: alert.id,
      type: alert.type,
      description: alert.description,
      priority: { ...alert.priority },
      responsible: { ...alert.owner },
      referenceDate: alert.referenceDate.toISOString(),
      customer: customer(alert.customer),
      project: project(alert.project),
      source: { type: ALERT_SOURCE_TYPES[alert.type], id: alert.sourceId, code: alert.sourceCode, projectId: alert.sourceProjectId },
    })),
    pagination: pagination(page),
  };
}

export function toAlertsSummary(items: readonly AlertSummaryView[], generatedAt: Date): AlertsSummaryResponseDto {
  return {
    items: items.map((item) => ({ ...item, priority: item.priority ? { ...item.priority } : null })),
    generatedAt: generatedAt.toISOString(),
  };
}
