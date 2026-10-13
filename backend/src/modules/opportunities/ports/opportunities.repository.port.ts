import type { CalendarDate } from '@/common/calendar-date';
import type { DecimalString } from '@/common/decimal';
import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CatalogItemRef, OpportunityOutcomeCode, SemanticCatalogItem } from '@/modules/commercial-metrics/metric-definitions';

import type { EstimateSnapshot } from '../opportunity-estimate';
import type { NormalizedResult } from '../opportunity-result-rules';

/**
 * Puerto de datos de Oportunidades (03 §F.5, ADR-004). Tipos de dominio, sin ORM.
 *
 * Visibilidad (00 §4.2, DM-13): una oportunidad no eliminada de un proyecto no
 * eliminado es visible con un alcance si su asesor está en él o si su proyecto lo está
 * (asesor o país del proyecto). `null` como alcance = sin filtro (lecturas internas
 * tras autorizar).
 */
export const OPPORTUNITIES_REPOSITORY = Symbol('OPPORTUNITIES_REPOSITORY');

export interface UserRef {
  readonly id: string;
  readonly displayName: string;
}

export interface OpportunityResultRecord {
  readonly outcome: OpportunityOutcomeCode;
  readonly reason: CatalogItemRef | null;
  readonly awardedPercent: DecimalString | null;
  readonly decisionDate: CalendarDate;
  readonly comments: string | null;
  readonly recordedBy: UserRef;
  readonly recordedAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: UserRef | null;
}

export interface OpportunityRecord extends EstimateSnapshot {
  readonly id: string;
  readonly code: string;
  readonly project: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly ownerId: string;
    readonly countryId: string;
  };
  readonly customer: { readonly id: string; readonly legalName: string };
  readonly stage: SemanticCatalogItem & { readonly isActive: boolean };
  readonly opportunityDate: CalendarDate;
  readonly owner: UserRef;
  readonly estimatedTonnage: DecimalString | null;
  readonly description: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: CalendarDate | null;
  readonly stageChangedAt: Date;
  readonly closedAt: Date | null;
  readonly result: OpportunityResultRecord | null;
  /** Productos asociados activos (no eliminados) con esta oportunidad. */
  readonly productLines: number;
  readonly createdAt: Date;
  readonly createdBy: UserRef | null;
  readonly updatedAt: Date;
  readonly updatedBy: UserRef | null;
}

export const OPPORTUNITY_SORT_FIELDS = ['code', 'opportunityDate', 'stageOrder', 'nextActionDate', 'updatedAt', 'estimatedAmountUsd'] as const;
export type OpportunitySortField = (typeof OPPORTUNITY_SORT_FIELDS)[number];

export const OPPORTUNITY_DATE_FIELDS = ['opportunityDate', 'nextActionDate', 'updatedAt'] as const;
export type OpportunityDateField = (typeof OPPORTUNITY_DATE_FIELDS)[number];

export interface OpportunityFilters {
  /** Código de la oportunidad o nombre del proyecto (contiene, sin mayúsculas). */
  readonly search?: string;
  readonly projectIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly stageIds: readonly string[];
  readonly ownerIds: readonly string[];
  /** DEF-A ya resuelto: ids de las etapas abiertas (`OPEN`) o cerradas (`CLOSED`); `null` = sin filtro. */
  readonly statusStageIds: readonly string[] | null;
  /** Resultado vigente ∈ lista (vacía = sin filtro). */
  readonly outcomes: readonly OpportunityOutcomeCode[];
  /** Fecha de decisión del resultado vigente (exige resultado). */
  readonly decisionRange: { readonly from?: CalendarDate; readonly to?: CalendarDate } | null;
  readonly dateRange: { readonly field: OpportunityDateField; readonly from?: CalendarDate; readonly to?: CalendarDate } | null;
  /** `crm.zona_horaria_negocio`: `updatedAt` se compara como fecha de negocio. */
  readonly timeZone: string;
}

export interface OpportunitySearchCriteria extends OpportunityFilters, PageRequest {
  readonly sortBy: OpportunitySortField;
  readonly sortOrder: 'asc' | 'desc';
  /** Etapas por `metadata.order` (y código), para `sortBy=stageOrder`. */
  readonly stageRanking: readonly string[];
}

export interface CreateOpportunityInput extends EstimateSnapshot {
  readonly code: string;
  readonly projectId: string;
  readonly stageId: string;
  readonly opportunityDate: CalendarDate;
  readonly ownerId: string;
  readonly estimatedTonnage: DecimalString | null;
  readonly description: string | null;
  readonly nextAction: string | null;
  readonly nextActionDate: CalendarDate | null;
  readonly createdById: string;
  readonly at: Date;
}

/** Edición de datos (nunca etapa ni resultado). Omitido = sin cambio. */
export interface UpdateOpportunityInput extends Partial<EstimateSnapshot> {
  readonly opportunityDate?: CalendarDate;
  readonly ownerId?: string;
  readonly estimatedTonnage?: DecimalString | null;
  readonly description?: string | null;
  readonly nextAction?: string | null;
  readonly nextActionDate?: CalendarDate | null;
}

/** Fila de la oportunidad tomada con `FOR UPDATE` (estado que decide el cambio de etapa). */
export interface LockedOpportunity {
  readonly id: string;
  readonly projectId: string;
  readonly stageId: string;
  readonly hasResult: boolean;
}

export interface StageChangeWrite {
  readonly stageId: string;
  /** `Date` al cerrar, `null` al reabrir, `undefined` = sin cambio. */
  readonly closedAt: Date | null | undefined;
  readonly at: Date;
}

export type ResultHistoryAction = 'RECORDED' | 'CHANGED' | 'CLEARED';

export interface StageHistoryRecord {
  readonly id: string;
  readonly fromStage: CatalogItemRef | null;
  readonly toStage: CatalogItemRef;
  readonly comment: string | null;
  readonly changedBy: UserRef;
  readonly changedAt: Date;
}

export interface ResultHistoryRecord {
  readonly id: string;
  readonly action: ResultHistoryAction;
  readonly outcome: OpportunityOutcomeCode | null;
  readonly reason: CatalogItemRef | null;
  readonly awardedPercent: DecimalString | null;
  readonly decisionDate: CalendarDate | null;
  readonly comments: string | null;
  readonly changedBy: UserRef;
  readonly changedAt: Date;
}

export interface OpportunityDependencyCounts {
  readonly activeProducts: number;
  readonly openActivities: number;
}

export interface OpportunitiesRepository {
  search(criteria: OpportunitySearchCriteria, scope: VisibilityScope): Promise<Page<OpportunityRecord>>;
  /** Conteo por etapa con los mismos filtros (cabeceras del tablero, AC-03.46). */
  stageCounts(filters: OpportunityFilters, scope: VisibilityScope): Promise<{ readonly stageId: string; readonly count: number }[]>;
  findById(opportunityId: string, scope: VisibilityScope | null, tx?: TransactionContext): Promise<OpportunityRecord | null>;
  /** `SELECT … FOR UPDATE` de la oportunidad no eliminada del proyecto; `null` si no existe. */
  lock(opportunityId: string, projectId: string, tx: TransactionContext): Promise<LockedOpportunity | null>;
  create(input: CreateOpportunityInput, tx: TransactionContext): Promise<string>;
  update(opportunityId: string, input: UpdateOpportunityInput, actorId: string | null, tx: TransactionContext): Promise<void>;
  changeStage(opportunityId: string, change: StageChangeWrite, actorId: string | null, tx: TransactionContext): Promise<void>;
  insertStageHistory(
    entry: { readonly opportunityId: string; readonly fromStageId: string | null; readonly toStageId: string; readonly comment: string | null; readonly changedById: string; readonly at: Date },
    tx: TransactionContext,
  ): Promise<void>;
  /** Crea o reemplaza el resultado vigente (0..1, `opportunity_id @unique`). */
  upsertResult(opportunityId: string, result: NormalizedResult, actorId: string, at: Date, tx: TransactionContext): Promise<void>;
  deleteResult(opportunityId: string, tx: TransactionContext): Promise<void>;
  insertResultHistory(
    entry: { readonly opportunityId: string; readonly action: ResultHistoryAction; readonly result: NormalizedResult | null; readonly changedById: string; readonly at: Date },
    tx: TransactionContext,
  ): Promise<void>;
  softDelete(opportunityId: string, actorId: string | null, at: Date, tx: TransactionContext): Promise<void>;
  /** RN-03.45: productos asociados activos y actividades abiertas (`metadata.isOpen`) vinculadas. */
  countDependencies(opportunityId: string, tx: TransactionContext): Promise<OpportunityDependencyCounts>;
  listStageHistory(opportunityId: string): Promise<StageHistoryRecord[]>;
  listResultHistory(opportunityId: string): Promise<ResultHistoryRecord[]>;
}
