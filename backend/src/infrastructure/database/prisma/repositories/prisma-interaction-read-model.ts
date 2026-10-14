import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { SourceVisibility } from '@/modules/commercial-activity/ports/agenda-read-model.port';
import type {
  FollowUpCriteria,
  FollowUpRecord,
  FollowUpSortField,
  InteractionCriteria,
  InteractionReadModel,
  InteractionRecord,
  InteractionSourceType,
  TraceAttachmentRecord,
} from '@/modules/commercial-activity/ports/interaction-read-model.port';

import { PrismaService } from '../prisma.service';
import { andSql, orSql, uuidInSql } from '../sql-text';

import { commercialVisibilitySql } from './prisma-commercial-visibility';

/** Instante como parámetro `timestamptz` explícito (texto ISO 8601 UTC). */
function timestampSql(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamptz`;
}

/** Visita que cuenta como interacción (RN-04.33, DM-22): realizada o confirmada. */
const VISIT_IS_INTERACTION = Prisma.sql`((s.metadata ->> 'isDone') = 'true' OR (s.metadata ->> 'isConfirmed') = 'true')`;
/** Actividad que cuenta como interacción: completada y de un tipo con `isInteraction`. */
const ACTIVITY_IS_INTERACTION = Prisma.sql`((s.metadata ->> 'isCompleted') = 'true' AND (t.metadata ->> 'isInteraction') = 'true')`;

interface InteractionRow {
  source_type: InteractionSourceType;
  source_id: string;
  source_code: string;
  occurred_at: Date;
  type_id: string | null;
  type_label: string | null;
  user_id: string;
  user_name: string;
  customer_id: string;
  customer_crm_code: string;
  customer_legal_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  opportunity_id: string | null;
  opportunity_code: string | null;
  subject: string;
  summary: string | null;
  result_id: string | null;
  result_code: string | null;
  result_label: string | null;
  next_action: string | null;
  next_action_date: Date | null;
}

function toInteraction(row: InteractionRow): InteractionRecord {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceCode: row.source_code,
    occurredAt: row.occurred_at,
    typeId: row.type_id,
    typeLabel: row.type_label,
    user: { id: row.user_id, displayName: row.user_name },
    customer: { id: row.customer_id, crmCode: row.customer_crm_code, legalName: row.customer_legal_name },
    project:
      row.project_id && row.project_code !== null && row.project_name !== null
        ? { id: row.project_id, code: row.project_code, name: row.project_name }
        : null,
    opportunity: row.opportunity_id && row.opportunity_code !== null ? { id: row.opportunity_id, code: row.opportunity_code } : null,
    subject: row.subject,
    summary: row.summary,
    result: row.result_id && row.result_code !== null && row.result_label !== null ? { id: row.result_id, code: row.result_code, label: row.result_label } : null,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date,
  };
}

/**
 * Predicado de interacción visible sobre la vista (`i` con `owner_id`, `c` cliente,
 * `s` estado, `t` tipo): cada fuente con su semántica y su propio alcance.
 */
function interactionVisibilitySql(visibility: SourceVisibility, sourceTypes: readonly InteractionSourceType[]): Prisma.Sql {
  const branches: Prisma.Sql[] = [];
  if (visibility.visits && sourceTypes.includes('VISIT')) {
    branches.push(Prisma.sql`(i.source_type = 'VISIT' AND ${VISIT_IS_INTERACTION} AND ${commercialVisibilitySql('i', 'c', visibility.visits)})`);
  }
  if (visibility.activities && sourceTypes.includes('ACTIVITY')) {
    branches.push(
      Prisma.sql`(i.source_type = 'ACTIVITY' AND ${ACTIVITY_IS_INTERACTION} AND ${commercialVisibilitySql('i', 'c', visibility.activities)})`,
    );
  }
  return orSql(branches);
}

/** La vista expone el responsable como `user_id`; el predicado de visibilidad compartido lee `owner_id`. */
const INTERACTIONS_FROM = Prisma.sql`
  FROM (SELECT iv.*, iv.user_id AS owner_id FROM crm_interactions_v iv) i
  JOIN customers c ON c.id = i.customer_id
  JOIN users u ON u.id = i.user_id
  JOIN catalog_items s ON s.id = i.status_id
  LEFT JOIN catalog_items t ON t.id = i.type_id
  LEFT JOIN catalog_items r ON r.id = i.result_id
  LEFT JOIN projects p ON p.id = i.project_id
  LEFT JOIN opportunities o ON o.id = i.opportunity_id`;

const INTERACTIONS_SELECT = Prisma.sql`
  i.source_type, i.source_id, i.source_code, i.occurred_at, i.type_id,
  t.label AS type_label,
  u.id AS user_id, u.display_name AS user_name,
  c.id AS customer_id, c.crm_code AS customer_crm_code, c.legal_name AS customer_legal_name,
  p.id AS project_id, p.code AS project_code, p.name AS project_name,
  o.id AS opportunity_id, o.code AS opportunity_code,
  i.subject, i.summary,
  r.id AS result_id, r.code AS result_code, r.label AS result_label,
  i.next_action, i.next_action_date`;

const FOLLOW_UP_SORT: Readonly<Record<FollowUpSortField, string>> = {
  lastInteractionAt: 'f.li_occurred_at',
  nextActionDate: 'f.next_action_date',
  customerName: 'kc.legal_name_normalized',
};

interface FollowUpRow {
  key_id: string;
  customer_id: string;
  customer_crm_code: string;
  customer_legal_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  li_source_type: InteractionSourceType | null;
  li_source_id: string | null;
  li_source_code: string | null;
  li_occurred_at: Date | null;
  li_type_label: string | null;
  li_summary: string | null;
  na_source_type: InteractionSourceType | null;
  na_source_id: string | null;
  na_source_code: string | null;
  uses_fallback: boolean;
  next_action: string | null;
  next_action_date: Date | null;
  responsible_id: string | null;
  responsible_name: string | null;
  attachment_count: number;
}

function toFollowUp(row: FollowUpRow): FollowUpRecord {
  const lastInteraction =
    row.li_source_type && row.li_source_id && row.li_source_code && row.li_occurred_at
      ? {
          sourceType: row.li_source_type,
          sourceId: row.li_source_id,
          sourceCode: row.li_source_code,
          occurredAt: row.li_occurred_at,
          typeLabel: row.li_type_label,
          summary: row.li_summary,
        }
      : null;
  const nextActionSource =
    row.na_source_type && row.na_source_id && row.na_source_code
      ? { sourceType: row.na_source_type, sourceId: row.na_source_id, sourceCode: row.na_source_code }
      : row.uses_fallback && lastInteraction
        ? { sourceType: lastInteraction.sourceType, sourceId: lastInteraction.sourceId, sourceCode: lastInteraction.sourceCode }
        : null;
  return {
    customer: { id: row.customer_id, crmCode: row.customer_crm_code, legalName: row.customer_legal_name },
    project:
      row.project_id && row.project_code !== null && row.project_name !== null
        ? { id: row.project_id, code: row.project_code, name: row.project_name }
        : null,
    lastInteraction,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date,
    nextActionSource,
    responsible: row.responsible_id && row.responsible_name !== null ? { id: row.responsible_id, displayName: row.responsible_name } : null,
    notes: lastInteraction?.summary ?? null,
    attachmentCount: row.attachment_count,
  };
}

/**
 * Modelo de lectura del historial de interacciones y del seguimiento (04 F.3, F.6,
 * 00 §2.12). SQL de plantilla con parámetros enlazados (nunca `Unsafe`), con `LIMIT`
 * y el mismo predicado de visibilidad que los listados (H.3).
 */
@Injectable()
export class PrismaInteractionReadModel implements InteractionReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async list(criteria: InteractionCriteria, visibility: SourceVisibility): Promise<Page<InteractionRecord>> {
    const conditions: Prisma.Sql[] = [interactionVisibilitySql(visibility, criteria.sourceTypes)];
    if (criteria.from) conditions.push(Prisma.sql`i.occurred_at >= ${timestampSql(criteria.from)}`);
    if (criteria.to) conditions.push(Prisma.sql`i.occurred_at <= ${timestampSql(criteria.to)}`);
    if (criteria.customerId) conditions.push(Prisma.sql`i.customer_id = ${criteria.customerId}::uuid`);
    if (criteria.projectId) conditions.push(Prisma.sql`i.project_id = ${criteria.projectId}::uuid`);
    if (criteria.opportunityId) conditions.push(Prisma.sql`i.opportunity_id = ${criteria.opportunityId}::uuid`);
    if (criteria.userIds.length > 0) conditions.push(uuidInSql(Prisma.sql`i.user_id`, criteria.userIds));
    if (criteria.typeIds.length > 0) conditions.push(uuidInSql(Prisma.sql`i.type_id`, criteria.typeIds));
    if (criteria.resultIds.length > 0) conditions.push(uuidInSql(Prisma.sql`i.result_id`, criteria.resultIds));
    const where = andSql(conditions);
    const direction = criteria.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderBy = Prisma.raw(`i.occurred_at ${direction}, i.source_code ${direction}, i.source_id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<InteractionRow[]>`
        SELECT ${INTERACTIONS_SELECT} ${INTERACTIONS_FROM}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${INTERACTIONS_FROM} WHERE ${where}`,
    ]);
    return createPage(rows.map(toInteraction), totals[0]?.total ?? 0, criteria);
  }

  async followUps(criteria: FollowUpCriteria, visibility: SourceVisibility): Promise<Page<FollowUpRecord>> {
    const sources = this.sourcesSql({ customerId: criteria.customerId, projectId: criteria.projectId }, visibility);
    if (!sources) return createPage([], 0, criteria);
    const keyed =
      criteria.groupBy === 'PROJECT'
        ? Prisma.sql`SELECT src.*, src.project_id AS key_id FROM src JOIN projects kp ON kp.id = src.project_id AND kp.deleted_at IS NULL`
        : Prisma.sql`SELECT src.*, src.customer_id AS key_id FROM src`;
    const keyJoin =
      criteria.groupBy === 'PROJECT'
        ? Prisma.sql`JOIN projects kp ON kp.id = f.key_id JOIN customers kc ON kc.id = kp.customer_id`
        : Prisma.sql`JOIN customers kc ON kc.id = f.key_id LEFT JOIN projects kp ON FALSE`;

    // RN-04.34 (misma regla que `follow-up.selectFollowUp`): última interacción por fecha
    // (desempate por id); próxima acción con fecha ≥ hoy más cercana o, si no hay, la de
    // la última interacción sin fecha; responsable = dueño de quien aporta la próxima
    // acción o, si no hay, de la última interacción.
    const withClause = Prisma.sql`
      WITH src AS (${sources}),
      keyed AS (${keyed}),
      last_i AS (
        SELECT DISTINCT ON (key_id) key_id, source_type, source_id, source_code, occurred_at, type_label, summary, owner_id, next_action, next_action_date
        FROM keyed WHERE is_interaction
        ORDER BY key_id, occurred_at DESC, source_id ASC),
      next_a AS (
        SELECT DISTINCT ON (key_id) key_id, source_type, source_id, source_code, owner_id, next_action, next_action_date
        FROM keyed
        WHERE next_action IS NOT NULL AND btrim(next_action) <> '' AND next_action_date >= ${criteria.today}::date
        ORDER BY key_id, next_action_date ASC, source_id ASC),
      f AS (
        SELECT k.key_id,
               li.source_type AS li_source_type, li.source_id AS li_source_id, li.source_code AS li_source_code,
               li.occurred_at AS li_occurred_at, li.type_label AS li_type_label, li.summary AS li_summary,
               na.source_type AS na_source_type, na.source_id AS na_source_id, na.source_code AS na_source_code,
               (na.key_id IS NULL AND li.next_action IS NOT NULL AND btrim(li.next_action) <> '' AND li.next_action_date IS NULL) AS uses_fallback,
               COALESCE(na.next_action, CASE WHEN li.next_action IS NOT NULL AND btrim(li.next_action) <> '' AND li.next_action_date IS NULL THEN li.next_action END) AS next_action,
               na.next_action_date AS next_action_date,
               COALESCE(na.owner_id, li.owner_id) AS responsible_id
        FROM (SELECT DISTINCT key_id FROM keyed) k
        LEFT JOIN last_i li ON li.key_id = k.key_id
        LEFT JOIN next_a na ON na.key_id = k.key_id)`;

    const filters: Prisma.Sql[] = [];
    if (criteria.responsibleIds.length > 0) filters.push(uuidInSql(Prisma.sql`f.responsible_id`, criteria.responsibleIds));
    if (criteria.countryIds.length > 0) filters.push(uuidInSql(Prisma.sql`kc.country_id`, criteria.countryIds));
    if (criteria.withoutNextAction) filters.push(Prisma.sql`f.next_action IS NULL`);
    if (criteria.lastInteractionFrom) filters.push(Prisma.sql`f.li_occurred_at >= ${timestampSql(criteria.lastInteractionFrom)}`);
    if (criteria.lastInteractionTo) filters.push(Prisma.sql`f.li_occurred_at <= ${timestampSql(criteria.lastInteractionTo)}`);
    const where = andSql(filters);
    const direction = criteria.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderBy = Prisma.raw(`${FOLLOW_UP_SORT[criteria.sortBy]} ${direction} NULLS LAST, kc.legal_name_normalized ASC, f.key_id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;

    const attachmentCount = Prisma.sql`(SELECT COUNT(*)::int FROM attachments att
      WHERE att.deleted_at IS NULL AND (
        att.visit_id IN (SELECT k2.source_id FROM keyed k2 WHERE k2.key_id = f.key_id AND k2.source_type = 'VISIT')
        OR att.activity_id IN (SELECT k2.source_id FROM keyed k2 WHERE k2.key_id = f.key_id AND k2.source_type = 'ACTIVITY')
        OR att.visit_event_id IN (
          SELECT ve.id FROM visit_events ve JOIN keyed k2 ON k2.source_id = ve.visit_id AND k2.source_type = 'VISIT'
          WHERE k2.key_id = f.key_id)))`;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<FollowUpRow[]>`
        ${withClause}
        SELECT f.*, kc.id AS customer_id, kc.crm_code AS customer_crm_code, kc.legal_name AS customer_legal_name,
               kp.id AS project_id, kp.code AS project_code, kp.name AS project_name,
               ru.display_name AS responsible_name,
               ${attachmentCount} AS attachment_count
        FROM f ${keyJoin}
        LEFT JOIN users ru ON ru.id = f.responsible_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        ${withClause}
        SELECT COUNT(*)::int AS total FROM f ${keyJoin} WHERE ${where}`,
    ]);
    return createPage(rows.map(toFollowUp), totals[0]?.total ?? 0, criteria);
  }

  async listAttachments(
    filter: { readonly customerId: string | null; readonly projectId: string | null },
    visibility: SourceVisibility,
    limit: number,
  ): Promise<TraceAttachmentRecord[]> {
    const branches: Prisma.Sql[] = [];
    const scope = (record: string): Prisma.Sql[] => {
      const r = Prisma.raw(record);
      const conditions: Prisma.Sql[] = [];
      if (filter.customerId) conditions.push(Prisma.sql`${r}.customer_id = ${filter.customerId}::uuid`);
      if (filter.projectId) conditions.push(Prisma.sql`${r}.project_id = ${filter.projectId}::uuid`);
      return conditions;
    };
    if (visibility.visits) {
      branches.push(andSql([Prisma.sql`v.id IS NOT NULL`, commercialVisibilitySql('v', 'vc', visibility.visits), ...scope('v')]));
    }
    if (visibility.activities) {
      branches.push(andSql([Prisma.sql`a.id IS NOT NULL`, commercialVisibilitySql('a', 'ac', visibility.activities), ...scope('a')]));
    }
    if (branches.length === 0) return [];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        file_name: string;
        mime_type: string;
        size_bytes: number;
        description: string | null;
        created_at: Date;
        created_by_id: string | null;
        created_by_name: string | null;
        owner_type: 'VISIT' | 'VISIT_EVENT' | 'ACTIVITY';
        source_id: string;
        source_code: string;
        event_id: string | null;
      }[]
    >`
      SELECT att.id, sf.file_name, sf.mime_type, sf.size_bytes, att.description, att.created_at,
             cu.id AS created_by_id, cu.display_name AS created_by_name,
             (CASE WHEN att.visit_id IS NOT NULL THEN 'VISIT' WHEN att.visit_event_id IS NOT NULL THEN 'VISIT_EVENT' ELSE 'ACTIVITY' END) AS owner_type,
             COALESCE(v.id, a.id) AS source_id, COALESCE(v.code, a.code) AS source_code, att.visit_event_id AS event_id
      FROM attachments att
      JOIN stored_files sf ON sf.id = att.stored_file_id AND sf.deleted_at IS NULL
      LEFT JOIN visit_events ve ON ve.id = att.visit_event_id
      LEFT JOIN visits v ON v.id = COALESCE(att.visit_id, ve.visit_id)
      LEFT JOIN customers vc ON vc.id = v.customer_id
      LEFT JOIN activities a ON a.id = att.activity_id AND a.deleted_at IS NULL
      LEFT JOIN customers ac ON ac.id = a.customer_id
      LEFT JOIN users cu ON cu.id = att.created_by_id
      WHERE att.deleted_at IS NULL AND (att.visit_id IS NOT NULL OR att.visit_event_id IS NOT NULL OR att.activity_id IS NOT NULL)
        AND ${orSql(branches)}
      ORDER BY att.created_at DESC, att.id ASC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      contentType: row.mime_type,
      sizeBytes: row.size_bytes,
      description: row.description,
      createdAt: row.created_at,
      createdBy: row.created_by_id && row.created_by_name !== null ? { id: row.created_by_id, displayName: row.created_by_name } : null,
      ownerType: row.owner_type,
      sourceId: row.source_id,
      sourceCode: row.source_code,
      eventId: row.event_id,
    }));
  }

  /**
   * Visitas y actividades no eliminadas visibles del cliente/proyecto, con su marca de
   * interacción. Cada rama nombra sus columnas: puede ir sola (actor con un solo permiso de ver).
   */
  private sourcesSql(filter: { customerId: string | null; projectId: string | null }, visibility: SourceVisibility): Prisma.Sql | null {
    const branches: Prisma.Sql[] = [];
    const scope = (record: string): Prisma.Sql[] => {
      const r = Prisma.raw(record);
      const conditions: Prisma.Sql[] = [];
      if (filter.customerId) conditions.push(Prisma.sql`${r}.customer_id = ${filter.customerId}::uuid`);
      if (filter.projectId) conditions.push(Prisma.sql`${r}.project_id = ${filter.projectId}::uuid`);
      return conditions;
    };
    if (visibility.visits) {
      branches.push(Prisma.sql`
        SELECT 'VISIT'::text AS source_type, v.id AS source_id, v.code::text AS source_code, v.customer_id, v.project_id, v.owner_id,
               v.next_action, v.next_action_date, ${VISIT_IS_INTERACTION} AS is_interaction,
               COALESCE(v.actual_start_at, v.scheduled_start_at) AS occurred_at,
               COALESCE(v.confirmation_summary, v.result_summary)::text AS summary, NULL::text AS type_label
        FROM visits v JOIN customers c ON c.id = v.customer_id JOIN catalog_items s ON s.id = v.status_id
        WHERE ${andSql([commercialVisibilitySql('v', 'c', visibility.visits), ...scope('v')])}`);
    }
    if (visibility.activities) {
      branches.push(Prisma.sql`
        SELECT 'ACTIVITY'::text AS source_type, a.id AS source_id, a.code::text AS source_code, a.customer_id, a.project_id, a.owner_id,
               a.next_action, a.next_action_date, ${ACTIVITY_IS_INTERACTION} AS is_interaction,
               COALESCE(a.completed_at, a.scheduled_at, a.due_at) AS occurred_at,
               COALESCE(a.summary, a.result_notes)::text AS summary, t.label::text AS type_label
        FROM activities a JOIN customers c ON c.id = a.customer_id
        JOIN catalog_items s ON s.id = a.status_id JOIN catalog_items t ON t.id = a.type_id
        WHERE ${andSql([Prisma.sql`a.deleted_at IS NULL`, commercialVisibilitySql('a', 'c', visibility.activities), ...scope('a')])}`);
    }
    return branches.length === 0 ? null : Prisma.join(branches, ' UNION ALL ');
  }
}
