import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { type CalendarDate, fromCalendarDate, toCalendarDate } from '@/common/calendar-date';
import { createPage, type Page, type PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { OpportunityOutcomeCode } from '@/modules/commercial-metrics/metric-definitions';
import type { CommercialStatusFilter } from '@/modules/projects/project-commercial-status';
import {
  type BlockingChildrenQuery,
  type CountryOptionRecord,
  type CreateProjectInput,
  type LinkedInteractionCounts,
  type OwnerAssignableSet,
  type OwnerOptionRecord,
  type OwnerOptionSearch,
  type PhaseChangeInput,
  type PhaseHistoryRecord,
  type ProjectClassificationInput,
  ProjectCodeConflictError,
  type ProjectHistoryKind,
  type ProjectHistoryQuery,
  type ProjectHistoryRecord,
  type ProjectListRecord,
  type ProjectListSortField,
  type ProjectRecord,
  type ProjectSearchCriteria,
  type ProjectsRepository,
  type TeamOptionRecord,
  type UpdateProjectInput,
} from '@/modules/projects/ports/projects.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql, orSql, uuidInSql } from '../sql-text';

const UNIQUE_VIOLATION = 'P2002';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_ALIAS = /^[a-z][a-z0-9_]*$/;
const QUANTITY_DECIMALS = 4;
const FACTOR_DECIMALS = 8;
const PROGRESS_DECIMALS = 2;

// ---------------------------------------------------------------------------
// Predicado de visibilidad de proyectos (00 §4.2: `owner_id` / `country_id`)
// ---------------------------------------------------------------------------

function alias(name: string): Prisma.Sql {
  if (!SQL_ALIAS.test(name)) throw new Error(`Invalid SQL alias: ${name}`);
  return Prisma.raw(name);
}

/**
 * Predicado SQL de visibilidad de proyectos sobre el alias `projectAlias`
 * (`owner_id IN (…) OR country_id IN (…)`; `TRUE` con `ALL`). No filtra eliminados.
 * Exportado para los modelos de lectura de otros módulos (Inicio, Reportes,
 * Oportunidades, Forecast): deben ver los proyectos exactamente igual (AGENTS §9.4).
 */
export function projectVisibilitySql(projectAlias: string, scope: VisibilityScope): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  const p = alias(projectAlias);
  return orSql([uuidInSql(Prisma.sql`${p}.owner_id`, scope.ownerIds), uuidInSql(Prisma.sql`${p}.country_id`, scope.countryIds)]);
}

/** Mismo predicado como filtro de Prisma (consultas por id). */
export function projectVisibilityWhere(scope: VisibilityScope): Prisma.ProjectWhereInput {
  if (scope.kind === 'ALL') return {};
  return { OR: [{ ownerId: { in: [...scope.ownerIds] } }, { countryId: { in: [...scope.countryIds] } }] };
}

// ---------------------------------------------------------------------------
// Conversión de valores
// ---------------------------------------------------------------------------

function decimal(value: Prisma.Decimal, scale: number): string {
  return value.toFixed(scale);
}

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

function isCodeViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== UNIQUE_VIOLATION) return false;
  const target = error.meta?.['target'];
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('code');
}

function like(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

// ---------------------------------------------------------------------------
// Búsqueda (F-13) y vista de equipo (F-14)
// ---------------------------------------------------------------------------

interface ProjectListRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  customer_id: string;
  customer_name: string;
  country_id: string;
  country_iso_code: string;
  country_name: string;
  owner_id: string;
  owner_name: string;
  type_id: string | null;
  type_code: string | null;
  type_label: string | null;
  type_active: boolean | null;
  phase_id: string;
  phase_code: string;
  phase_label: string;
  phase_progress: Prisma.Decimal;
  estimated_decision_date: Date | null;
  last_activity_at: Date;
  opportunity_count: number;
  has_won: boolean;
  lead_id: string | null;
  lead_code: string | null;
  lead_label: string | null;
  team_id: string | null;
  team_code: string | null;
  team_name: string | null;
}

function rankingPosition(ranking: readonly string[], column: Prisma.Sql): Prisma.Sql {
  return ranking.length === 0 ? Prisma.sql`NULL::int` : Prisma.sql`array_position(${[...ranking]}::uuid[], ${column})`;
}

function sortExpression(field: ProjectListSortField, criteria: ProjectSearchCriteria): Prisma.Sql {
  switch (field) {
    case 'code':
      return Prisma.sql`p.code`;
    case 'name':
      return normalizedTextSql(Prisma.sql`p.name`);
    case 'customerName':
      return Prisma.sql`c.legal_name_normalized`;
    case 'estimatedDecisionDate':
      return Prisma.sql`p.estimated_decision_date`;
    case 'createdAt':
      return Prisma.sql`p.created_at`;
    case 'phaseOrder':
      return rankingPosition(criteria.phaseRanking, Prisma.sql`p.phase_id`);
    case 'ownerName':
      return Prisma.sql`lower(u.display_name)`;
    case 'teamName':
      return Prisma.sql`lower(tm.team_name)`;
    case 'lastActivityAt':
    default:
      return Prisma.sql`p.last_activity_at`;
  }
}

function commercialStatusCondition(filter: CommercialStatusFilter): Prisma.Sql {
  switch (filter.kind) {
    case 'OPEN_STAGE':
      return filter.stageId ? Prisma.sql`cs.leading_stage_id = ${filter.stageId}::uuid` : Prisma.sql`cs.leading_stage_id IS NOT NULL`;
    case 'NO_OPPORTUNITIES':
      return Prisma.sql`cs.opportunity_count = 0`;
    case 'WON':
      return Prisma.sql`(cs.leading_stage_id IS NULL AND cs.opportunity_count > 0 AND COALESCE(cs.has_won, FALSE))`;
    case 'LOST':
      return Prisma.sql`(cs.leading_stage_id IS NULL AND cs.opportunity_count > 0 AND NOT COALESCE(cs.has_won, FALSE))`;
  }
}

function dateColumn(field: NonNullable<ProjectSearchCriteria['dateRange']>['field'], timeZone: string): Prisma.Sql {
  switch (field) {
    case 'estimatedStartDate':
      return Prisma.sql`p.estimated_start_date`;
    case 'estimatedEndDate':
      return Prisma.sql`p.estimated_end_date`;
    case 'createdAt':
      return Prisma.sql`(p.created_at AT TIME ZONE ${timeZone})::date`;
    case 'lastActivityAt':
      return Prisma.sql`(p.last_activity_at AT TIME ZONE ${timeZone})::date`;
    case 'estimatedDecisionDate':
    default:
      return Prisma.sql`p.estimated_decision_date`;
  }
}

/**
 * Agregado por proyecto para DEF-B (RN-03.14): una fila por proyecto (subconsulta
 * `LATERAL` con agregados, nunca un `JOIN` que multiplique filas). El resultado vigente
 * es 0..1 por oportunidad, así que el `LEFT JOIN` no duplica.
 */
function commercialLateral(openStageRanking: readonly string[]): Prisma.Sql {
  const leading =
    openStageRanking.length === 0
      ? Prisma.sql`NULL::uuid`
      : Prisma.sql`(array_agg(o.stage_id ORDER BY array_position(${[...openStageRanking]}::uuid[], o.stage_id))
                    FILTER (WHERE o.stage_id = ANY(${[...openStageRanking]}::uuid[])))[1]`;
  return Prisma.sql`LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS opportunity_count,
             ${leading} AS leading_stage_id,
             BOOL_OR(r.outcome::text IN ('WON', 'PARTIAL')) AS has_won
      FROM opportunities o
      LEFT JOIN opportunity_results r ON r.opportunity_id = o.id
      WHERE o.project_id = p.id AND o.deleted_at IS NULL
    ) cs ON TRUE`;
}

/** Equipo principal activo del asesor (00 §4.2). Si hubiera varios marcados, el de código menor. */
const PRIMARY_TEAM_LATERAL = Prisma.sql`LEFT JOIN LATERAL (
    SELECT t.id AS team_id, t.code AS team_code, t.name AS team_name
    FROM team_members m
    JOIN teams t ON t.id = m.team_id
    WHERE m.user_id = p.owner_id AND m.is_primary AND t.is_active AND t.deleted_at IS NULL
    ORDER BY t.code ASC
    LIMIT 1
  ) tm ON TRUE`;

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

const PROJECT_INCLUDE = {
  customer: { select: { id: true, legalName: true } },
  country: { select: { id: true, isoCode: true, name: true, isActive: true } },
  owner: { select: { id: true, displayName: true } },
  projectType: { select: { id: true, code: true, label: true, isActive: true } },
  sector: { select: { id: true, code: true, label: true, isActive: true } },
  measureUnit: { select: { id: true, code: true, symbol: true, dimension: true, isActive: true } },
  conversionRule: { select: { id: true, scope: true, toUnit: { select: { id: true, code: true } } } },
  phase: { select: { id: true, code: true, label: true, metadata: true, isActive: true } },
  duplicatedFrom: { select: { id: true, code: true, name: true, ownerId: true, countryId: true, deletedAt: true } },
  opportunities: {
    where: { deletedAt: null },
    select: {
      stage: { select: { id: true, code: true, label: true, metadata: true } },
      result: { select: { outcome: true } },
    },
  },
  _count: {
    select: {
      products: { where: { deletedAt: null } },
      attachments: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

function toProjectRecord(row: ProjectRow, names: ReadonlyMap<string, string>): ProjectRecord {
  const userRef = (id: string | null): { id: string; displayName: string } | null => {
    const displayName = id ? names.get(id) : undefined;
    return id && displayName !== undefined ? { id, displayName } : null;
  };
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    customer: row.customer,
    country: row.country,
    city: row.city,
    address: row.address,
    description: row.description,
    estimatedStartDate: optionalDate(row.estimatedStartDate),
    estimatedEndDate: optionalDate(row.estimatedEndDate),
    estimatedDecisionDate: optionalDate(row.estimatedDecisionDate),
    owner: row.owner,
    projectType: row.projectType,
    sector: row.sector,
    measureUnit: row.measureUnit,
    estimatedQuantity: optionalDecimal(row.estimatedQuantity, QUANTITY_DECIMALS),
    conversion:
      row.conversionRule && row.conversionFactor
        ? {
            ruleId: row.conversionRule.id,
            scope: row.conversionRule.scope,
            factor: decimal(row.conversionFactor, FACTOR_DECIMALS),
            toUnit: row.conversionRule.toUnit,
          }
        : null,
    estimatedTonnage: optionalDecimal(row.estimatedTonnage, QUANTITY_DECIMALS),
    phase: { ...row.phase, metadata: metadataObject(row.phase.metadata) },
    phaseProgress: decimal(row.phaseProgress, PROGRESS_DECIMALS),
    phaseUpdatedAt: row.phaseUpdatedAt,
    phaseComment: row.phaseComment,
    duplicatedFrom: row.duplicatedFrom
      ? {
          id: row.duplicatedFrom.id,
          code: row.duplicatedFrom.code,
          name: row.duplicatedFrom.name,
          ownerId: row.duplicatedFrom.ownerId,
          countryId: row.duplicatedFrom.countryId,
          isDeleted: row.duplicatedFrom.deletedAt !== null,
        }
      : null,
    opportunities: row.opportunities.map((opportunity) => ({
      stage: { ...opportunity.stage, metadata: metadataObject(opportunity.stage.metadata) },
      outcome: (opportunity.result?.outcome ?? null) as OpportunityOutcomeCode | null,
    })),
    productLines: row._count.products,
    attachments: row._count.attachments,
    lastActivityAt: row.lastActivityAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    createdBy: userRef(row.createdById),
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedById),
  };
}

function classificationData(input: ProjectClassificationInput): Prisma.ProjectUncheckedUpdateInput {
  return {
    projectTypeId: input.projectTypeId,
    sectorId: input.sectorId,
    measureUnitId: input.measureUnitId,
    estimatedQuantity: input.estimatedQuantity,
    conversionRuleId: input.conversionRuleId,
    conversionFactor: input.conversionFactor,
    estimatedTonnage: input.estimatedTonnage,
  };
}

// ---------------------------------------------------------------------------
// Historial de la ficha
// ---------------------------------------------------------------------------

interface HistoryRow {
  id: string;
  occurred_at: Date;
  actor_id: string | null;
  actor_name: string | null;
  kind: ProjectHistoryKind;
  subject_type: 'OPPORTUNITY' | 'PROJECT_PRODUCT' | 'FORECAST_LINE' | null;
  subject_id: string | null;
  subject_label: string | null;
  payload: Record<string, unknown>;
  comment: string | null;
}

// ---------------------------------------------------------------------------
// Usuarios elegibles como asesor (RN-03.6, D-03.16)
// ---------------------------------------------------------------------------

function ownerUserWhere(requiredPermission: string, users: OwnerAssignableSet, activeOnly: boolean, now: Date): Prisma.UserWhereInput {
  const vigente = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const conditions: Prisma.UserWhereInput[] = [
    {
      OR: [
        {
          roles: {
            some: {
              ...vigente,
              role: { isActive: true, deletedAt: null, permissions: { some: { permission: { code: requiredPermission } } } },
            },
          },
        },
        { permissions: { some: { ...vigente, effect: 'GRANT', permission: { code: requiredPermission } } } },
      ],
    },
    // Una denegación directa vigente gana siempre (ADR-018).
    { permissions: { none: { ...vigente, effect: 'DENY', permission: { code: requiredPermission } } } },
  ];
  if (users.kind === 'FILTERED') {
    conditions.push({ OR: [{ id: { in: [...users.userIds] } }, { countryId: { in: [...users.countryIds] } }] });
  }
  return { deletedAt: null, ...(activeOnly ? { status: 'ACTIVE' as const } : {}), AND: conditions };
}

/**
 * Adaptador Prisma de proyectos (03 §L.1, ADR-004). Sin reglas de negocio: aplica el
 * alcance que recibe y escribe lo que el servicio ya validó. La búsqueda es SQL
 * parametrizado (texto normalizado, estado comercial agregado, `EXISTS` por etapa).
 */
@Injectable()
export class PrismaProjectsRepository implements ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: ProjectSearchCriteria, scope: VisibilityScope): Promise<Page<ProjectListRecord>> {
    const from = Prisma.sql`
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      JOIN countries co ON co.id = p.country_id
      JOIN users u ON u.id = p.owner_id
      JOIN catalog_items ph ON ph.id = p.phase_id
      LEFT JOIN catalog_items pt ON pt.id = p.project_type_id
      ${commercialLateral(criteria.openStageRanking)}
      LEFT JOIN catalog_items ls ON ls.id = cs.leading_stage_id
      ${PRIMARY_TEAM_LATERAL}`;
    const where = andSql(this.searchConditions(criteria, scope));
    const direction = Prisma.raw(criteria.sortOrder === 'desc' ? 'DESC' : 'ASC');
    const orderBy = Prisma.sql`${sortExpression(criteria.sortBy, criteria)} ${direction} NULLS LAST, p.id ASC`;
    const offset = (criteria.page - 1) * criteria.pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<ProjectListRow[]>`
        SELECT p.id, p.code, p.name, p.city, p.customer_id, c.legal_name AS customer_name,
               p.country_id, co.iso_code AS country_iso_code, co.name AS country_name,
               p.owner_id, u.display_name AS owner_name,
               pt.id AS type_id, pt.code AS type_code, pt.label AS type_label, pt.is_active AS type_active,
               ph.id AS phase_id, ph.code AS phase_code, ph.label AS phase_label, p.phase_progress,
               p.estimated_decision_date, p.last_activity_at,
               cs.opportunity_count, COALESCE(cs.has_won, FALSE) AS has_won,
               ls.id AS lead_id, ls.code AS lead_code, ls.label AS lead_label,
               tm.team_id, tm.team_code, tm.team_name
        ${from}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${from} WHERE ${where}`,
    ]);

    const items: ProjectListRecord[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      customer: { id: row.customer_id, legalName: row.customer_name },
      country: { id: row.country_id, isoCode: row.country_iso_code, name: row.country_name },
      city: row.city,
      owner: { id: row.owner_id, displayName: row.owner_name },
      projectType:
        row.type_id && row.type_code !== null && row.type_label !== null
          ? { id: row.type_id, code: row.type_code, label: row.type_label, isActive: row.type_active ?? false }
          : null,
      phase: { id: row.phase_id, code: row.phase_code, label: row.phase_label, progress: decimal(row.phase_progress, PROGRESS_DECIMALS) },
      commercial: {
        leadingOpenStage:
          row.lead_id && row.lead_code !== null && row.lead_label !== null ? { id: row.lead_id, code: row.lead_code, label: row.lead_label } : null,
        opportunityCount: row.opportunity_count,
        hasWon: row.has_won,
      },
      estimatedDecisionDate: optionalDate(row.estimated_decision_date),
      lastActivityAt: row.last_activity_at,
      team: row.team_id && row.team_code !== null && row.team_name !== null ? { id: row.team_id, code: row.team_code, name: row.team_name } : null,
    }));
    return createPage(items, totals[0]?.total ?? 0, criteria);
  }

  private searchConditions(criteria: ProjectSearchCriteria, scope: VisibilityScope): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`p.deleted_at IS NULL`, projectVisibilitySql('p', scope)];
    if (criteria.search) {
      const pattern = like(criteria.search);
      conditions.push(Prisma.sql`(${normalizedTextSql(Prisma.sql`p.name`)} LIKE ${pattern} OR lower(p.code) LIKE ${pattern})`);
    }
    if (criteria.code) conditions.push(Prisma.sql`p.code ILIKE ${like(criteria.code)}`);
    if (criteria.city) conditions.push(Prisma.sql`${normalizedTextSql(Prisma.sql`p.city`)} LIKE ${like(criteria.city)}`);
    if (criteria.customerIds.length) conditions.push(uuidInSql(Prisma.sql`p.customer_id`, criteria.customerIds));
    if (criteria.countryIds.length) conditions.push(uuidInSql(Prisma.sql`p.country_id`, criteria.countryIds));
    if (criteria.ownerIds.length) conditions.push(uuidInSql(Prisma.sql`p.owner_id`, criteria.ownerIds));
    if (criteria.projectTypeIds.length) conditions.push(uuidInSql(Prisma.sql`p.project_type_id`, criteria.projectTypeIds));
    if (criteria.phaseIds.length) conditions.push(uuidInSql(Prisma.sql`p.phase_id`, criteria.phaseIds));
    if (criteria.teamIds.length) conditions.push(uuidInSql(Prisma.sql`tm.team_id`, criteria.teamIds));
    if (criteria.stageIds.length) {
      // RN-03.16: EXISTS, para que el proyecto aparezca una sola vez.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM opportunities so
        WHERE so.project_id = p.id AND so.deleted_at IS NULL AND ${uuidInSql(Prisma.sql`so.stage_id`, criteria.stageIds)}
      )`);
    }
    if (criteria.commercialStatus.length) conditions.push(orSql(criteria.commercialStatus.map(commercialStatusCondition)));
    if (criteria.activePhaseIds !== null) conditions.push(uuidInSql(Prisma.sql`p.phase_id`, criteria.activePhaseIds));
    if (criteria.dateRange) {
      const column = dateColumn(criteria.dateRange.field, criteria.timeZone);
      if (criteria.dateRange.from) conditions.push(Prisma.sql`${column} >= ${criteria.dateRange.from}::date`);
      if (criteria.dateRange.to) conditions.push(Prisma.sql`${column} <= ${criteria.dateRange.to}::date`);
    }
    return conditions;
  }

  async findById(projectId: string, scope: VisibilityScope | null, tx?: TransactionContext): Promise<ProjectRecord | null> {
    if (!UUID_PATTERN.test(projectId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const row = await db.project.findFirst({
      where: { id: projectId, deletedAt: null, ...(scope ? projectVisibilityWhere(scope) : {}) },
      include: PROJECT_INCLUDE,
    });
    if (!row) return null;
    const userIds = [row.createdById, row.updatedById].filter((id): id is string => id !== null);
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }) : [];
    return toProjectRecord(row, new Map(users.map((user) => [user.id, user.displayName])));
  }

  async lockProject(projectId: string, mode: 'UPDATE' | 'SHARE', tx: TransactionContext): Promise<boolean> {
    if (!UUID_PATTERN.test(projectId)) return false;
    const db = prismaClientFor(this.prisma, tx);
    const rows =
      mode === 'UPDATE'
        ? await db.$queryRaw<{ id: string }[]>`SELECT id FROM projects WHERE id = ${projectId}::uuid AND deleted_at IS NULL FOR UPDATE`
        : await db.$queryRaw<{ id: string }[]>`SELECT id FROM projects WHERE id = ${projectId}::uuid AND deleted_at IS NULL FOR SHARE`;
    return rows.length > 0;
  }

  async codeExists(code: string, excludeProjectId: string | null, tx?: TransactionContext): Promise<boolean> {
    const row = await prismaClientFor(this.prisma, tx).project.findFirst({
      where: { code, ...(excludeProjectId ? { NOT: { id: excludeProjectId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async create(input: CreateProjectInput, tx: TransactionContext): Promise<string> {
    const db = prismaClientFor(this.prisma, tx);
    try {
      const created = await db.project.create({
        data: {
          code: input.code,
          name: input.name,
          customerId: input.customerId,
          countryId: input.countryId,
          city: input.city,
          address: input.address,
          description: input.description,
          estimatedStartDate: toDateColumn(input.estimatedStartDate),
          estimatedEndDate: toDateColumn(input.estimatedEndDate),
          estimatedDecisionDate: toDateColumn(input.estimatedDecisionDate),
          ownerId: input.ownerId,
          phaseId: input.phaseId,
          phaseProgress: input.phaseProgress,
          phaseUpdatedAt: input.at,
          duplicatedFromId: input.duplicatedFromId,
          lastActivityAt: input.at,
          createdAt: input.at,
          createdById: input.createdById,
          updatedById: input.createdById,
          projectTypeId: input.classification?.projectTypeId ?? null,
          sectorId: input.classification?.sectorId ?? null,
          measureUnitId: input.classification?.measureUnitId ?? null,
          estimatedQuantity: input.classification?.estimatedQuantity ?? null,
          conversionRuleId: input.classification?.conversionRuleId ?? null,
          conversionFactor: input.classification?.conversionFactor ?? null,
          estimatedTonnage: input.classification?.estimatedTonnage ?? null,
        },
        select: { id: true },
      });
      await db.projectPhaseHistory.create({
        data: {
          projectId: created.id,
          fromPhaseId: null,
          toPhaseId: input.phaseId,
          fromProgress: null,
          toProgress: input.phaseProgress,
          comment: null,
          changedById: input.createdById ?? input.ownerId,
          changedAt: input.at,
        },
      });
      return created.id;
    } catch (error) {
      if (isCodeViolation(error)) throw new ProjectCodeConflictError();
      throw error;
    }
  }

  async update(projectId: string, input: UpdateProjectInput, actorId: string | null, at: Date, tx: TransactionContext): Promise<void> {
    const db = prismaClientFor(this.prisma, tx);
    try {
      await db.project.update({
        where: { id: projectId },
        data: {
          code: input.code,
          name: input.name,
          customerId: input.customerId,
          countryId: input.countryId,
          city: input.city,
          address: input.address,
          description: input.description,
          estimatedStartDate: toDateColumn(input.estimatedStartDate),
          estimatedEndDate: toDateColumn(input.estimatedEndDate),
          estimatedDecisionDate: toDateColumn(input.estimatedDecisionDate),
          ownerId: input.ownerId,
          updatedById: actorId,
          lastActivityAt: at,
        },
      });
    } catch (error) {
      if (isCodeViolation(error)) throw new ProjectCodeConflictError();
      throw error;
    }
  }

  async updateClassification(
    projectId: string,
    input: ProjectClassificationInput,
    actorId: string | null,
    at: Date,
    tx: TransactionContext,
  ): Promise<void> {
    await prismaClientFor(this.prisma, tx).project.update({
      where: { id: projectId },
      data: { ...classificationData(input), updatedById: actorId, lastActivityAt: at },
    });
  }

  async changePhase(projectId: string, change: PhaseChangeInput, tx: TransactionContext): Promise<void> {
    const db = prismaClientFor(this.prisma, tx);
    await db.project.update({
      where: { id: projectId },
      data: {
        phaseId: change.toPhaseId,
        phaseProgress: change.toProgress,
        phaseUpdatedAt: change.at,
        phaseComment: change.comment,
        updatedById: change.changedById,
        lastActivityAt: change.at,
      },
    });
    await db.projectPhaseHistory.create({
      data: {
        projectId,
        fromPhaseId: change.fromPhaseId,
        toPhaseId: change.toPhaseId,
        fromProgress: change.fromProgress,
        toProgress: change.toProgress,
        comment: change.comment,
        changedById: change.changedById,
        changedAt: change.at,
      },
    });
  }

  async softDelete(projectId: string, actorId: string | null, at: Date, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).project.update({ where: { id: projectId }, data: { deletedAt: at, updatedById: actorId } });
  }

  async touchLastActivity(projectIds: readonly string[], at: Date, tx: TransactionContext): Promise<void> {
    if (projectIds.length === 0) return;
    // SQL directo: `last_activity_at` es la "última actualización" funcional (RN-03.9) y no
    // debe mover `updated_at` (que Prisma reescribe en todo `update`).
    await prismaClientFor(this.prisma, tx).$executeRaw`
      UPDATE projects SET last_activity_at = ${at} WHERE ${uuidInSql(Prisma.sql`id`, projectIds)}`;
  }

  async countLinkedInteractions(projectId: string, tx: TransactionContext): Promise<LinkedInteractionCounts> {
    const db = prismaClientFor(this.prisma, tx);
    const visits = await db.visit.count({ where: { projectId } });
    const activities = await db.activity.count({ where: { projectId } });
    return { visits, activities };
  }

  async countBlockingChildren(
    projectId: string,
    query: BlockingChildrenQuery,
    tx: TransactionContext,
  ): Promise<{ openOpportunities: number; productsWithForecast: number; nonCancelledVisits: number; openActivities: number }> {
    const db = prismaClientFor(this.prisma, tx);
    const currentIndex = query.currentMonth.year * 12 + query.currentMonth.month;
    const openOpportunities = query.openStageIds.length
      ? await db.opportunity.count({ where: { projectId, deletedAt: null, stageId: { in: [...query.openStageIds] } } })
      : 0;
    const products = await db.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT pp.product_id)::int AS total
      FROM project_products pp
      WHERE pp.project_id = ${projectId}::uuid AND pp.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM forecast_lines f
          WHERE f.project_id = pp.project_id AND f.product_id = pp.product_id
            AND f.quantity > 0 AND (f.year * 12 + f.month) > ${currentIndex}
        )`;
    const nonCancelledVisits = await db.visit.count({
      where: { projectId, NOT: { status: { metadata: { path: ['isCancelled'], equals: true } } } },
    });
    const openActivities = await db.activity.count({
      where: { projectId, deletedAt: null, status: { metadata: { path: ['isOpen'], equals: true } } },
    });
    return { openOpportunities, productsWithForecast: products[0]?.total ?? 0, nonCancelledVisits, openActivities };
  }

  async listPhaseHistory(projectId: string, page: PageRequest): Promise<Page<PhaseHistoryRecord>> {
    const direction = page.sortOrder === 'asc' ? 'asc' : 'desc';
    const where: Prisma.ProjectPhaseHistoryWhereInput = { projectId };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.projectPhaseHistory.findMany({
        where,
        select: {
          id: true,
          fromProgress: true,
          toProgress: true,
          comment: true,
          changedAt: true,
          fromPhase: { select: { id: true, code: true, label: true } },
          toPhase: { select: { id: true, code: true, label: true } },
          changedBy: { select: { id: true, displayName: true } },
        },
        orderBy: [{ changedAt: direction }, { id: direction }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.projectPhaseHistory.count({ where }),
    ]);
    return createPage(
      rows.map((row) => ({
        id: row.id,
        fromPhase: row.fromPhase,
        toPhase: row.toPhase,
        fromProgress: optionalDecimal(row.fromProgress, PROGRESS_DECIMALS),
        toProgress: decimal(row.toProgress, PROGRESS_DECIMALS),
        comment: row.comment,
        changedBy: row.changedBy,
        changedAt: row.changedAt,
      })),
      totalItems,
      page,
    );
  }

  async listHistory(projectId: string, query: ProjectHistoryQuery): Promise<Page<ProjectHistoryRecord>> {
    const id = projectId;
    const excluded = query.excludedAuditEvents.length ? Prisma.sql`AND a.event <> ALL(${[...query.excludedAuditEvents]}::text[])` : Prisma.empty;
    // Ids de los hijos resueltos primero y acotados al proyecto (usa idx_audit_logs_resource).
    const entries = Prisma.sql`
      WITH opp AS (SELECT o.id, o.code FROM opportunities o WHERE o.project_id = ${id}::uuid),
           pp AS (SELECT x.id, pr.sku FROM project_products x JOIN products pr ON pr.id = x.product_id WHERE x.project_id = ${id}::uuid),
           fl AS (SELECT f.id, pr.sku, f.year, f.month FROM forecast_lines f JOIN products pr ON pr.id = f.product_id WHERE f.project_id = ${id}::uuid),
           att AS (SELECT t.id FROM attachments t WHERE t.project_id = ${id}::uuid),
      entries AS (
        SELECT h.id::text AS id, h.changed_at AS occurred_at, h.changed_by_id::text AS actor_ref, 'PHASE'::text AS kind,
               NULL::text AS subject_type, NULL::text AS subject_id, NULL::text AS subject_label,
               jsonb_build_object('fromPhase', fp.label, 'toPhase', tp.label,
                                  'fromProgress', h.from_progress::text, 'toProgress', h.to_progress::text) AS payload,
               h.comment AS comment
        FROM project_phase_history h
        LEFT JOIN catalog_items fp ON fp.id = h.from_phase_id
        JOIN catalog_items tp ON tp.id = h.to_phase_id
        WHERE h.project_id = ${id}::uuid
        UNION ALL
        SELECT sh.id::text, sh.changed_at, sh.changed_by_id::text, 'STAGE', 'OPPORTUNITY', opp.id::text, opp.code,
               jsonb_build_object('fromStage', fs.label, 'toStage', ts.label), sh.comment
        FROM opportunity_stage_history sh
        JOIN opp ON opp.id = sh.opportunity_id
        LEFT JOIN catalog_items fs ON fs.id = sh.from_stage_id
        JOIN catalog_items ts ON ts.id = sh.to_stage_id
        UNION ALL
        SELECT rh.id::text, rh.changed_at, rh.changed_by_id::text, 'RESULT', 'OPPORTUNITY', opp.id::text, opp.code,
               jsonb_build_object('action', rh.action::text, 'outcome', rh.outcome::text, 'reason', rr.label,
                                  'awardedPercent', rh.awarded_percent::text, 'decisionDate', to_char(rh.decision_date, 'YYYY-MM-DD')),
               rh.comments
        FROM opportunity_result_history rh
        JOIN opp ON opp.id = rh.opportunity_id
        LEFT JOIN catalog_items rr ON rr.id = rh.reason_id
        UNION ALL
        SELECT a.id::text, a.occurred_at, a.subject_id,
               CASE
                 WHEN a.resource_type = 'crm.project' AND a.event = ${query.classificationEvent} THEN 'CLASSIFICATION'
                 WHEN a.resource_type = 'crm.project' THEN 'PROJECT_DATA'
                 WHEN a.resource_type = 'crm.opportunity' THEN 'OPPORTUNITY_DATA'
                 WHEN a.resource_type = 'crm.project_product' THEN 'PRODUCT'
                 WHEN a.resource_type = 'crm.forecast_line' THEN 'FORECAST'
                 ELSE 'ATTACHMENT'
               END,
               CASE a.resource_type
                 WHEN 'crm.opportunity' THEN 'OPPORTUNITY'
                 WHEN 'crm.project_product' THEN 'PROJECT_PRODUCT'
                 WHEN 'crm.forecast_line' THEN 'FORECAST_LINE'
               END,
               CASE WHEN a.resource_type IN ('crm.opportunity', 'crm.project_product', 'crm.forecast_line') THEN a.resource_id END,
               COALESCE(opp.code, pp.sku, fl.sku || ' ' || lpad(fl.year::text, 4, '0') || '-' || lpad(fl.month::text, 2, '0')),
               jsonb_build_object('event', a.event, 'changes', COALESCE(a.changes, '{}'::jsonb)),
               NULL::text
        FROM audit_logs a
        LEFT JOIN opp ON a.resource_type = 'crm.opportunity' AND a.resource_id = opp.id::text
        LEFT JOIN pp ON a.resource_type = 'crm.project_product' AND a.resource_id = pp.id::text
        LEFT JOIN fl ON a.resource_type = 'crm.forecast_line' AND a.resource_id = fl.id::text
        WHERE (
            (a.resource_type = 'crm.project' AND a.resource_id = ${id})
            OR (a.resource_type = 'crm.opportunity' AND a.resource_id IN (SELECT opp.id::text FROM opp))
            OR (a.resource_type = 'crm.project_product' AND a.resource_id IN (SELECT pp.id::text FROM pp))
            OR (a.resource_type = 'crm.forecast_line' AND a.resource_id IN (SELECT fl.id::text FROM fl))
            OR (a.resource_type = 'crm.attachment' AND a.resource_id IN (SELECT att.id::text FROM att))
          )
          ${excluded}
      )`;
    const kindFilter = query.kinds.length ? Prisma.sql`WHERE e.kind = ANY(${[...query.kinds]}::text[])` : Prisma.empty;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<HistoryRow[]>`
        ${entries}
        SELECT e.id, e.occurred_at, u.id AS actor_id, u.display_name AS actor_name, e.kind,
               e.subject_type, e.subject_id, e.subject_label, e.payload, e.comment
        FROM entries e
        LEFT JOIN users u ON u.id::text = e.actor_ref
        ${kindFilter}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`${entries} SELECT COUNT(*)::int AS total FROM entries e ${kindFilter}`,
    ]);
    return createPage(
      rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        actor: row.actor_id && row.actor_name !== null ? { id: row.actor_id, displayName: row.actor_name } : null,
        kind: row.kind,
        subject:
          row.subject_type && row.subject_id ? { type: row.subject_type, id: row.subject_id, label: row.subject_label ?? '' } : null,
        payload: row.payload,
        comment: row.comment,
      })),
      totals[0]?.total ?? 0,
      query,
    );
  }

  async findCountry(countryId: string, tx?: TransactionContext): Promise<(CountryOptionRecord & { isActive: boolean }) | null> {
    if (!UUID_PATTERN.test(countryId)) return null;
    return prismaClientFor(this.prisma, tx).country.findUnique({
      where: { id: countryId },
      select: { id: true, isoCode: true, name: true, currencyCode: true, isActive: true },
    });
  }

  async listActiveCountries(): Promise<CountryOptionRecord[]> {
    return this.prisma.country.findMany({
      where: { isActive: true },
      select: { id: true, isoCode: true, name: true, currencyCode: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findEligibleOwner(userId: string, users: OwnerAssignableSet, requiredPermission: string, tx?: TransactionContext): Promise<string | null> {
    if (!UUID_PATTERN.test(userId)) return null;
    const user = await prismaClientFor(this.prisma, tx).user.findFirst({
      where: { id: userId, ...ownerUserWhere(requiredPermission, users, true, new Date()) },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async listOwnerOptions(search: OwnerOptionSearch): Promise<Page<OwnerOptionRecord>> {
    const term = search.search?.trim();
    const population: Prisma.UserWhereInput =
      search.users.kind === 'ASSIGNABLE'
        ? ownerUserWhere(search.users.requiredPermission, search.users.users, true, new Date())
        : { deletedAt: null, ownedProjects: { some: { deletedAt: null, ...projectVisibilityWhere(search.users.scope) } } };
    const where: Prisma.UserWhereInput = {
      ...population,
      ...(term ? { OR: [{ displayName: { contains: term, mode: 'insensitive' } }, { employeeCode: { startsWith: term, mode: 'insensitive' } }] } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          countryId: true,
          teams: {
            where: { isPrimary: true, team: { isActive: true, deletedAt: null } },
            select: { team: { select: { id: true, code: true, name: true } } },
            orderBy: { team: { code: 'asc' } },
            take: 1,
          },
        },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (search.page - 1) * search.pageSize,
        take: search.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return createPage(
      rows.map((row) => ({ id: row.id, displayName: row.displayName, countryId: row.countryId, primaryTeam: row.teams[0]?.team ?? null })),
      totalItems,
      search,
    );
  }

  async listTeamOptions(scope: VisibilityScope): Promise<TeamOptionRecord[]> {
    const base: Prisma.TeamWhereInput = { isActive: true, deletedAt: null };
    const where: Prisma.TeamWhereInput =
      scope.kind === 'ALL'
        ? base
        : {
            ...base,
            OR: [
              { id: { in: [...scope.teamIds] } },
              {
                members: {
                  some: {
                    isPrimary: true,
                    user: { deletedAt: null, OR: [{ id: { in: [...scope.ownerIds] } }, { countryId: { in: [...scope.countryIds] } }] },
                  },
                },
              },
            ],
          };
    return this.prisma.team.findMany({ where, select: { id: true, code: true, name: true, parentId: true }, orderBy: [{ name: 'asc' }, { code: 'asc' }] });
  }
}
