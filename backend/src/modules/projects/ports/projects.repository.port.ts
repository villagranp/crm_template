import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { OpportunityOutcomeCode, SemanticCatalogItem, YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type { ConversionScopeCode, UnitDimensionCode } from '@/modules/unit-conversions/ports/unit-conversion.reader.port';

import type { CommercialStatusAggregate, CommercialStatusFilter } from '../project-commercial-status';

export const PROJECTS_REPOSITORY = Symbol('PROJECTS_REPOSITORY');

/** Lista blanca de orden de la búsqueda (03 F.1) y de la vista de equipo (F.1 `TeamViewQueryDto`). */
export const PROJECT_SORT_FIELDS = ['code', 'name', 'customerName', 'estimatedDecisionDate', 'lastActivityAt', 'createdAt', 'phaseOrder'] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];
export const TEAM_VIEW_SORT_FIELDS = ['lastActivityAt', 'name', 'ownerName', 'teamName', 'phaseOrder'] as const;
export type TeamViewSortField = (typeof TEAM_VIEW_SORT_FIELDS)[number];
export type ProjectListSortField = ProjectSortField | TeamViewSortField;

/** Campos de fecha admitidos en el filtro de la búsqueda (RN-03.17). */
export const PROJECT_DATE_FIELDS = ['estimatedDecisionDate', 'estimatedStartDate', 'estimatedEndDate', 'createdAt', 'lastActivityAt'] as const;
export type ProjectDateField = (typeof PROJECT_DATE_FIELDS)[number];

export interface UserRef {
  readonly id: string;
  readonly displayName: string;
}

export interface CatalogValueRef {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
}

export interface CountryRef {
  readonly id: string;
  readonly isoCode: string;
  readonly name: string;
}

export interface CountryOptionRecord extends CountryRef {
  readonly currencyCode: string;
}

export interface TeamRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** Fila de la búsqueda y de la vista de equipo (03 F.1 `ProjectListItemDto`, `TeamProjectItemDto`). */
export interface ProjectListRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customer: { readonly id: string; readonly legalName: string };
  readonly country: CountryRef;
  readonly city: string | null;
  readonly owner: UserRef;
  readonly projectType: CatalogValueRef | null;
  readonly phase: { readonly id: string; readonly code: string; readonly label: string; readonly progress: DecimalString };
  readonly commercial: CommercialStatusAggregate;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly lastActivityAt: Date;
  /** Equipo principal del asesor responsable (00 §4.2, sin foto histórica). */
  readonly team: TeamRef | null;
}

/** Criterios ya normalizados por el servicio; el adaptador solo los traduce a SQL parametrizado. */
export interface ProjectSearchCriteria extends PageRequest {
  readonly sortBy: ProjectListSortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Contenido (normalizado) en el nombre o en el código. */
  readonly search: string | null;
  /** Contenido en el código (sin distinguir mayúsculas). */
  readonly code: string | null;
  readonly customerIds: readonly string[];
  readonly countryIds: readonly string[];
  /** Contenido (normalizado) en la ciudad. */
  readonly city: string | null;
  readonly ownerIds: readonly string[];
  readonly projectTypeIds: readonly string[];
  readonly phaseIds: readonly string[];
  /** Proyectos con **al menos una** oportunidad no eliminada en alguna de estas etapas (`EXISTS`). */
  readonly stageIds: readonly string[];
  /** Equipo principal del asesor (vista de equipo). */
  readonly teamIds: readonly string[];
  readonly commercialStatus: readonly CommercialStatusFilter[];
  /** `active`: ids de fases no finales (`true`) o finales (`false`) de `metric-definitions`; `null` = todos. */
  readonly activePhaseIds: readonly string[] | null;
  readonly dateRange: { readonly field: ProjectDateField; readonly from: CalendarDate | null; readonly to: CalendarDate | null } | null;
  /** Zona del negocio para comparar instantes (`createdAt`, `lastActivityAt`) con fechas. */
  readonly timeZone: string;
  /** Etapas abiertas en el orden de desempate de DEF-B (`openStageRanking`). */
  readonly openStageRanking: readonly string[];
  /** Fases por `metadata.order` (orden `phaseOrder`). */
  readonly phaseRanking: readonly string[];
}

/** Proyecto completo para la ficha y las mutaciones. Nunca sale tal cual por la API. */
export interface ProjectRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customer: { readonly id: string; readonly legalName: string };
  readonly country: CountryRef & { readonly isActive: boolean };
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: CalendarDate | null;
  readonly estimatedEndDate: CalendarDate | null;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly owner: UserRef;
  readonly projectType: CatalogValueRef | null;
  readonly sector: CatalogValueRef | null;
  readonly measureUnit: {
    readonly id: string;
    readonly code: string;
    readonly symbol: string;
    readonly dimension: UnitDimensionCode;
    readonly isActive: boolean;
  } | null;
  readonly estimatedQuantity: DecimalString | null;
  readonly conversion: {
    readonly ruleId: string;
    readonly scope: ConversionScopeCode;
    readonly factor: DecimalString;
    readonly toUnit: { readonly id: string; readonly code: string };
  } | null;
  readonly estimatedTonnage: DecimalString | null;
  readonly phase: SemanticCatalogItem & { readonly isActive: boolean };
  readonly phaseProgress: DecimalString;
  readonly phaseUpdatedAt: Date;
  readonly phaseComment: string | null;
  readonly duplicatedFrom: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly ownerId: string;
    readonly countryId: string;
    readonly isDeleted: boolean;
  } | null;
  /** Oportunidades no eliminadas: etapa con su semántica y resultado vigente (DEF-B y resumen). */
  readonly opportunities: readonly { readonly stage: SemanticCatalogItem; readonly outcome: OpportunityOutcomeCode | null }[];
  readonly productLines: number;
  readonly attachments: number;
  readonly lastActivityAt: Date;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly createdBy: UserRef | null;
  readonly updatedAt: Date;
  readonly updatedBy: UserRef | null;
}

export interface CreateProjectInput {
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly countryId: string;
  readonly city: string | null;
  readonly address: string | null;
  readonly description: string | null;
  readonly estimatedStartDate: CalendarDate | null;
  readonly estimatedEndDate: CalendarDate | null;
  readonly estimatedDecisionDate: CalendarDate | null;
  readonly ownerId: string;
  readonly phaseId: string;
  readonly phaseProgress: DecimalString;
  readonly duplicatedFromId: string | null;
  readonly classification: ProjectClassificationInput | null;
  readonly createdById: string | null;
  readonly at: Date;
}

/** Datos generales editables (PATCH): solo los presentes se escriben. */
export interface UpdateProjectInput {
  readonly code?: string;
  readonly name?: string;
  readonly customerId?: string;
  readonly countryId?: string;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly description?: string | null;
  readonly estimatedStartDate?: CalendarDate | null;
  readonly estimatedEndDate?: CalendarDate | null;
  readonly estimatedDecisionDate?: CalendarDate | null;
  readonly ownerId?: string;
}

/** Clasificación completa (PUT): reemplaza la anterior. */
export interface ProjectClassificationInput {
  readonly projectTypeId: string | null;
  readonly sectorId: string | null;
  readonly measureUnitId: string | null;
  readonly estimatedQuantity: DecimalString | null;
  readonly conversionRuleId: string | null;
  readonly conversionFactor: DecimalString | null;
  readonly estimatedTonnage: DecimalString | null;
}

export interface PhaseChangeInput {
  readonly fromPhaseId: string | null;
  readonly toPhaseId: string;
  readonly fromProgress: DecimalString | null;
  readonly toProgress: DecimalString;
  readonly comment: string | null;
  readonly changedById: string;
  readonly at: Date;
}

export interface PhaseHistoryRecord {
  readonly id: string;
  readonly fromPhase: { readonly id: string; readonly code: string; readonly label: string } | null;
  readonly toPhase: { readonly id: string; readonly code: string; readonly label: string };
  readonly fromProgress: DecimalString | null;
  readonly toProgress: DecimalString;
  readonly comment: string | null;
  readonly changedBy: UserRef;
  readonly changedAt: Date;
}

export const PROJECT_HISTORY_KINDS = [
  'PHASE',
  'STAGE',
  'RESULT',
  'PROJECT_DATA',
  'CLASSIFICATION',
  'PRODUCT',
  'FORECAST',
  'ATTACHMENT',
  'OPPORTUNITY_DATA',
] as const;
export type ProjectHistoryKind = (typeof PROJECT_HISTORY_KINDS)[number];

/** Entrada de la línea de tiempo de la ficha (03 F.1), con la carga cruda de su origen. */
export interface ProjectHistoryRecord {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actor: UserRef | null;
  readonly kind: ProjectHistoryKind;
  readonly subject: { readonly type: 'OPPORTUNITY' | 'PROJECT_PRODUCT' | 'FORECAST_LINE'; readonly id: string; readonly label: string } | null;
  /** `PHASE`/`STAGE`/`RESULT`: campos del historial funcional; auditoría: `{ event, changes }`. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly comment: string | null;
}

export interface ProjectHistoryQuery extends PageRequest {
  readonly kinds: readonly ProjectHistoryKind[];
  /** Eventos de auditoría que repite un historial funcional y no se muestran (prevalece el funcional). */
  readonly excludedAuditEvents: readonly string[];
  /** Evento de auditoría del proyecto que es `CLASSIFICATION` (el resto de `crm.project` es `PROJECT_DATA`). */
  readonly classificationEvent: string;
}

export interface LinkedInteractionCounts {
  readonly visits: number;
  readonly activities: number;
}

export interface BlockingChildrenQuery {
  readonly openStageIds: readonly string[];
  /** Mes en curso del negocio: "forecast futuro" = períodos posteriores (RN-03.12). */
  readonly currentMonth: YearMonth;
}

/** Usuarios que el actor puede asignar como asesor (RN-03.6, D-03.16): todos, o por id / país. */
export type OwnerAssignableSet =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'FILTERED'; readonly userIds: readonly string[]; readonly countryIds: readonly string[] };

export interface OwnerOptionRecord {
  readonly id: string;
  readonly displayName: string;
  readonly countryId: string | null;
  readonly primaryTeam: TeamRef | null;
}

/**
 * Usuarios de `owner-options`: asignables (`ACTIVE`, con `proyectos.ver` efectivo y dentro
 * del conjunto) o responsables de algún proyecto no eliminado dentro del alcance (filtro).
 */
export type OwnerOptionUsers =
  | { readonly kind: 'ASSIGNABLE'; readonly users: OwnerAssignableSet; readonly requiredPermission: string }
  | { readonly kind: 'PROJECT_OWNERS'; readonly scope: VisibilityScope };

export interface OwnerOptionSearch extends PageRequest {
  readonly search: string | null;
  readonly users: OwnerOptionUsers;
}

export interface TeamOptionRecord extends TeamRef {
  readonly parentId: string | null;
}

/** El índice único de `projects.code` rechazó el código (carrera con otra alta o edición). */
export class ProjectCodeConflictError extends Error {
  constructor() {
    super('project code unique constraint violated');
    this.name = 'ProjectCodeConflictError';
  }
}

/**
 * Persistencia de proyectos (03 F.5, §L.1). Sin reglas de negocio: la visibilidad que
 * recibe ya está resuelta (`VisibilityScopeResolver`) y los valores llegan validados.
 * Lee también, por el lado del proyecto, lo que necesita de oportunidades, productos,
 * forecast, visitas y actividades (estado comercial, bloqueos, resumen).
 */
export interface ProjectsRepository {
  search(criteria: ProjectSearchCriteria, scope: VisibilityScope): Promise<Page<ProjectListRecord>>;
  /**
   * Proyecto por id, no eliminado. Con `scope`, `null` si queda fuera (00 §4.2: `owner_id`
   * o `country_id`); con `null`, sin filtro (uso interno tras una mutación).
   */
  findById(projectId: string, scope: VisibilityScope | null, tx?: TransactionContext): Promise<ProjectRecord | null>;
  /** `SELECT … FOR UPDATE|FOR SHARE` del proyecto **no eliminado**; `false` si no existe o está eliminado. */
  lockProject(projectId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext): Promise<boolean>;
  /** ¿Otro proyecto (incluidos eliminados) tiene ya este código? */
  codeExists(code: string, excludeProjectId: string | null, tx?: TransactionContext): Promise<boolean>;
  /** Inserta proyecto + primera fila de `project_phase_history`. Lanza `ProjectCodeConflictError`. */
  create(input: CreateProjectInput, tx: TransactionContext): Promise<string>;
  /** Escribe los cambios, `updatedById` y `lastActivityAt = at`. Lanza `ProjectCodeConflictError`. */
  update(projectId: string, input: UpdateProjectInput, actorId: string | null, at: Date, tx: TransactionContext): Promise<void>;
  updateClassification(projectId: string, input: ProjectClassificationInput, actorId: string | null, at: Date, tx: TransactionContext): Promise<void>;
  /** Actualiza la fase vigente (`phaseUpdatedAt = at`), inserta el historial y toca `lastActivityAt`. */
  changePhase(projectId: string, change: PhaseChangeInput, tx: TransactionContext): Promise<void>;
  softDelete(projectId: string, actorId: string | null, at: Date, tx: TransactionContext): Promise<void>;
  /** RN-03.9: `last_activity_at = at` en la transacción del llamador. */
  touchLastActivity(projectIds: readonly string[], at: Date, tx: TransactionContext): Promise<void>;
  /** RN-03.10: visitas y actividades vinculadas (incluidas las eliminadas: la FK compuesta las protege). */
  countLinkedInteractions(projectId: string, tx: TransactionContext): Promise<LinkedInteractionCounts>;
  /** RN-03.12 dentro de la transacción de la eliminación. */
  countBlockingChildren(
    projectId: string,
    query: BlockingChildrenQuery,
    tx: TransactionContext,
  ): Promise<{ openOpportunities: number; productsWithForecast: number; nonCancelledVisits: number; openActivities: number }>;
  listPhaseHistory(projectId: string, page: PageRequest): Promise<Page<PhaseHistoryRecord>>;
  listHistory(projectId: string, query: ProjectHistoryQuery): Promise<Page<ProjectHistoryRecord>>;
  /** País por id con su estado (RN-03.5). */
  findCountry(countryId: string, tx?: TransactionContext): Promise<(CountryOptionRecord & { readonly isActive: boolean }) | null>;
  listActiveCountries(): Promise<CountryOptionRecord[]>;
  /** Id del usuario si es asesor elegible: no eliminado, `ACTIVE`, con `requiredPermission` y dentro de `users`. */
  findEligibleOwner(userId: string, users: OwnerAssignableSet, requiredPermission: string, tx?: TransactionContext): Promise<string | null>;
  listOwnerOptions(search: OwnerOptionSearch): Promise<Page<OwnerOptionRecord>>;
  /**
   * Equipos activos dentro del alcance (03 F.1 `team-options`): todos con `ALL`; si no,
   * los de `scope.teamIds` y los equipos principales de los usuarios de `ownerIds` o de
   * los países de `countryIds`.
   */
  listTeamOptions(scope: VisibilityScope): Promise<TeamOptionRecord[]>;
}
