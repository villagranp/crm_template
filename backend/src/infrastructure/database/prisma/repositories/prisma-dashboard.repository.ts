import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { RecentActivityEventType } from '@/modules/dashboard/dto/dashboard-activity.dto';
import type {
  DashboardReadModel,
  RecentActivityCriteria,
  RecentActivityRecord,
  UpcomingVisitRecord,
  UpcomingVisitsCriteria,
} from '@/modules/dashboard/ports/dashboard-read-model.port';

import { PrismaService } from '../prisma.service';
import { uuidInSql } from '../sql-text';
import { interactionRecordVisibilitySql } from './prisma-commercial-metrics.repository';
import { opportunityVisibilitySql } from './prisma-opportunities.repository';
import { projectVisibilitySql } from './prisma-projects.repository';

interface UpcomingRow {
  id: string;
  code: string;
  scheduled_start_at: Date;
  scheduled_end_at: Date | null;
  status_code: string;
  status_label: string;
  objective: string;
  reminder_minutes_before: number | null;
  owner_id: string;
  owner_name: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
}

interface EventRow {
  event_type: RecentActivityEventType;
  event_id: string;
  occurred_at: Date;
  source_type: RecentActivityRecord['sourceType'];
  source_id: string;
  source_code: string;
  source_project_id: string | null;
  owner_id: string;
  owner_name: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  subject: string | null;
  from_label: string | null;
  to_label: string | null;
  outcome: string | null;
  action: string | null;
  progress: string | null;
}

/** Columnas comunes de cada rama del `UNION ALL` de la actividad reciente, en este orden. */
function columns(
  eventType: RecentActivityEventType,
  parts: {
    eventId: Prisma.Sql;
    occurredAt: Prisma.Sql;
    sourceType: string;
    sourceId: Prisma.Sql;
    sourceCode: Prisma.Sql;
    sourceProjectId?: Prisma.Sql;
    ownerId: Prisma.Sql;
    customerId: Prisma.Sql;
    projectId: Prisma.Sql;
    subject?: Prisma.Sql;
    fromLabel?: Prisma.Sql;
    toLabel?: Prisma.Sql;
    outcome?: Prisma.Sql;
    action?: Prisma.Sql;
    progress?: Prisma.Sql;
  },
): Prisma.Sql {
  const text = (value: Prisma.Sql | undefined): Prisma.Sql => (value ? Prisma.sql`(${value})::text` : Prisma.sql`NULL::text`);
  return Prisma.sql`SELECT ${eventType}::text AS event_type, ${parts.eventId} AS event_id, ${parts.occurredAt} AS occurred_at,
    ${parts.sourceType}::text AS source_type, ${parts.sourceId} AS source_id, ${parts.sourceCode}::text AS source_code,
    ${parts.sourceProjectId ?? Prisma.sql`NULL::uuid`} AS source_project_id,
    ${parts.ownerId} AS owner_id, ${parts.customerId} AS customer_id, ${parts.projectId} AS project_id,
    ${text(parts.subject)} AS subject, ${text(parts.fromLabel)} AS from_label, ${text(parts.toLabel)} AS to_label,
    ${text(parts.outcome)} AS outcome, ${text(parts.action)} AS action, ${text(parts.progress)} AS progress`;
}

/**
 * Adaptador de `DashboardReadModel` (01 D.5, F-03). La actividad reciente es un
 * `UNION ALL` de ramas por tipo de evento, cada una con la vigencia (RN-01.13) y la
 * visibilidad de su fuente; las ramas de fuentes sin permiso no se generan.
 */
@Injectable()
export class PrismaDashboardRepository implements DashboardReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async upcomingVisits(criteria: UpcomingVisitsCriteria): Promise<Page<UpcomingVisitRecord>> {
    const where = Prisma.sql`
       WHERE c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
         AND ${uuidInSql(Prisma.sql`v.status_id`, criteria.pendingStatusIds)}
         AND v.scheduled_start_at >= ${criteria.from} AND v.scheduled_start_at <= ${criteria.until}
         AND ${interactionRecordVisibilitySql('v', 'c', 'p', criteria.scope)}`;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<UpcomingRow[]>`
        SELECT v.id, v.code, v.scheduled_start_at, v.scheduled_end_at, s.code AS status_code, s.label AS status_label,
               v.objective, v.reminder_minutes_before, v.owner_id, u.display_name AS owner_name,
               c.id AS customer_id, c.crm_code AS customer_code, c.legal_name AS customer_name,
               p.id AS project_id, p.code AS project_code, p.name AS project_name
          FROM visits v
          JOIN customers c ON c.id = v.customer_id
          LEFT JOIN projects p ON p.id = v.project_id
          JOIN users u ON u.id = v.owner_id
          JOIN catalog_items s ON s.id = v.status_id
          ${where}
         ORDER BY v.scheduled_start_at ASC, v.id
         LIMIT ${criteria.pageSize} OFFSET ${(criteria.page - 1) * criteria.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total
          FROM visits v
          JOIN customers c ON c.id = v.customer_id
          LEFT JOIN projects p ON p.id = v.project_id
          ${where}`,
    ]);
    return createPage(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        scheduledStartAt: row.scheduled_start_at,
        scheduledEndAt: row.scheduled_end_at,
        status: { code: row.status_code, label: row.status_label },
        objective: row.objective,
        reminderMinutesBefore: row.reminder_minutes_before,
        owner: { id: row.owner_id, displayName: row.owner_name },
        customer: { id: row.customer_id, code: row.customer_code, name: row.customer_name },
        project: row.project_id ? { id: row.project_id, code: row.project_code ?? '', name: row.project_name ?? '' } : null,
      })),
      Number(totals[0]?.total ?? 0),
      criteria,
    );
  }

  private branches(criteria: RecentActivityCriteria): Prisma.Sql[] {
    const { sources, semantics, since } = criteria;
    const wanted = (type: RecentActivityEventType): boolean => criteria.types.length === 0 || criteria.types.includes(type);
    const branches: Prisma.Sql[] = [];
    const activityBase = (scope: NonNullable<typeof sources.activities>): Prisma.Sql => Prisma.sql`
        FROM activities a
        JOIN customers c ON c.id = a.customer_id
        LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
         AND ${interactionRecordVisibilitySql('a', 'c', 'p', scope)}`;
    const activityParts = {
      sourceType: 'ACTIVITY',
      sourceId: Prisma.sql`a.id`,
      sourceCode: Prisma.sql`a.code`,
      ownerId: Prisma.sql`a.owner_id`,
      customerId: Prisma.sql`a.customer_id`,
      projectId: Prisma.sql`a.project_id`,
      subject: Prisma.sql`a.subject`,
    };

    if (sources.activities) {
      const scope = sources.activities;
      if (wanted('ACTIVIDAD_REGISTRADA')) {
        branches.push(Prisma.sql`${columns('ACTIVIDAD_REGISTRADA', { ...activityParts, eventId: Prisma.sql`a.id`, occurredAt: Prisma.sql`a.created_at` })}
          ${activityBase(scope)} AND a.created_at >= ${since}`);
      }
      if (wanted('ACTIVIDAD_COMPLETADA')) {
        // Una actividad completada que es interacción se emite solo como INTERACCION (D.5).
        branches.push(Prisma.sql`${columns('ACTIVIDAD_COMPLETADA', { ...activityParts, eventId: Prisma.sql`a.id`, occurredAt: Prisma.sql`a.completed_at` })}
          ${activityBase(scope)} AND a.completed_at >= ${since}
          AND ${uuidInSql(Prisma.sql`a.status_id`, semantics.completedActivityStatusIds)}
          AND NOT ${uuidInSql(Prisma.sql`a.type_id`, semantics.interactionActivityTypeIds)}`);
      }
      if (wanted('INTERACCION')) {
        branches.push(Prisma.sql`${columns('INTERACCION', { ...activityParts, eventId: Prisma.sql`a.id`, occurredAt: Prisma.sql`i.occurred_at` })}
          FROM crm_interactions_v i
          JOIN activities a ON a.id = i.source_id AND i.source_type = 'ACTIVITY'
          JOIN customers c ON c.id = a.customer_id
          LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
           AND ${interactionRecordVisibilitySql('a', 'c', 'p', scope)}
           AND i.occurred_at >= ${since}
           AND ${uuidInSql(Prisma.sql`a.status_id`, semantics.completedActivityStatusIds)}
           AND ${uuidInSql(Prisma.sql`a.type_id`, semantics.interactionActivityTypeIds)}`);
      }
    }

    if (sources.visits && wanted('INTERACCION')) {
      // La vista tiene una fila por visita: una reprogramada aparece una sola vez (RN-01.23).
      branches.push(Prisma.sql`${columns('INTERACCION', {
        eventId: Prisma.sql`v.id`,
        occurredAt: Prisma.sql`i.occurred_at`,
        sourceType: 'VISIT',
        sourceId: Prisma.sql`v.id`,
        sourceCode: Prisma.sql`v.code`,
        ownerId: Prisma.sql`v.owner_id`,
        customerId: Prisma.sql`v.customer_id`,
        projectId: Prisma.sql`v.project_id`,
        subject: Prisma.sql`v.objective`,
      })}
        FROM crm_interactions_v i
        JOIN visits v ON v.id = i.source_id AND i.source_type = 'VISIT'
        JOIN customers c ON c.id = v.customer_id
        LEFT JOIN projects p ON p.id = v.project_id
       WHERE c.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
         AND ${interactionRecordVisibilitySql('v', 'c', 'p', sources.visits)}
         AND i.occurred_at >= ${since}
         AND ${uuidInSql(Prisma.sql`v.status_id`, semantics.interactionVisitStatusIds)}`);
    }

    if (sources.opportunities) {
      const scope = sources.opportunities;
      const opportunityBase = Prisma.sql`
          JOIN projects p ON p.id = o.project_id
          JOIN customers c ON c.id = p.customer_id
         WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND c.deleted_at IS NULL
           AND ${opportunityVisibilitySql('o', 'p', scope)}`;
      const opportunityParts = {
        sourceType: 'OPPORTUNITY',
        sourceId: Prisma.sql`o.id`,
        sourceCode: Prisma.sql`o.code`,
        sourceProjectId: Prisma.sql`o.project_id`,
        ownerId: Prisma.sql`o.owner_id`,
        customerId: Prisma.sql`p.customer_id`,
        projectId: Prisma.sql`p.id`,
      };
      // Cambio de etapa y resultado de la misma operación comparten `changed_at` (misma transacción).
      const sameOperation = (stageAlias: string, resultAlias: string): Prisma.Sql =>
        Prisma.sql`${Prisma.raw(resultAlias)}.opportunity_id = ${Prisma.raw(stageAlias)}.opportunity_id AND ${Prisma.raw(resultAlias)}.changed_at = ${Prisma.raw(stageAlias)}.changed_at`;
      if (wanted('OPORTUNIDAD_ETAPA')) {
        branches.push(Prisma.sql`${columns('OPORTUNIDAD_ETAPA', {
          ...opportunityParts,
          eventId: Prisma.sql`h.id`,
          occurredAt: Prisma.sql`h.changed_at`,
          fromLabel: Prisma.sql`fs.label`,
          toLabel: Prisma.sql`ts.label`,
        })}
          FROM opportunity_stage_history h
          JOIN opportunities o ON o.id = h.opportunity_id
          JOIN catalog_items fs ON fs.id = h.from_stage_id
          JOIN catalog_items ts ON ts.id = h.to_stage_id
          ${opportunityBase}
           AND h.from_stage_id IS NOT NULL AND h.changed_at >= ${since}
           AND NOT EXISTS (SELECT 1 FROM opportunity_result_history rh WHERE ${sameOperation('h', 'rh')})`);
      }
      if (wanted('OPORTUNIDAD_CERRADA') || wanted('OPORTUNIDAD_RESULTADO')) {
        const resultParts = { ...opportunityParts, eventId: Prisma.sql`rh.id`, occurredAt: Prisma.sql`rh.changed_at`, outcome: Prisma.sql`rh.outcome`, action: Prisma.sql`rh.action` };
        if (wanted('OPORTUNIDAD_CERRADA')) {
          branches.push(Prisma.sql`${columns('OPORTUNIDAD_CERRADA', { ...resultParts, fromLabel: Prisma.sql`fs.label`, toLabel: Prisma.sql`ts.label` })}
            FROM opportunity_result_history rh
            JOIN opportunity_stage_history h ON ${sameOperation('h', 'rh')} AND h.from_stage_id IS NOT NULL
            JOIN opportunities o ON o.id = rh.opportunity_id
            JOIN catalog_items fs ON fs.id = h.from_stage_id
            JOIN catalog_items ts ON ts.id = h.to_stage_id
            ${opportunityBase} AND rh.changed_at >= ${since}`);
        }
        if (wanted('OPORTUNIDAD_RESULTADO')) {
          branches.push(Prisma.sql`${columns('OPORTUNIDAD_RESULTADO', resultParts)}
            FROM opportunity_result_history rh
            JOIN opportunities o ON o.id = rh.opportunity_id
            ${opportunityBase} AND rh.changed_at >= ${since}
            AND NOT EXISTS (SELECT 1 FROM opportunity_stage_history h WHERE ${sameOperation('h', 'rh')} AND h.from_stage_id IS NOT NULL)`);
        }
      }
      if (wanted('OPORTUNIDAD_CREADA')) {
        branches.push(Prisma.sql`${columns('OPORTUNIDAD_CREADA', { ...opportunityParts, eventId: Prisma.sql`o.id`, occurredAt: Prisma.sql`o.created_at`, subject: Prisma.sql`p.name` })}
          FROM opportunities o ${opportunityBase} AND o.created_at >= ${since}`);
      }
      if (wanted('OPORTUNIDAD_ACTUALIZADA')) {
        // Solo si la última edición es posterior al alta y a todo evento de historial (RN-01.23).
        branches.push(Prisma.sql`${columns('OPORTUNIDAD_ACTUALIZADA', { ...opportunityParts, eventId: Prisma.sql`o.id`, occurredAt: Prisma.sql`o.updated_at`, subject: Prisma.sql`p.name` })}
          FROM opportunities o ${opportunityBase} AND o.updated_at >= ${since}
           AND o.updated_at > o.created_at + interval '1 second'
           AND o.updated_at > COALESCE((SELECT max(sh.changed_at) FROM opportunity_stage_history sh WHERE sh.opportunity_id = o.id), o.created_at) + interval '1 second'
           AND o.updated_at > COALESCE((SELECT max(xh.changed_at) FROM opportunity_result_history xh WHERE xh.opportunity_id = o.id), o.created_at) + interval '1 second'`);
      }
    }

    if (sources.projects) {
      const scope = sources.projects;
      const projectParts = {
        sourceType: 'PROJECT',
        sourceId: Prisma.sql`p.id`,
        sourceCode: Prisma.sql`p.code`,
        ownerId: Prisma.sql`p.owner_id`,
        customerId: Prisma.sql`p.customer_id`,
        projectId: Prisma.sql`p.id`,
      };
      const projectBase = Prisma.sql`
          JOIN customers c ON c.id = p.customer_id
         WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ${projectVisibilitySql('p', scope)}`;
      if (wanted('PROYECTO_CREADO')) {
        branches.push(Prisma.sql`${columns('PROYECTO_CREADO', { ...projectParts, eventId: Prisma.sql`p.id`, occurredAt: Prisma.sql`p.created_at`, subject: Prisma.sql`p.name` })}
          FROM projects p ${projectBase} AND p.created_at >= ${since}`);
      }
      if (wanted('PROYECTO_FASE')) {
        // La fila de alta (sin fase ni avance de origen) no es un cambio (D-01.10).
        branches.push(Prisma.sql`${columns('PROYECTO_FASE', {
          ...projectParts,
          eventId: Prisma.sql`ph.id`,
          occurredAt: Prisma.sql`ph.changed_at`,
          fromLabel: Prisma.sql`fp.label`,
          toLabel: Prisma.sql`tp.label`,
          progress: Prisma.sql`round(ph.to_progress, 2)`,
        })}
          FROM project_phase_history ph
          JOIN projects p ON p.id = ph.project_id
          LEFT JOIN catalog_items fp ON fp.id = ph.from_phase_id
          JOIN catalog_items tp ON tp.id = ph.to_phase_id
          ${projectBase}
           AND ph.changed_at >= ${since}
           AND NOT (ph.from_phase_id IS NULL AND ph.from_progress IS NULL)`);
      }
    }
    return branches;
  }

  async recentActivity(criteria: RecentActivityCriteria): Promise<Page<RecentActivityRecord>> {
    const branches = this.branches(criteria);
    if (branches.length === 0) return createPage([], 0, criteria);
    const union = Prisma.join(branches, ' UNION ALL ');
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<EventRow[]>`
        SELECT x.*, u.display_name AS owner_name,
               c.crm_code AS customer_code, c.legal_name AS customer_name, p.code AS project_code, p.name AS project_name
          FROM (${union}) x
          JOIN users u ON u.id = x.owner_id
          LEFT JOIN customers c ON c.id = x.customer_id
          LEFT JOIN projects p ON p.id = x.project_id
         ORDER BY x.occurred_at DESC, x.event_type, x.event_id
         LIMIT ${criteria.pageSize} OFFSET ${(criteria.page - 1) * criteria.pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM (${union}) x`,
    ]);
    return createPage(
      rows.map((row) => ({
        eventType: row.event_type,
        eventId: row.event_id,
        occurredAt: row.occurred_at,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceCode: row.source_code,
        sourceProjectId: row.source_project_id,
        responsible: { id: row.owner_id, displayName: row.owner_name },
        customer: row.customer_id ? { id: row.customer_id, code: row.customer_code ?? '', name: row.customer_name ?? '' } : null,
        project: row.project_id ? { id: row.project_id, code: row.project_code ?? '', name: row.project_name ?? '' } : null,
        detail: { subject: row.subject, fromLabel: row.from_label, toLabel: row.to_label, outcome: row.outcome, action: row.action, progress: row.progress },
      })),
      Number(totals[0]?.total ?? 0),
      criteria,
    );
  }
}
