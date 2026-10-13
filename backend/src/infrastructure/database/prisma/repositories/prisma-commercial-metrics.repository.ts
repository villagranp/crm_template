import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { DateRange } from '@/modules/commercial-metrics/commercial-period';
import type { SemanticCatalogItem, YearMonth } from '@/modules/commercial-metrics/metric-definitions';
import type {
  AchievementQuery,
  AchievementSubject,
  ActivityCountRows,
  CommercialMetricsReadModel,
  ForecastWindowRows,
  OutcomeCountRow,
  SalesTargetRecord,
  StageCountRow,
  TargetSubjectFilter,
  UnitRef,
  VisitCountRows,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { PrismaService } from '../prisma.service';
import { orSql, uuidInSql } from '../sql-text';
import { opportunityVisibilitySql } from './prisma-opportunities.repository';
import { projectVisibilitySql } from './prisma-projects.repository';

const SQL_ALIAS = /^[a-z][a-z0-9_]*$/;

function alias(name: string): Prisma.Sql {
  if (!SQL_ALIAS.test(name)) throw new Error(`Invalid SQL alias: ${name}`);
  return Prisma.raw(name);
}

/**
 * Visibilidad de visitas y actividades (00 §4.2, DM-13) sobre los alias del
 * registro, de su cliente y de su proyecto (`LEFT JOIN`): dueño en el alcance, o
 * país del cliente en el alcance, o proyecto vinculado visible. No filtra
 * eliminados. Exportado para Inicio, Reportes y Actividad comercial.
 */
export function interactionRecordVisibilitySql(recordAlias: string, customerAlias: string, projectAlias: string, scope: VisibilityScope): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  const r = alias(recordAlias);
  const c = alias(customerAlias);
  const p = alias(projectAlias);
  return orSql([
    uuidInSql(Prisma.sql`${r}.owner_id`, scope.ownerIds),
    uuidInSql(Prisma.sql`${c}.country_id`, scope.countryIds),
    Prisma.sql`(${p}.id IS NOT NULL AND ${projectVisibilitySql(projectAlias, scope)})`,
  ]);
}

/** Línea de forecast visible: proyecto visible, o línea cuyo asesor está en el alcance (03 H.1). */
export function forecastLineVisibilitySql(lineAlias: string, projectAlias: string, scope: VisibilityScope): Prisma.Sql {
  if (scope.kind === 'ALL') return Prisma.sql`TRUE`;
  return Prisma.sql`(${projectVisibilitySql(projectAlias, scope)} OR ${uuidInSql(Prisma.sql`${alias(lineAlias)}.owner_id`, scope.ownerIds)})`;
}

/** `(year * 12 + month) = ANY(…)`, o `FALSE` sin meses. */
function monthsSql(lineAlias: string, months: readonly YearMonth[]): Prisma.Sql {
  if (months.length === 0) return Prisma.sql`FALSE`;
  const l = alias(lineAlias);
  return Prisma.sql`(${l}.year * 12 + ${l}.month) = ANY(${months.map((month) => month.year * 12 + month.month)}::int[])`;
}

function idsSql(column: Prisma.Sql, ids: readonly string[]): Prisma.Sql {
  return uuidInSql(column, ids);
}

function count(value: bigint | number | null | undefined): number {
  return Number(value ?? 0);
}

/** Filtro del sujeto del "logrado" (D-01.8) sobre las columnas de dueño y país. */
function subjectSql(subject: AchievementSubject, ownerColumn: Prisma.Sql, countryColumn: Prisma.Sql): Prisma.Sql {
  if (subject.kind === 'ALL') return Prisma.sql`TRUE`;
  if (subject.kind === 'COUNTRY') return Prisma.sql`${countryColumn} = ${subject.countryId}::uuid`;
  return uuidInSql(ownerColumn, subject.ownerIds);
}

/** Adaptador Prisma de `CommercialMetricsReadModel` (01 L.1): consultas agregadas parametrizadas. */
@Injectable()
export class PrismaCommercialMetricsRepository implements CommercialMetricsReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async catalogItems(catalogKey: string): Promise<SemanticCatalogItem[]> {
    const items = await this.prisma.catalogItem.findMany({
      where: { catalog: { key: catalogKey } },
      select: { id: true, code: true, label: true, metadata: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return items.map((item) => ({ ...item, metadata: (item.metadata ?? null) as Record<string, unknown> | null }));
  }

  async unitByCode(code: string): Promise<UnitRef | null> {
    return this.prisma.unitOfMeasure.findUnique({ where: { code }, select: { id: true, code: true, symbol: true } });
  }

  async countProjects(scope: VisibilityScope, phaseIds: readonly string[]): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
        FROM projects p
        JOIN customers c ON c.id = p.customer_id
       WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
         AND ${idsSql(Prisma.sql`p.phase_id`, phaseIds)}
         AND ${projectVisibilitySql('p', scope)}`;
    return count(row?.total);
  }

  async countOpportunitiesByStage(scope: VisibilityScope, stageIds: readonly string[]): Promise<StageCountRow[]> {
    const rows = await this.prisma.$queryRaw<{ stage_id: string; total: bigint }[]>`
      SELECT o.stage_id, count(*) AS total
        FROM opportunities o
        JOIN projects p ON p.id = o.project_id
        JOIN customers c ON c.id = p.customer_id
       WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND c.deleted_at IS NULL
         AND ${idsSql(Prisma.sql`o.stage_id`, stageIds)}
         AND ${opportunityVisibilitySql('o', 'p', scope)}
       GROUP BY o.stage_id`;
    return rows.map((row) => ({ stageId: row.stage_id, count: count(row.total) }));
  }

  async countOpportunitiesByOutcome(scope: VisibilityScope, period: DateRange): Promise<OutcomeCountRow[]> {
    // Una fila por oportunidad (resultado único por oportunidad): nunca el JOIN con productos (RN-01.14).
    const rows = await this.prisma.$queryRaw<{ outcome: OutcomeCountRow['outcome']; total: bigint }[]>`
      SELECT r.outcome::text AS outcome, count(*) AS total
        FROM opportunities o
        JOIN opportunity_results r ON r.opportunity_id = o.id
        JOIN projects p ON p.id = o.project_id
        JOIN customers c ON c.id = p.customer_id
       WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND c.deleted_at IS NULL
         AND r.decision_date BETWEEN ${period.from}::date AND ${period.to}::date
         AND ${opportunityVisibilitySql('o', 'p', scope)}
       GROUP BY r.outcome`;
    return rows.map((row) => ({ outcome: row.outcome, count: count(row.total) }));
  }

  async forecastWindow(scope: VisibilityScope, months: readonly YearMonth[]): Promise<ForecastWindowRows> {
    const base = Prisma.sql`
        FROM forecast_lines fl
        JOIN projects p ON p.id = fl.project_id
        JOIN customers c ON c.id = p.customer_id
       WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
         AND ${monthsSql('fl', months)}
         AND ${forecastLineVisibilitySql('fl', 'p', scope)}`;
    const [monthly, totals, byUnit] = await Promise.all([
      this.prisma.$queryRaw<{ year: number; month: number; tonnage: string | null; lines: bigint }[]>`
        SELECT fl.year, fl.month, round(sum(fl.tonnage), 4)::text AS tonnage, count(*) AS lines ${base}
         GROUP BY fl.year, fl.month`,
      this.prisma.$queryRaw<{ unconverted: bigint }[]>`
        SELECT count(*) FILTER (WHERE fl.quantity > 0 AND fl.tonnage IS NULL) AS unconverted ${base}`,
      // Cantidades por unidad: nunca se suman entre unidades (RN-01.16).
      this.prisma.$queryRaw<{ id: string; code: string; symbol: string; quantity: string }[]>`
        SELECT u.id, u.code, u.symbol, round(sum(fl.quantity), 4)::text AS quantity
          FROM forecast_lines fl
          JOIN projects p ON p.id = fl.project_id
          JOIN customers c ON c.id = p.customer_id
          JOIN units_of_measure u ON u.id = fl.unit_id
         WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
           AND ${monthsSql('fl', months)}
           AND ${forecastLineVisibilitySql('fl', 'p', scope)}
         GROUP BY u.id, u.code, u.symbol
         ORDER BY u.code`,
    ]);
    return {
      months: monthly.map((row) => ({ year: Number(row.year), month: Number(row.month), tonnage: row.tonnage, lineCount: count(row.lines) })),
      unconvertedLines: count(totals[0]?.unconverted),
      quantitiesByUnit: byUnit.map((row) => ({ unit: { id: row.id, code: row.code, symbol: row.symbol }, quantity: row.quantity })),
    };
  }

  async countVisits(scope: VisibilityScope, pendingStatusIds: readonly string[], now: Date, upcomingUntil: Date): Promise<VisitCountRows> {
    const [row] = await this.prisma.$queryRaw<{ pending: bigint; overdue: bigint; upcoming: bigint }[]>`
      SELECT count(*) AS pending,
             count(*) FILTER (WHERE v.scheduled_start_at < ${now}) AS overdue,
             count(*) FILTER (WHERE v.scheduled_start_at >= ${now} AND v.scheduled_start_at <= ${upcomingUntil}) AS upcoming
        FROM visits v
        JOIN customers c ON c.id = v.customer_id
        LEFT JOIN projects p ON p.id = v.project_id
       WHERE c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
         AND ${idsSql(Prisma.sql`v.status_id`, pendingStatusIds)}
         AND ${interactionRecordVisibilitySql('v', 'c', 'p', scope)}`;
    return { pending: count(row?.pending), overdue: count(row?.overdue), upcoming: count(row?.upcoming) };
  }

  async countActivities(scope: VisibilityScope, openStatusIds: readonly string[], now: Date, dueSoonUntil: Date): Promise<ActivityCountRows> {
    const [row] = await this.prisma.$queryRaw<{ pending: bigint; due_soon: bigint; overdue: bigint }[]>`
      SELECT count(*) FILTER (WHERE a.due_at IS NULL OR a.due_at >= ${now}) AS pending,
             count(*) FILTER (WHERE a.due_at >= ${now} AND a.due_at <= ${dueSoonUntil}) AS due_soon,
             count(*) FILTER (WHERE a.due_at < ${now}) AS overdue
        FROM activities a
        JOIN customers c ON c.id = a.customer_id
        LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
         AND ${idsSql(Prisma.sql`a.status_id`, openStatusIds)}
         AND ${interactionRecordVisibilitySql('a', 'c', 'p', scope)}`;
    return { pending: count(row?.pending), dueSoon: count(row?.due_soon), overdue: count(row?.overdue) };
  }

  async listTargets(subjects: TargetSubjectFilter, years: readonly number[]): Promise<SalesTargetRecord[]> {
    const alternatives: Prisma.Sql[] = [
      uuidInSql(Prisma.sql`t.user_id`, subjects.userIds),
      uuidInSql(Prisma.sql`t.team_id`, subjects.teamIds),
      uuidInSql(Prisma.sql`t.country_id`, subjects.countryIds),
    ];
    if (subjects.allCountries) alternatives.push(Prisma.sql`t.country_id IS NOT NULL`);
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        metric: SalesTargetRecord['metric'];
        year: number;
        month: number | null;
        user_id: string | null;
        team_id: string | null;
        country_id: string | null;
        product_family_id: string | null;
        target_value: string;
        subject_label: string | null;
      }[]
    >`
      SELECT t.id, t.metric::text AS metric, t.year, t.month, t.user_id, t.team_id, t.country_id, t.product_family_id,
             round(t.target_value, 4)::text AS target_value,
             COALESCE(u.display_name, tm.name, co.name) AS subject_label
        FROM sales_targets t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN teams tm ON tm.id = t.team_id
        LEFT JOIN countries co ON co.id = t.country_id
       WHERE t.deleted_at IS NULL
         AND t.year = ANY(${[...years]}::int[])
         AND ${orSql(alternatives)}
       ORDER BY t.year, t.month NULLS FIRST, t.metric, t.id`;
    return rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      year: Number(row.year),
      month: row.month === null ? null : Number(row.month),
      userId: row.user_id,
      teamId: row.team_id,
      countryId: row.country_id,
      productFamilyId: row.product_family_id,
      targetValue: row.target_value,
      subjectLabel: row.subject_label ?? '',
    }));
  }

  async teamsLedOrPrimary(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t.id
        FROM teams t
       WHERE t.is_active AND t.deleted_at IS NULL
         AND (t.manager_id = ${userId}::uuid
              OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = ${userId}::uuid AND m.is_primary))
       ORDER BY t.id`;
    return rows.map((row) => row.id);
  }

  async teamOwnerIds(teamId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT t.id FROM teams t WHERE t.id = ${teamId}::uuid AND t.is_active AND t.deleted_at IS NULL
        UNION
        SELECT child.id FROM teams child JOIN tree ON child.parent_id = tree.id WHERE child.is_active AND child.deleted_at IS NULL
      )
      SELECT m.user_id FROM team_members m JOIN tree ON tree.id = m.team_id
      UNION
      SELECT t.manager_id FROM teams t JOIN tree ON tree.id = t.id WHERE t.manager_id IS NOT NULL`;
    return rows.map((row) => row.user_id);
  }

  async achieved(query: AchievementQuery): Promise<string> {
    const { subject } = query;
    if (query.metric === 'VISITS') {
      const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
        SELECT count(*)::numeric(19, 4)::text AS value
          FROM visits v
          JOIN customers c ON c.id = v.customer_id
          LEFT JOIN projects p ON p.id = v.project_id
         WHERE c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
           AND ${idsSql(Prisma.sql`v.status_id`, query.doneVisitStatusIds)}
           AND v.actual_start_at >= ${query.periodStart} AND v.actual_start_at < ${query.periodEndExclusive}
           AND ${subjectSql(subject, Prisma.sql`v.owner_id`, Prisma.sql`c.country_id`)}`;
      return row?.value ?? '0.0000';
    }
    if (query.metric === 'ACTIVITIES') {
      const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
        SELECT count(*)::numeric(19, 4)::text AS value
          FROM activities a
          JOIN customers c ON c.id = a.customer_id
          LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
           AND ${idsSql(Prisma.sql`a.status_id`, query.completedActivityStatusIds)}
           AND a.completed_at >= ${query.periodStart} AND a.completed_at < ${query.periodEndExclusive}
           AND ${subjectSql(subject, Prisma.sql`a.owner_id`, Prisma.sql`c.country_id`)}`;
      return row?.value ?? '0.0000';
    }
    // Ganadas = WON + PARTIAL (DM-15); toneladas e importes ponderados por el porcentaje adjudicado.
    const weighted = (column: Prisma.Sql): Prisma.Sql =>
      Prisma.sql`COALESCE(sum(${column} * CASE WHEN r.outcome = 'WON' THEN 1 ELSE COALESCE(r.awarded_percent, 0) / 100 END), 0)`;
    const value =
      query.metric === 'WON_OPPORTUNITIES'
        ? Prisma.sql`count(*)::numeric`
        : query.metric === 'TONNAGE'
          ? weighted(Prisma.sql`o.estimated_tonnage`)
          : weighted(Prisma.sql`o.estimated_amount_usd`);
    const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
      SELECT round(${value}, 4)::text AS value
        FROM opportunities o
        JOIN opportunity_results r ON r.opportunity_id = o.id
        JOIN projects p ON p.id = o.project_id
        JOIN customers c ON c.id = p.customer_id
       WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND c.deleted_at IS NULL
         AND r.outcome IN ('WON', 'PARTIAL')
         AND r.decision_date BETWEEN ${query.period.from}::date AND ${query.period.to}::date
         AND ${subjectSql(subject, Prisma.sql`o.owner_id`, Prisma.sql`p.country_id`)}`;
    return row?.value ?? '0.0000';
  }
}
