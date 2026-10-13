import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { AlertType } from '@/modules/dashboard/alert-rules';
import type {
  AlertListCriteria,
  AlertRecord,
  AlertsCriteria,
  AlertsReadModel,
  AlertTypeQuery,
} from '@/modules/dashboard/ports/alerts-read-model.port';

import { PrismaService } from '../prisma.service';
import { uuidInSql } from '../sql-text';
import { interactionRecordVisibilitySql } from './prisma-commercial-metrics.repository';
import { opportunityVisibilitySql } from './prisma-opportunities.repository';
import { projectVisibilitySql } from './prisma-projects.repository';

interface AlertRow {
  type: AlertType;
  source_id: string;
  source_code: string;
  reference_date: Date;
  owner_id: string;
  owner_name: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  subject: string | null;
  source_project_id: string | null;
}

function ownerFilter(column: Prisma.Sql, ownerId: string | undefined): Prisma.Sql {
  return ownerId ? Prisma.sql`${column} = ${ownerId}::uuid` : Prisma.sql`TRUE`;
}

/**
 * Cada rama nombra sus columnas: la primera rama del `UNION` depende de los permisos del usuario.
 *
 * Adaptador de `AlertsReadModel` (01 D.6): AL-1…AL-4 como ramas de un `UNION ALL`
 * parametrizado. Una fila por condición y registro (RN-01.28), con el alcance del
 * permiso de cada tipo y la vigencia de RN-01.13.
 */
@Injectable()
export class PrismaAlertsRepository implements AlertsReadModel {
  constructor(private readonly prisma: PrismaService) {}

  private branch(query: AlertTypeQuery, criteria: AlertsCriteria): Prisma.Sql | null {
    const { semantics, now, ownerId } = criteria;
    const weight = Prisma.sql`${query.weight}::int`;
    switch (query.type) {
      case 'ACTIVIDAD_VENCIDA':
        return Prisma.sql`
          SELECT 'ACTIVIDAD_VENCIDA'::text AS type, ${weight} AS weight, a.id AS source_id, a.code AS source_code, a.due_at AS reference_date,
                 a.owner_id, a.customer_id, a.project_id, a.subject::text AS subject, NULL::uuid AS source_project_id
            FROM activities a
            JOIN customers c ON c.id = a.customer_id
            LEFT JOIN projects p ON p.id = a.project_id
           WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
             AND ${uuidInSql(Prisma.sql`a.status_id`, semantics.openActivityStatusIds)}
             AND a.due_at < ${now}
             AND ${ownerFilter(Prisma.sql`a.owner_id`, ownerId)}
             AND ${interactionRecordVisibilitySql('a', 'c', 'p', query.scope)}`;
      case 'VISITA_SIN_CONFIRMAR':
        if (!semantics.unconfirmedVisitBefore) return null;
        return Prisma.sql`
          SELECT 'VISITA_SIN_CONFIRMAR'::text AS type, ${weight} AS weight, v.id AS source_id, v.code AS source_code, COALESCE(v.actual_end_at, v.actual_start_at, v.completion_recorded_at) AS reference_date,
                 v.owner_id AS owner_id, v.customer_id AS customer_id, v.project_id AS project_id, v.objective::text AS subject, NULL::uuid AS source_project_id
            FROM visits v
            JOIN customers c ON c.id = v.customer_id
            LEFT JOIN projects p ON p.id = v.project_id
           WHERE c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
             AND ${uuidInSql(Prisma.sql`v.status_id`, semantics.doneVisitStatusIds)}
             AND v.confirmed_at IS NULL
             AND COALESCE(v.actual_end_at, v.actual_start_at, v.completion_recorded_at) < ${semantics.unconfirmedVisitBefore}
             AND ${ownerFilter(Prisma.sql`v.owner_id`, ownerId)}
             AND ${interactionRecordVisibilitySql('v', 'c', 'p', query.scope)}`;
      case 'PROYECTO_SIN_ACTUALIZAR':
        if (!semantics.staleProjectBefore) return null;
        return Prisma.sql`
          SELECT 'PROYECTO_SIN_ACTUALIZAR'::text AS type, ${weight} AS weight, p.id AS source_id, p.code AS source_code, p.last_activity_at AS reference_date,
                 p.owner_id AS owner_id, p.customer_id AS customer_id, p.id AS project_id, p.name::text AS subject, NULL::uuid AS source_project_id
            FROM projects p
            JOIN customers c ON c.id = p.customer_id
           WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
             AND ${uuidInSql(Prisma.sql`p.phase_id`, semantics.nonFinalPhaseIds)}
             AND p.last_activity_at < ${semantics.staleProjectBefore}
             AND ${ownerFilter(Prisma.sql`p.owner_id`, ownerId)}
             AND ${projectVisibilitySql('p', query.scope)}`;
      case 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION':
        return Prisma.sql`
          SELECT 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION'::text AS type, ${weight} AS weight, o.id AS source_id, o.code AS source_code, o.stage_changed_at AS reference_date,
                 o.owner_id AS owner_id, p.customer_id AS customer_id, p.id AS project_id, s.label::text AS subject, o.project_id AS source_project_id
            FROM opportunities o
            JOIN projects p ON p.id = o.project_id
            JOIN customers c ON c.id = p.customer_id
            JOIN catalog_items s ON s.id = o.stage_id
           WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND c.deleted_at IS NULL
             AND ${uuidInSql(Prisma.sql`o.stage_id`, semantics.openStageIds)}
             AND (o.next_action IS NULL OR btrim(o.next_action) = '')
             AND ${ownerFilter(Prisma.sql`o.owner_id`, ownerId)}
             AND ${opportunityVisibilitySql('o', 'p', query.scope)}`;
      default:
        return null;
    }
  }

  private union(criteria: AlertsCriteria): Prisma.Sql | null {
    const branches = criteria.types.map((query) => this.branch(query, criteria)).filter((sql): sql is Prisma.Sql => sql !== null);
    return branches.length === 0 ? null : Prisma.join(branches, ' UNION ALL ');
  }

  async list(criteria: AlertListCriteria): Promise<Page<AlertRecord>> {
    const union = this.union(criteria);
    if (!union) return createPage([], 0, criteria);
    const direction = Prisma.raw(criteria.sortOrder === 'asc' ? 'ASC' : 'DESC');
    const dateDirection = Prisma.raw(criteria.sortBy === 'referenceDate' && criteria.sortOrder === 'desc' ? 'DESC' : 'ASC');
    const order =
      criteria.sortBy === 'referenceDate'
        ? Prisma.sql`x.reference_date ${dateDirection}, x.weight DESC`
        : Prisma.sql`x.weight ${direction}, x.reference_date ASC`;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<AlertRow[]>`
        SELECT x.type, x.source_id, x.source_code, x.reference_date, x.owner_id, u.display_name AS owner_name,
               x.customer_id, c.crm_code AS customer_code, c.legal_name AS customer_name,
               x.project_id, p.code AS project_code, p.name AS project_name, x.subject, x.source_project_id
          FROM (${union}) x
          JOIN users u ON u.id = x.owner_id
          LEFT JOIN customers c ON c.id = x.customer_id
          LEFT JOIN projects p ON p.id = x.project_id
         ORDER BY ${order}, x.type, x.source_id
         LIMIT ${criteria.pageSize} OFFSET ${(criteria.page - 1) * criteria.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM (${union}) x`,
    ]);
    return createPage(
      rows.map((row) => ({
        type: row.type,
        sourceId: row.source_id,
        sourceCode: row.source_code,
        referenceDate: row.reference_date,
        owner: { id: row.owner_id, displayName: row.owner_name },
        customer: row.customer_id ? { id: row.customer_id, code: row.customer_code ?? '', name: row.customer_name ?? '' } : null,
        project: row.project_id ? { id: row.project_id, code: row.project_code ?? '', name: row.project_name ?? '' } : null,
        subject: row.subject ?? '',
        sourceProjectId: row.source_project_id,
      })),
      Number(totals[0]?.total ?? 0),
      criteria,
    );
  }

  async countByType(criteria: AlertsCriteria): Promise<Partial<Record<AlertType, number>>> {
    const union = this.union(criteria);
    if (!union) return {};
    const rows = await this.prisma.$queryRaw<{ type: AlertType; total: bigint }[]>`
      SELECT x.type, count(*) AS total FROM (${union}) x GROUP BY x.type`;
    return Object.fromEntries(rows.map((row) => [row.type, Number(row.total)]));
  }
}
