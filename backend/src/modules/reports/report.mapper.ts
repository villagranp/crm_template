import type { ForecastAggregate, ForecastGroup, StageCount } from '@/modules/commercial-metrics/commercial-metrics.service';

import type { ActivityReportSummary, ActivityReportView } from './activity-report.service';
import type {
  ActivityReportRowDto,
  ActivityReportSummaryDto,
  ForecastGroupDto,
  ForecastReportRowDto,
  ForecastReportSummaryDto,
  ForecastSubgroupDto,
  ForecastTotalsDto,
  OpportunityReportRowDto,
  OpportunityReportSummaryDto,
  ProjectReportRowDto,
  ReportFilterOptionsDto,
  ReportStageCountDto,
  VisitReportRowDto,
  VisitReportSummaryDto,
} from './dto/report-response.dto';
import type { ReportFilterOptions } from './filter-options.service';
import type { ForecastReportSummary } from './forecast-report.service';
import type { OpportunityReportSummary, OpportunityReportView } from './opportunity-report.service';
import type { ForecastReportRecord } from './ports/reporting.repository.port';
import type { ProjectReportView } from './project-report.service';
import type { VisitReportSummary, VisitReportView } from './visit-report.service';

/** Registro → DTO de Reportes (05 F.3): instantes ISO-8601 UTC, decimales como texto; nunca modelos de Prisma. */

function iso(value: Date): string {
  return value.toISOString();
}

function optionalIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toProjectReportRowDto(view: ProjectReportView): ProjectReportRowDto {
  return {
    id: view.id,
    code: view.code,
    name: view.name,
    customer: view.customer,
    country: view.country,
    city: view.city,
    owner: view.owner,
    projectType: view.projectType,
    phase: view.phase,
    phaseProgress: view.phaseProgress,
    commercialStatus: {
      kind: view.commercialStatus.kind,
      label: view.commercialStatus.label,
      stage: view.commercialStatus.stage ? { id: view.commercialStatus.stage.id, label: view.commercialStatus.stage.label } : null,
    },
    estimatedDecisionDate: view.estimatedDecisionDate,
    lastActivityAt: iso(view.lastActivityAt),
  };
}

export function toOpportunityReportRowDto(view: OpportunityReportView): OpportunityReportRowDto {
  return {
    id: view.id,
    code: view.code,
    project: view.project,
    customer: view.customer,
    owner: view.owner,
    stage: view.stage,
    result: view.result,
    estimate: view.estimate,
    decisionDate: view.decisionDate,
    decisionDateKind: view.decisionDateKind,
    updatedAt: iso(view.updatedAt),
  };
}

function toStageCountDto(stage: StageCount): ReportStageCountDto {
  return {
    stage: { id: stage.stageId, code: stage.code, label: stage.label, order: stage.order, isClosed: stage.isClosed, isActive: stage.isActive },
    count: stage.count,
  };
}

export function toOpportunityReportSummaryDto(summary: OpportunityReportSummary): OpportunityReportSummaryDto {
  const { local } = summary.estimateTotals;
  return {
    total: summary.total,
    open: summary.open,
    won: summary.won,
    wonFull: summary.wonFull,
    partial: summary.partial,
    lost: summary.lost,
    closedWithoutResult: summary.closedWithoutResult,
    byStage: summary.byStage.map(toStageCountDto),
    byOwner: summary.byOwner.map((owner) => ({ ...owner })),
    estimateTotals: {
      amountUsd: summary.estimateTotals.amountUsd,
      currencyCode: summary.estimateTotals.currencyCode,
      tonnage: summary.estimateTotals.tonnage,
      localReference: local.reference ? { ...local.reference } : null,
      localReferenceUnavailableReason: local.unavailableReason,
    },
  };
}

export function toForecastReportRowDto(record: ForecastReportRecord): ForecastReportRowDto {
  return { ...record, updatedAt: iso(record.updatedAt) };
}

function toTotalsDto(aggregate: ForecastAggregate): ForecastTotalsDto {
  return {
    tonnage: aggregate.tonnage,
    quantities: aggregate.quantities.map((entry) => ({ unit: entry.unit, quantity: entry.quantity })),
    lineCount: aggregate.lineCount,
    linesWithoutConversion: aggregate.linesWithoutConversion,
  };
}

function toSubgroupDto(group: ForecastGroup): ForecastSubgroupDto {
  return {
    key: group.key,
    months: group.months.map((month) => ({ year: month.year, month: month.month, ...toTotalsDto(month) })),
    total: toTotalsDto(group.total),
  };
}

export function toForecastGroupDto(group: ForecastGroup): ForecastGroupDto {
  return { ...toSubgroupDto(group), subgroups: group.subgroups ? group.subgroups.map(toSubgroupDto) : null };
}

export function toForecastReportSummaryDto(summary: ForecastReportSummary): ForecastReportSummaryDto {
  return {
    range: { from: { ...summary.range.from }, to: { ...summary.range.to } },
    months: summary.months.map((month) => ({
      year: month.year,
      month: month.month,
      tonnage: month.tonnage,
      cumulativeTonnage: month.cumulativeTonnage,
      quantities: month.quantities.map((entry) => ({ unit: entry.unit, quantity: entry.quantity, cumulative: entry.cumulative })),
      lineCount: month.lineCount,
      linesWithoutConversion: month.linesWithoutConversion,
    })),
    totals: toTotalsDto(summary.totals),
    tonnageUnit: summary.tonnageUnit,
    lastUpdatedAt: optionalIso(summary.lastUpdatedAt),
    lineCount: summary.lineCount,
  };
}

export function toVisitReportRowDto(view: VisitReportView): VisitReportRowDto {
  return {
    id: view.id,
    code: view.code,
    customer: view.customer,
    project: view.project,
    owner: view.owner,
    scheduledStartAt: iso(view.scheduledStartAt),
    originalScheduledAt: iso(view.originalScheduledAt),
    rescheduleCount: view.rescheduleCount,
    actualStartAt: optionalIso(view.actualStartAt),
    status: view.status,
    result: view.result,
    resultSummary: view.resultSummary,
    confirmedAt: optionalIso(view.confirmedAt),
  };
}

export function toVisitReportSummaryDto(summary: VisitReportSummary): VisitReportSummaryDto {
  return {
    total: summary.total,
    scheduled: summary.scheduled,
    completed: summary.completed,
    confirmed: summary.confirmed,
    cancelled: summary.cancelled,
    completedTotal: summary.completedTotal,
    rescheduledVisits: summary.rescheduledVisits,
    rescheduleEvents: summary.rescheduleEvents,
    overduePending: summary.overduePending,
  };
}

export function toActivityReportRowDto(view: ActivityReportView): ActivityReportRowDto {
  return {
    id: view.id,
    code: view.code,
    type: view.type,
    subject: view.subject,
    customer: view.customer,
    project: view.project,
    owner: view.owner,
    activityDate: optionalIso(view.activityDate),
    dueAt: optionalIso(view.dueAt),
    priority: view.priority,
    status: view.status,
    isOverdue: view.isOverdue,
    result: view.result,
    resultNotes: view.resultNotes,
  };
}

export function toActivityReportSummaryDto(summary: ActivityReportSummary): ActivityReportSummaryDto {
  return {
    total: summary.total,
    pending: summary.pending,
    overdue: summary.overdue,
    completed: summary.completed,
    cancelled: summary.cancelled,
    dueSoon: summary.dueSoon,
    dueSoonHours: summary.dueSoonHours,
  };
}

export function toReportFilterOptionsDto(options: ReportFilterOptions): ReportFilterOptionsDto {
  return {
    owners: [...options.owners],
    countries: [...options.countries],
    catalogs: {
      opportunityStages: [...options.catalogs.opportunityStages],
      projectPhases: [...options.catalogs.projectPhases],
      projectTypes: [...options.catalogs.projectTypes],
      visitStatuses: [...options.catalogs.visitStatuses],
      activityStatuses: [...options.catalogs.activityStatuses],
      activityTypes: [...options.catalogs.activityTypes],
      priorities: [...options.catalogs.priorities],
      companyTypes: [...options.catalogs.companyTypes],
    },
    productFamilies: [...options.productFamilies],
    scope: options.scope,
  };
}
