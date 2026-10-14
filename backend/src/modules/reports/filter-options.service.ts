import { Inject, Injectable } from '@nestjs/common';

import type { DataScope } from '@/modules/access/ports/access.repository.port';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import { CommercialMetricsService, type MetricCatalogItem } from '@/modules/commercial-metrics/commercial-metrics.service';
import {
  activityStateGroup,
  catalogOrder,
  isClosedStage,
  isFinalPhase,
  isFunnelStage,
  visitCategory,
  type VisitCategory,
} from '@/modules/commercial-metrics/metric-definitions';
import type { UserRef } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { type NamedRef, REPORTING_REPOSITORY, type ReportingRepository } from './ports/reporting.repository.port';
import type { ReportContext } from './report-context';

/** Catálogos sin semántica de cálculo que solo se ofrecen como opciones de filtro. */
export const REPORT_OPTION_CATALOGS = {
  projectType: 'crm.tipo_proyecto',
  activityType: 'crm.tipo_actividad',
  priority: 'crm.prioridad',
  companyType: 'crm.tipo_empresa',
} as const;

export interface CatalogOption {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
}

export interface ReportFilterOptions {
  readonly owners: readonly UserRef[];
  readonly countries: readonly NamedRef[];
  readonly catalogs: {
    readonly opportunityStages: readonly (CatalogOption & { order: number; isClosed: boolean; inFunnel: boolean })[];
    readonly projectPhases: readonly (CatalogOption & { order: number; isFinal: boolean })[];
    readonly projectTypes: readonly CatalogOption[];
    readonly visitStatuses: readonly (CatalogOption & { category: VisitCategory })[];
    readonly activityStatuses: readonly (CatalogOption & { group: 'OPEN' | 'COMPLETED' | 'CANCELLED' })[];
    readonly activityTypes: readonly CatalogOption[];
    readonly priorities: readonly (CatalogOption & { weight: number })[];
    readonly companyTypes: readonly CatalogOption[];
  };
  readonly productFamilies: readonly NamedRef[];
  readonly scope: DataScope;
  /** `crm.zona_horaria_negocio`: "hoy", períodos y fechas de calendario (P-05.27). */
  readonly businessTimeZone: string;
  /** Zona del perfil del usuario (`users.time_zone`) para los instantes; sin ella, la del negocio. */
  readonly timeZone: string;
}

function option(item: { id: string; code: string; label: string; isActive: boolean }): CatalogOption {
  return { id: item.id, code: item.code, label: item.label, isActive: item.isActive };
}

function weightOf(metadata: unknown): number {
  const weight = typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>)['weight'] : undefined;
  return typeof weight === 'number' && Number.isFinite(weight) ? weight : 0;
}

/**
 * Opciones de filtro autorizadas (05 B "operaciones transversales", E.1): asesores y
 * países **dentro del alcance** de `reportes.ver` (solo los que tienen registros visibles;
 * nunca una lista fija), valores de catálogo con su semántica y familias de producto. Publica
 * además las zonas horarias de presentación (aditivo, P-05.27) para que la interfaz no dependa
 * de los `form-options` de Actividad comercial.
 */
@Injectable()
export class FilterOptionsService {
  constructor(
    private readonly metrics: CommercialMetricsService,
    @Inject(REPORTING_REPOSITORY) private readonly reporting: ReportingRepository,
    private readonly catalogs: CatalogLookupService,
  ) {}

  async get(ctx: ReportContext): Promise<ReportFilterOptions> {
    const [semantics, owners, countries, productFamilies, projectTypes, activityTypes, priorities, companyTypes, userTimeZone] = await Promise.all([
      this.metrics.semantics(),
      this.reporting.visibleOwners(ctx.scope),
      this.reporting.visibleCountries(ctx.scope),
      this.reporting.productFamilies(),
      this.catalogItems(REPORT_OPTION_CATALOGS.projectType),
      this.catalogItems(REPORT_OPTION_CATALOGS.activityType),
      this.catalogItems(REPORT_OPTION_CATALOGS.priority),
      this.catalogItems(REPORT_OPTION_CATALOGS.companyType),
      this.reporting.userTimeZone(ctx.userId),
    ]);
    return {
      owners,
      countries: countries.map(({ id, name }) => ({ id, name })),
      catalogs: {
        opportunityStages: semantics.stages.map((stage: MetricCatalogItem) => ({
          ...option(stage),
          order: catalogOrder(stage),
          isClosed: isClosedStage(stage),
          inFunnel: isFunnelStage(stage),
        })),
        projectPhases: semantics.phases.map((phase) => ({ ...option(phase), order: catalogOrder(phase), isFinal: isFinalPhase(phase) })),
        projectTypes: projectTypes.map(option),
        visitStatuses: semantics.visitStatuses.map((status) => ({ ...option(status), category: visitCategory(status) })),
        activityStatuses: semantics.activityStatuses.map((status) => ({ ...option(status), group: activityStateGroup(status) })),
        activityTypes: activityTypes.map(option),
        priorities: priorities.map((item) => ({ ...option(item), weight: weightOf(item.metadata) })),
        companyTypes: companyTypes.map(option),
      },
      productFamilies,
      scope: ctx.dataScope,
      businessTimeZone: ctx.businessTimeZone,
      timeZone: userTimeZone?.trim() || ctx.businessTimeZone,
    };
  }

  private async catalogItems(key: string): Promise<{ id: string; code: string; label: string; isActive: boolean; metadata: unknown }[]> {
    return (await this.catalogs.findByKey(key))?.items ?? [];
  }
}
