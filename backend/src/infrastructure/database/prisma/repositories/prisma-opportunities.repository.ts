import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { type CalendarDate, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import type { NormalizedResult } from '@/modules/opportunities/opportunity-result-rules';
import type {
  CreateOpportunityInput,
  LockedOpportunity,
  OpportunitiesRepository,
  OpportunityDependencyCounts,
  OpportunityFilters,
  OpportunityRecord,
  OpportunitySearchCriteria,
  OpportunitySortField,
  ResultHistoryAction,
  ResultHistoryRecord,
  StageChangeWrite,
  StageHistoryRecord,
  UpdateOpportunityInput,
} from '@/modules/opportunities/ports/opportunities.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql, orSql, uuidInSql } from '../sql-text';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_ALIAS = /^[a-z][a-z0-9_]*$/;
const AMOUNT_DECIMALS = 4;
const RATE_DECIMALS = 8;
const PERCENT_DECIMALS = 2;

function alias(name: string): Prisma.Sql {
  if (!SQL_ALIAS.test(name)) throw new Error(`Invalid SQL alias: ${name}`);
  return Prisma.raw(name);
}

/**
 * Predicado SQL de visibilidad de oportunidades (00 §4.2, DM-13) sobre los alias de la
 * oportunidad y de su proyecto: asesor de la oportunidad en el alcance, o proyecto en el
 * alcance (asesor o país del proyecto). `TRUE` con `ALL`. No filtra eliminados.
 * Exportado para los modelos de lectura de Inicio y Reportes (AGENTS §9.4).
 */
export function opportunityVisibilitySql(opportunityAlias: string, projectAlias: string, scope: VisibilityScope): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  const o = alias(opportunityAlias);
  const p = alias(projectAlias);
  return orSql([
    uuidInSql(Prisma.sql`${o}.owner_id`, scope.ownerIds),
    uuidInSql(Prisma.sql`${p}.owner_id`, scope.ownerIds),
    uuidInSql(Prisma.sql`${p}.country_id`, scope.countryIds),
  ]);
}

/** Mismo predicado como filtro de Prisma (consultas por id). */
export function opportunityVisibilityWhere(scope: VisibilityScope): Prisma.OpportunityWhereInput {
  if (scope.kind === 'ALL') return {};
  return {
    OR: [
      { ownerId: { in: [...scope.ownerIds] } },
      { project: { ownerId: { in: [...scope.ownerIds] } } },
      { project: { countryId: { in: [...scope.countryIds] } } },
    ],
  };
}

const USER_REF = { select: { id: true, displayName: true } } as const;

const OPPORTUNITY_SELECT = {
  id: true,
  code: true,
  opportunityDate: true,
  estimatedAmount: true,
  currencyCode: true,
  exchangeRate: true,
  exchangeRateDate: true,
  estimatedAmountUsd: true,
  estimatedTonnage: true,
  description: true,
  nextAction: true,
  nextActionDate: true,
  stageChangedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  project: { select: { id: true, code: true, name: true, ownerId: true, countryId: true, customer: { select: { id: true, legalName: true } } } },
  stage: { select: { id: true, code: true, label: true, metadata: true, isActive: true } },
  owner: USER_REF,
  result: {
    select: {
      outcome: true,
      awardedPercent: true,
      decisionDate: true,
      comments: true,
      recordedAt: true,
      updatedAt: true,
      updatedById: true,
      reason: { select: { id: true, code: true, label: true } },
      recordedBy: USER_REF,
    },
  },
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.OpportunitySelect;

type OpportunityRow = Prisma.OpportunityGetPayload<{ select: typeof OPPORTUNITY_SELECT }>;

function optionalDecimal(value: Prisma.Decimal | null, scale: number): string | null {
  return value === null ? null : value.toFixed(scale);
}

function optionalDate(value: Date | null): CalendarDate | null {
  return value === null ? null : toCalendarDate(value);
}

function toDateColumn(value: CalendarDate | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : fromCalendarDate(value);
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toRecord(row: OpportunityRow, names: ReadonlyMap<string, string>): OpportunityRecord {
  const userRef = (id: string | null) => (id && names.has(id) ? { id, displayName: names.get(id) as string } : null);
  return {
    id: row.id,
    code: row.code,
    project: { id: row.project.id, code: row.project.code, name: row.project.name, ownerId: row.project.ownerId, countryId: row.project.countryId },
    customer: row.project.customer,
    stage: { id: row.stage.id, code: row.stage.code, label: row.stage.label, metadata: metadataObject(row.stage.metadata), isActive: row.stage.isActive },
    opportunityDate: toCalendarDate(row.opportunityDate),
    owner: row.owner,
    estimatedAmount: optionalDecimal(row.estimatedAmount, AMOUNT_DECIMALS),
    currencyCode: row.currencyCode,
    exchangeRate: optionalDecimal(row.exchangeRate, RATE_DECIMALS),
    exchangeRateDate: optionalDate(row.exchangeRateDate),
    estimatedAmountUsd: optionalDecimal(row.estimatedAmountUsd, AMOUNT_DECIMALS),
    estimatedTonnage: optionalDecimal(row.estimatedTonnage, AMOUNT_DECIMALS),
    description: row.description,
    nextAction: row.nextAction,
    nextActionDate: optionalDate(row.nextActionDate),
    stageChangedAt: row.stageChangedAt,
    closedAt: row.closedAt,
    result: row.result
      ? {
          outcome: row.result.outcome,
          reason: row.result.reason,
          awardedPercent: optionalDecimal(row.result.awardedPercent, PERCENT_DECIMALS),
          decisionDate: toCalendarDate(row.result.decisionDate),
          comments: row.result.comments,
          recordedBy: row.result.recordedBy,
          recordedAt: row.result.recordedAt,
          updatedAt: row.result.updatedAt,
          updatedBy: userRef(row.result.updatedById),
        }
      : null,
    productLines: row._count.products,
    createdAt: row.createdAt,
    createdBy: userRef(row.createdById),
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedById),
  };
}

function like(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

function dateColumn(field: NonNullable<OpportunityFilters['dateRange']>['field'], timeZone: string): Prisma.Sql {
  switch (field) {
    case 'nextActionDate':
      return Prisma.sql`o.next_action_date`;
    case 'updatedAt':
      return Prisma.sql`(o.updated_at AT TIME ZONE ${timeZone})::date`;
    case 'opportunityDate':
    default:
      return Prisma.sql`o.opportunity_date`;
  }
}

function sortExpression(field: OpportunitySortField, ranking: readonly string[]): Prisma.Sql {
  switch (field) {
    case 'code':
      return Prisma.sql`o.code`;
    case 'opportunityDate':
      return Prisma.sql`o.opportunity_date`;
    case 'stageOrder':
      // Orden del catálogo resuelto en el servicio (`metadata.order`), sin leer la metadata aquí (RN-03.77).
      return ranking.length ? Prisma.sql`array_position(${[...ranking]}::uuid[], o.stage_id)` : Prisma.sql`o.stage_id`;
    case 'nextActionDate':
      return Prisma.sql`o.next_action_date`;
    case 'estimatedAmountUsd':
      // RN-03.83: el orden por monto usa siempre el equivalente en USD.
      return Prisma.sql`o.estimated_amount_usd`;
    case 'updatedAt':
    default:
      return Prisma.sql`o.updated_at`;
  }
}

const FROM = Prisma.sql`
  FROM opportunities o
  JOIN projects p ON p.id = o.project_id
  LEFT JOIN opportunity_results r ON r.opportunity_id = o.id`;

/**
 * Adaptador Prisma de oportunidades (03 §L.1, ADR-004). Sin reglas de negocio: aplica
 * el alcance que recibe y escribe lo que el servicio ya validó. La búsqueda es SQL
 * parametrizado (el resultado vigente es 0..1, así que el `LEFT JOIN` no multiplica
 * filas); la hidratación usa Prisma por ids.
 */
@Injectable()
export class PrismaOpportunitiesRepository implements OpportunitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: OpportunitySearchCriteria, scope: VisibilityScope): Promise<Page<OpportunityRecord>> {
    const where = andSql(this.conditions(criteria, scope));
    const direction = Prisma.raw(criteria.sortOrder === 'asc' ? 'ASC' : 'DESC');
    const offset = (criteria.page - 1) * criteria.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT o.id ${FROM}
        WHERE ${where}
        ORDER BY ${sortExpression(criteria.sortBy, criteria.stageRanking)} ${direction} NULLS LAST, o.id ASC
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${FROM} WHERE ${where}`,
    ]);
    const records = await this.hydrate(rows.map((row) => row.id));
    return createPage(records, totals[0]?.total ?? 0, criteria);
  }

  async stageCounts(filters: OpportunityFilters, scope: VisibilityScope): Promise<{ stageId: string; count: number }[]> {
    const where = andSql(this.conditions(filters, scope));
    const rows = await this.prisma.$queryRaw<{ stage_id: string; total: number }[]>`
      SELECT o.stage_id, COUNT(*)::int AS total ${FROM} WHERE ${where} GROUP BY o.stage_id`;
    return rows.map((row) => ({ stageId: row.stage_id, count: row.total }));
  }

  private conditions(filters: OpportunityFilters, scope: VisibilityScope): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`o.deleted_at IS NULL`, Prisma.sql`p.deleted_at IS NULL`, opportunityVisibilitySql('o', 'p', scope)];
    if (filters.search) {
      const pattern = like(filters.search);
      conditions.push(Prisma.sql`(lower(o.code) LIKE ${pattern} OR ${normalizedTextSql(Prisma.sql`p.name`)} LIKE ${pattern})`);
    }
    if (filters.projectIds.length) conditions.push(uuidInSql(Prisma.sql`o.project_id`, filters.projectIds));
    if (filters.customerIds.length) conditions.push(uuidInSql(Prisma.sql`p.customer_id`, filters.customerIds));
    if (filters.stageIds.length) conditions.push(uuidInSql(Prisma.sql`o.stage_id`, filters.stageIds));
    if (filters.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`o.owner_id`, filters.ownerIds));
    if (filters.statusStageIds !== null) conditions.push(uuidInSql(Prisma.sql`o.stage_id`, filters.statusStageIds));
    if (filters.outcomes.length) conditions.push(Prisma.sql`r.outcome::text = ANY(${[...filters.outcomes]}::text[])`);
    if (filters.decisionRange) {
      conditions.push(Prisma.sql`r.opportunity_id IS NOT NULL`);
      if (filters.decisionRange.from) conditions.push(Prisma.sql`r.decision_date >= ${filters.decisionRange.from}::date`);
      if (filters.decisionRange.to) conditions.push(Prisma.sql`r.decision_date <= ${filters.decisionRange.to}::date`);
    }
    if (filters.dateRange) {
      const column = dateColumn(filters.dateRange.field, filters.timeZone);
      if (filters.dateRange.from) conditions.push(Prisma.sql`${column} >= ${filters.dateRange.from}::date`);
      if (filters.dateRange.to) conditions.push(Prisma.sql`${column} <= ${filters.dateRange.to}::date`);
    }
    return conditions;
  }

  async findById(opportunityId: string, scope: VisibilityScope | null, tx?: TransactionContext): Promise<OpportunityRecord | null> {
    if (!UUID_PATTERN.test(opportunityId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const row = await db.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null, project: { deletedAt: null }, ...(scope ? opportunityVisibilityWhere(scope) : {}) },
      select: OPPORTUNITY_SELECT,
    });
    if (!row) return null;
    const names = await this.userNames([row.createdById, row.updatedById, row.result?.updatedById ?? null], tx);
    return toRecord(row, names);
  }

  async lock(opportunityId: string, projectId: string, tx: TransactionContext): Promise<LockedOpportunity | null> {
    if (!UUID_PATTERN.test(opportunityId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const rows = await db.$queryRaw<{ id: string; project_id: string; stage_id: string }[]>`
      SELECT id, project_id, stage_id FROM opportunities
      WHERE id = ${opportunityId}::uuid AND project_id = ${projectId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    const result = await db.opportunityResult.findUnique({ where: { opportunityId }, select: { id: true } });
    return { id: row.id, projectId: row.project_id, stageId: row.stage_id, hasResult: result !== null };
  }

  async create(input: CreateOpportunityInput, tx: TransactionContext): Promise<string> {
    const created = await prismaClientFor(this.prisma, tx).opportunity.create({
      data: {
        code: input.code,
        projectId: input.projectId,
        stageId: input.stageId,
        opportunityDate: fromCalendarDate(input.opportunityDate),
        ownerId: input.ownerId,
        estimatedAmount: input.estimatedAmount,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        exchangeRateDate: toDateColumn(input.exchangeRateDate) ?? null,
        estimatedAmountUsd: input.estimatedAmountUsd,
        estimatedTonnage: input.estimatedTonnage,
        description: input.description,
        nextAction: input.nextAction,
        nextActionDate: toDateColumn(input.nextActionDate) ?? null,
        stageChangedAt: input.at,
        createdAt: input.at,
        createdById: input.createdById,
        updatedById: input.createdById,
      },
      select: { id: true },
    });
    return created.id;
  }

  async update(opportunityId: string, input: UpdateOpportunityInput, actorId: string | null, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunity.update({
      where: { id: opportunityId },
      data: {
        opportunityDate: toDateColumn(input.opportunityDate) ?? undefined,
        ownerId: input.ownerId,
        estimatedAmount: input.estimatedAmount,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        exchangeRateDate: toDateColumn(input.exchangeRateDate),
        estimatedAmountUsd: input.estimatedAmountUsd,
        estimatedTonnage: input.estimatedTonnage,
        description: input.description,
        nextAction: input.nextAction,
        nextActionDate: toDateColumn(input.nextActionDate),
        updatedById: actorId,
      },
    });
  }

  async changeStage(opportunityId: string, change: StageChangeWrite, actorId: string | null, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunity.update({
      where: { id: opportunityId },
      data: { stageId: change.stageId, stageChangedAt: change.at, closedAt: change.closedAt, updatedById: actorId },
    });
  }

  async insertStageHistory(
    entry: { opportunityId: string; fromStageId: string | null; toStageId: string; comment: string | null; changedById: string; at: Date },
    tx: TransactionContext,
  ): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunityStageHistory.create({
      data: {
        opportunityId: entry.opportunityId,
        fromStageId: entry.fromStageId,
        toStageId: entry.toStageId,
        comment: entry.comment,
        changedById: entry.changedById,
        changedAt: entry.at,
      },
    });
  }

  async upsertResult(opportunityId: string, result: NormalizedResult, actorId: string, at: Date, tx: TransactionContext): Promise<void> {
    const data = {
      outcome: result.outcome,
      reasonId: result.reasonId,
      awardedPercent: result.awardedPercent,
      decisionDate: fromCalendarDate(result.decisionDate),
      comments: result.comments,
    };
    await prismaClientFor(this.prisma, tx).opportunityResult.upsert({
      where: { opportunityId },
      create: { opportunityId, ...data, recordedById: actorId, recordedAt: at, updatedById: actorId },
      update: { ...data, updatedById: actorId },
    });
  }

  async deleteResult(opportunityId: string, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunityResult.deleteMany({ where: { opportunityId } });
  }

  async insertResultHistory(
    entry: { opportunityId: string; action: ResultHistoryAction; result: NormalizedResult | null; changedById: string; at: Date },
    tx: TransactionContext,
  ): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunityResultHistory.create({
      data: {
        opportunityId: entry.opportunityId,
        action: entry.action,
        outcome: entry.result?.outcome ?? null,
        reasonId: entry.result?.reasonId ?? null,
        awardedPercent: entry.result?.awardedPercent ?? null,
        decisionDate: entry.result ? fromCalendarDate(entry.result.decisionDate) : null,
        comments: entry.result?.comments ?? null,
        changedById: entry.changedById,
        changedAt: entry.at,
      },
    });
  }

  async softDelete(opportunityId: string, actorId: string | null, at: Date, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).opportunity.update({ where: { id: opportunityId }, data: { deletedAt: at, updatedById: actorId } });
  }

  async countDependencies(opportunityId: string, tx: TransactionContext): Promise<OpportunityDependencyCounts> {
    const db = prismaClientFor(this.prisma, tx);
    const activeProducts = await db.projectProduct.count({ where: { opportunityId, deletedAt: null } });
    const openActivities = await db.activity.count({
      where: { opportunityId, deletedAt: null, status: { metadata: { path: ['isOpen'], equals: true } } },
    });
    return { activeProducts, openActivities };
  }

  async listStageHistory(opportunityId: string): Promise<StageHistoryRecord[]> {
    const rows = await this.prisma.opportunityStageHistory.findMany({
      where: { opportunityId },
      select: {
        id: true,
        comment: true,
        changedAt: true,
        fromStage: { select: { id: true, code: true, label: true } },
        toStage: { select: { id: true, code: true, label: true } },
        changedBy: USER_REF,
      },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    });
    return rows;
  }

  async listResultHistory(opportunityId: string): Promise<ResultHistoryRecord[]> {
    const rows = await this.prisma.opportunityResultHistory.findMany({
      where: { opportunityId },
      select: {
        id: true,
        action: true,
        outcome: true,
        awardedPercent: true,
        decisionDate: true,
        comments: true,
        changedAt: true,
        reason: { select: { id: true, code: true, label: true } },
        changedBy: USER_REF,
      },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      outcome: row.outcome as OpportunityOutcomeCode | null,
      reason: row.reason,
      awardedPercent: optionalDecimal(row.awardedPercent, PERCENT_DECIMALS),
      decisionDate: optionalDate(row.decisionDate),
      comments: row.comments,
      changedBy: row.changedBy,
      changedAt: row.changedAt,
    }));
  }

  private async hydrate(ids: readonly string[]): Promise<OpportunityRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.opportunity.findMany({ where: { id: { in: [...ids] } }, select: OPPORTUNITY_SELECT });
    const names = await this.userNames(rows.flatMap((row) => [row.createdById, row.updatedById, row.result?.updatedById ?? null]));
    const byId = new Map(rows.map((row) => [row.id, toRecord(row, names)]));
    return ids.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }

  private async userNames(ids: readonly (string | null)[], tx?: TransactionContext): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await prismaClientFor(this.prisma, tx).user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
