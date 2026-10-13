import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '@/infrastructure/database/ports/pagination';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { catalogOrder, isClosedStage, isFinalPhase } from '@/modules/commercial-metrics/metric-definitions';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { UnitOfMeasureRecord } from '@/modules/products/ports/product-catalog.reader.port';
import { ProductsService } from '@/modules/products/products.service';
import { type TonnageUnit, UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import { defaultProgressOf, type ProgressRules } from './phase-rules';
import { type ProjectActor, ProjectAccessService } from './project-access.service';
import { type ProjectCatalogItem, ProjectCatalogsService } from './project-catalogs.service';
import { PROJECT_CATALOGS, PROJECT_DEFAULT_KEYS, PROJECT_PARAMETERS, PROJECT_PERMISSIONS } from './project-constants';
import { projectRequiredFields } from './project-rules';
import {
  type CountryOptionRecord,
  type OwnerOptionRecord,
  type OwnerOptionUsers,
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
  type TeamOptionRecord,
} from './ports/projects.repository.port';

export interface CatalogOption {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

/** 03 F.1 `ProjectFormOptionsDto`. Solo elementos activos. */
export interface ProjectFormOptions {
  readonly countries: readonly CountryOptionRecord[];
  readonly projectTypes: readonly CatalogOption[];
  readonly sectors: readonly CatalogOption[];
  readonly phases: readonly (CatalogOption & { readonly order: number; readonly isFinal: boolean; readonly defaultProgress: string | null })[];
  readonly stages: readonly (CatalogOption & { readonly order: number; readonly isClosed: boolean; readonly outcome: string | null })[];
  readonly units: readonly UnitOfMeasureRecord[];
  readonly productStatuses: readonly (CatalogOption & { readonly isActive: boolean })[];
  readonly requiredFields: readonly string[];
  readonly defaults: { readonly phaseId: string | null; readonly stageId: string | null };
  readonly baseCurrencyCode: string;
  readonly progressRules: ProgressRules;
  readonly tonnageUnit: TonnageUnit;
  readonly attachments: { readonly maxMb: number; readonly allowedTypes: readonly string[] };
}

/** `ASSIGN`: asesores asignables (RN-03.6); `FILTER`: asesores del alcance para filtrar la búsqueda. */
export type OwnerOptionsPurpose = 'ASSIGN' | 'FILTER';

function option(item: ProjectCatalogItem): CatalogOption {
  return { id: item.id, code: item.code, label: item.label, sortOrder: item.sortOrder };
}

function bySortOrder(a: ProjectCatalogItem, b: ProjectCatalogItem): number {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
}

function stageOutcome(item: ProjectCatalogItem): string | null {
  const outcome = item.metadata?.['outcome'];
  return typeof outcome === 'string' ? outcome : null;
}

/**
 * Opciones de formulario y filtros del módulo (D-03.1 = D-02.1): catálogos, países,
 * unidades, obligatorios, valores por defecto, asesores y equipos con el permiso de
 * ver del módulo, sin endpoints genéricos de administración.
 */
@Injectable()
export class ProjectOptionsService {
  constructor(
    @Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository,
    private readonly access: ProjectAccessService,
    private readonly catalogs: ProjectCatalogsService,
    private readonly products: ProductsService,
    private readonly conversions: UnitConversionResolver,
    private readonly attachments: AttachmentsService,
    private readonly parameters: ParameterReader,
  ) {}

  async formOptions(): Promise<ProjectFormOptions> {
    const [countries, projectTypes, sectors, semantics, statuses, units, required, defaults, baseCurrencyCode, progressRules, tonnageUnit, limits] =
      await Promise.all([
        this.projects.listActiveCountries(),
        this.catalogs.activeItems(PROJECT_CATALOGS.projectType),
        this.catalogs.activeItems(PROJECT_CATALOGS.sector),
        this.catalogs.phaseAndStageSemantics(),
        this.catalogs.activeItems(PROJECT_CATALOGS.productStatus),
        this.products.listUnits(),
        this.parameters.get<Record<string, string[] | undefined>>(PROJECT_PARAMETERS.requiredFields),
        this.parameters.get<Record<string, string | undefined>>(PROJECT_PARAMETERS.defaultValues),
        this.parameters.get<string>(PROJECT_PARAMETERS.baseCurrency),
        this.parameters.get<ProgressRules>(PROJECT_PARAMETERS.progressRules),
        this.conversions.tonnageUnit(),
        this.attachments.limits(),
      ]);
    const phases = semantics.phases.filter((item) => item.isActive);
    const stages = semantics.stages.filter((item) => item.isActive);
    const defaultId = (items: readonly ProjectCatalogItem[], key: string): string | null => items.find((item) => item.code === defaults[key])?.id ?? null;
    return {
      countries,
      projectTypes: [...projectTypes].sort(bySortOrder).map(option),
      sectors: [...sectors].sort(bySortOrder).map(option),
      phases: phases.map((item) => ({
        ...option(item),
        order: catalogOrder(item),
        isFinal: isFinalPhase(item),
        defaultProgress: defaultProgressOf(item.metadata),
      })),
      stages: stages.map((item) => ({ ...option(item), order: catalogOrder(item), isClosed: isClosedStage(item), outcome: stageOutcome(item) })),
      units,
      productStatuses: [...statuses]
        .sort(bySortOrder)
        .map((item) => ({ ...option(item), isActive: item.metadata?.['isActive'] === true })),
      requiredFields: projectRequiredFields(required).all,
      defaults: { phaseId: defaultId(phases, PROJECT_DEFAULT_KEYS.phase), stageId: defaultId(stages, PROJECT_DEFAULT_KEYS.stage) },
      baseCurrencyCode,
      progressRules,
      tonnageUnit,
      attachments: { maxMb: Math.floor(limits.maxBytes / (1024 * 1024)), allowedTypes: limits.allowedTypes },
    };
  }

  /**
   * Asesores (03 F.1 `owner-options`):
   * - `ASSIGN` (defecto): `ACTIVE` y asignables por el actor (sin `proyectos.administrar`,
   *   solo él; con él, los de su alcance de administrar) y con `proyectos.ver` efectivo, D-03.16.
   * - `FILTER`: responsables de algún proyecto no eliminado dentro del alcance de
   *   `proyectos.ver` (también inactivos), para el filtro de la búsqueda.
   */
  async ownerOptions(
    actor: ProjectActor,
    request: { purpose: OwnerOptionsPurpose; search?: string; page: number; pageSize: number },
  ): Promise<Page<OwnerOptionRecord>> {
    const scopes = await this.access.scopes(actor);
    const users: OwnerOptionUsers =
      request.purpose === 'ASSIGN'
        ? { kind: 'ASSIGNABLE', users: this.access.assignableOwners(actor, scopes), requiredPermission: PROJECT_PERMISSIONS.view }
        : { kind: 'PROJECT_OWNERS', scope: scopes.view };
    return this.projects.listOwnerOptions({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search?.trim() || null,
      users,
    });
  }

  /** Equipos dentro del alcance de `proyectos.ver` (filtro de la vista de equipo, AC-03.29). */
  async teamOptions(actor: ProjectActor): Promise<TeamOptionRecord[]> {
    const scopes = await this.access.scopes(actor);
    return this.projects.listTeamOptions(scopes.view);
  }
}
