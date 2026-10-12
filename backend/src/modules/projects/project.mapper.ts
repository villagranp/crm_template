import type { Page } from '@/infrastructure/database/ports/pagination';
import { catalogOrder, type CommercialStatus, isFinalPhase } from '@/modules/commercial-metrics/metric-definitions';

import type {
  CommercialStatusDto,
  ProjectCapabilitiesDto,
  ProjectClassificationDto,
  ProjectDetailDto,
  ProjectListItemDto,
  ProjectPhaseDto,
  TeamProjectItemDto,
} from './dto/project.dto';
import type { OwnerOptionDto, ProjectFormOptionsDto, TeamOptionDto } from './dto/project-options.dto';
import type { PhaseHistoryItemDto, ProjectHistoryEntryDto, ProjectProductDto, ProjectProductsDto } from './dto/project-subresources.dto';
import type { ProjectCapabilities } from './project-access-policy';
import { tonnageModeOf } from './project-classification.service';
import type { ProjectHistoryEntry } from './project-history.service';
import type { ProjectFormOptions } from './project-options.service';
import type { ProjectProductsView } from './project-products.service';
import type { ProjectDetailView, ProjectListItemView } from './projects.service';
import type { ProjectProductRecord } from './ports/project-products.repository.port';
import type { OwnerOptionRecord, PhaseHistoryRecord, ProjectRecord, TeamOptionRecord } from './ports/projects.repository.port';

function capabilitiesDto(capabilities: ProjectCapabilities): ProjectCapabilitiesDto {
  return { ...capabilities };
}

function commercialStatusDto(status: CommercialStatus): CommercialStatusDto {
  return { kind: status.kind, label: status.label, stage: status.stage ? { ...status.stage } : null };
}

export function toProjectListItemDto(view: ProjectListItemView): ProjectListItemDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    customer: record.customer,
    country: record.country,
    city: record.city,
    owner: record.owner,
    projectType: record.projectType ? { id: record.projectType.id, code: record.projectType.code, label: record.projectType.label } : null,
    phase: record.phase,
    commercialStatus: commercialStatusDto(view.commercialStatus),
    opportunityCount: record.commercial.opportunityCount,
    estimatedDecisionDate: record.estimatedDecisionDate,
    lastActivityAt: record.lastActivityAt.toISOString(),
    capabilities: capabilitiesDto(view.capabilities),
  };
}

export function toTeamProjectItemDto(view: ProjectListItemView): TeamProjectItemDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    customer: record.customer,
    owner: record.owner,
    team: record.team,
    phase: record.phase,
    commercialStatus: commercialStatusDto(view.commercialStatus),
    lastActivityAt: record.lastActivityAt.toISOString(),
    capabilities: capabilitiesDto(view.capabilities),
  };
}

export function toProjectClassificationDto(record: ProjectRecord): ProjectClassificationDto {
  return {
    projectType: record.projectType,
    sector: record.sector,
    measureUnit: record.measureUnit
      ? { id: record.measureUnit.id, code: record.measureUnit.code, symbol: record.measureUnit.symbol, dimension: record.measureUnit.dimension }
      : null,
    estimatedQuantity: record.estimatedQuantity,
    tonnageMode: tonnageModeOf(record),
    conversion: record.conversion ? { ...record.conversion } : null,
    estimatedTonnage: record.estimatedTonnage,
  };
}

export function toProjectPhaseDto(record: ProjectRecord): ProjectPhaseDto {
  return {
    phase: {
      id: record.phase.id,
      code: record.phase.code,
      label: record.phase.label,
      order: catalogOrder(record.phase),
      isFinal: isFinalPhase(record.phase),
    },
    progress: record.phaseProgress,
    updatedAt: record.phaseUpdatedAt.toISOString(),
    comment: record.phaseComment,
  };
}

export function toProjectDetailDto(view: ProjectDetailView): ProjectDetailDto {
  const { record } = view;
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    customer: record.customer,
    country: { id: record.country.id, isoCode: record.country.isoCode, name: record.country.name },
    city: record.city,
    owner: record.owner,
    projectType: record.projectType ? { id: record.projectType.id, code: record.projectType.code, label: record.projectType.label } : null,
    phase: toProjectPhaseDto(record),
    commercialStatus: commercialStatusDto(view.commercialStatus),
    opportunityCount: record.opportunities.length,
    estimatedDecisionDate: record.estimatedDecisionDate,
    lastActivityAt: record.lastActivityAt.toISOString(),
    capabilities: capabilitiesDto(view.capabilities),
    address: record.address,
    description: record.description,
    estimatedStartDate: record.estimatedStartDate,
    estimatedEndDate: record.estimatedEndDate,
    classification: toProjectClassificationDto(record),
    duplicatedFrom: view.duplicatedFrom,
    summary: { ...view.summary },
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

export function toPhaseHistoryItemDto(record: PhaseHistoryRecord): PhaseHistoryItemDto {
  return {
    id: record.id,
    fromPhase: record.fromPhase,
    toPhase: record.toPhase,
    fromProgress: record.fromProgress,
    toProgress: record.toProgress,
    comment: record.comment,
    changedBy: record.changedBy,
    changedAt: record.changedAt.toISOString(),
  };
}

export function toProjectHistoryEntryDto(entry: ProjectHistoryEntry): ProjectHistoryEntryDto {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt.toISOString(),
    actor: entry.actor,
    kind: entry.kind,
    event: entry.event,
    subject: entry.subject,
    changes: entry.changes.map((change) => ({ ...change })),
    comment: entry.comment,
  };
}

export function toProjectProductDto(record: ProjectProductRecord): ProjectProductDto {
  return {
    id: record.id,
    product: record.product,
    opportunity: record.opportunity,
    quantity: record.quantity,
    unit: { id: record.unit.id, code: record.unit.code, symbol: record.unit.symbol, dimension: record.unit.dimension },
    conversion: record.conversion,
    tonnage: record.tonnage,
    status: { id: record.status.id, code: record.status.code, label: record.status.label, isActive: record.status.countsInTotals },
    notes: record.notes,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

export function toProjectProductsDto(view: ProjectProductsView): ProjectProductsDto {
  const page: Page<ProjectProductRecord> = view.page;
  return {
    data: page.items.map(toProjectProductDto),
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      totalItems: page.totalItems,
      totalPages: page.pageSize > 0 ? Math.ceil(page.totalItems / page.pageSize) : 0,
    },
    totals: {
      tonnage: view.totals.tonnage,
      quantitiesByUnit: view.totals.quantitiesByUnit.map((entry) => ({ unit: { ...entry.unit }, quantity: entry.quantity })),
      linesWithoutConversion: view.totals.linesWithoutConversion,
    },
  };
}

export function toProjectFormOptionsDto(options: ProjectFormOptions): ProjectFormOptionsDto {
  return {
    countries: options.countries.map((country) => ({ ...country })),
    projectTypes: options.projectTypes.map((item) => ({ ...item })),
    sectors: options.sectors.map((item) => ({ ...item })),
    phases: options.phases.map((item) => ({ ...item })),
    stages: options.stages.map((item) => ({ ...item })),
    units: options.units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name, symbol: unit.symbol, dimension: unit.dimension })),
    productStatuses: options.productStatuses.map((item) => ({ ...item })),
    requiredFields: [...options.requiredFields],
    defaults: { ...options.defaults },
    baseCurrencyCode: options.baseCurrencyCode,
    progressRules: Object.fromEntries(Object.entries(options.progressRules).map(([code, rule]) => [code, { progresoMinimo: rule.progresoMinimo }])),
    tonnageUnit: { ...options.tonnageUnit },
    attachments: { maxMb: options.attachments.maxMb, allowedTypes: [...options.attachments.allowedTypes] },
  };
}

export function toOwnerOptionDto(record: OwnerOptionRecord): OwnerOptionDto {
  return { id: record.id, displayName: record.displayName, countryId: record.countryId, primaryTeam: record.primaryTeam };
}

export function toTeamOptionDto(record: TeamOptionRecord): TeamOptionDto {
  return { id: record.id, code: record.code, name: record.name, parentId: record.parentId };
}
