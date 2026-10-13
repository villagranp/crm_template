import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { AgendaStatusGroup } from '@/modules/commercial-activity/agenda-status';
import type {
  AgendaFilter,
  AgendaItemRecord,
  AgendaKind,
  AgendaListCriteria,
  AgendaReadModel,
  AgendaSortField,
  SourceVisibility,
} from '@/modules/commercial-activity/ports/agenda-read-model.port';

import { PrismaService } from '../prisma.service';
import { andSql, uuidInSql } from '../sql-text';

import { commercialVisibilitySql } from './prisma-commercial-visibility';
import { VISIT_AGENDA_DATE_SQL, VISIT_GROUP_SQL } from './prisma-visit.repository';

/** Instante como parámetro `timestamptz` explícito (texto ISO 8601 UTC). */
function timestampSql(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamptz`;
}

/**
 * Grupo de una actividad en la agenda (RN-04.35), misma regla que
 * `activityAgendaGroup(activityStatusGroup(...))`: abierta vencida → `OVERDUE`;
 * abierta → `PENDING`; cancelada → `CANCELLED`; el resto (completada) → `DONE`.
 */
function activityGroupSql(now: Date): Prisma.Sql {
  return Prisma.sql`(CASE
    WHEN (s.metadata ->> 'isOpen') = 'true' THEN (CASE WHEN a.due_at IS NOT NULL AND a.due_at < ${timestampSql(now)} THEN 'OVERDUE' ELSE 'PENDING' END)
    WHEN (s.metadata ->> 'isCancelled') = 'true' THEN 'CANCELLED'
    ELSE 'DONE' END)`;
}

const ACTIVITY_AGENDA_DATE_SQL = Prisma.sql`COALESCE(a.scheduled_at, a.due_at)`;

const SORT_COLUMNS: Readonly<Record<AgendaSortField, string>> = {
  date: 'agenda.date',
  kind: 'agenda.kind',
  customerName: 'agenda.customer_sort',
  ownerName: 'lower(agenda.owner_name)',
  status: 'agenda.status_label',
};

interface AgendaRow {
  kind: AgendaKind;
  id: string;
  code: string;
  date: Date;
  end_date: Date | null;
  type_id: string | null;
  type_label: string | null;
  subject: string;
  customer_id: string;
  customer_crm_code: string;
  customer_legal_name: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  owner_id: string;
  owner_name: string;
  status_id: string;
  status_code: string;
  status_label: string;
  status_group: AgendaStatusGroup;
  is_rescheduled: boolean;
  is_unregistered: boolean;
  has_reminder: boolean;
  attachment_count: number;
}

function toRecord(row: AgendaRow): AgendaItemRecord {
  return {
    kind: row.kind,
    id: row.id,
    code: row.code,
    date: row.date,
    endDate: row.end_date,
    typeId: row.type_id,
    typeLabel: row.type_label,
    subject: row.subject,
    customer: { id: row.customer_id, crmCode: row.customer_crm_code, legalName: row.customer_legal_name },
    project:
      row.project_id && row.project_code !== null && row.project_name !== null
        ? { id: row.project_id, code: row.project_code, name: row.project_name }
        : null,
    owner: { id: row.owner_id, displayName: row.owner_name },
    status: { id: row.status_id, code: row.status_code, label: row.status_label, group: row.status_group },
    isRescheduled: row.is_rescheduled,
    isUnregistered: row.is_unregistered,
    hasReminder: row.has_reminder,
    attachmentCount: row.attachment_count,
  };
}

/** Condiciones comunes de las dos fuentes sobre su fecha y su grupo ya calculados. */
function commonConditions(filter: AgendaFilter, date: Prisma.Sql, group: Prisma.Sql, record: string, status: Prisma.Sql): Prisma.Sql[] {
  const r = Prisma.raw(record);
  const conditions: Prisma.Sql[] = [];
  if (filter.from) conditions.push(Prisma.sql`${date} >= ${timestampSql(filter.from)}`);
  if (filter.to) conditions.push(Prisma.sql`${date} <= ${timestampSql(filter.to)}`);
  if (filter.ownerIds.length > 0) conditions.push(uuidInSql(Prisma.sql`${r}.owner_id`, filter.ownerIds));
  if (filter.countryIds.length > 0) conditions.push(uuidInSql(Prisma.sql`c.country_id`, filter.countryIds));
  if (filter.statusIds.length > 0) conditions.push(uuidInSql(status, filter.statusIds));
  if (filter.statusGroups.length > 0) conditions.push(Prisma.sql`${group} IN (${Prisma.join([...filter.statusGroups])})`);
  if (filter.customerId) conditions.push(Prisma.sql`${r}.customer_id = ${filter.customerId}::uuid`);
  if (filter.projectId) conditions.push(Prisma.sql`${r}.project_id = ${filter.projectId}::uuid`);
  return conditions;
}

/** Rama de visitas (RN-04.36: una reprogramada aparece una sola vez, en su fecha vigente). */
function visitsBranch(filter: AgendaFilter, visibility: SourceVisibility): Prisma.Sql | null {
  if (!visibility.visits || !filter.kinds.includes('VISIT')) return null;
  const done = Prisma.sql`((s.metadata ->> 'isDone') = 'true' OR (s.metadata ->> 'isConfirmed') = 'true') AND v.actual_start_at IS NOT NULL`;
  const where = andSql([
    commercialVisibilitySql('v', 'c', visibility.visits),
    ...commonConditions(filter, VISIT_AGENDA_DATE_SQL, VISIT_GROUP_SQL, 'v', Prisma.sql`v.status_id`),
  ]);
  return Prisma.sql`
    SELECT 'VISIT'::text AS kind, v.id, v.code, ${VISIT_AGENDA_DATE_SQL} AS date,
           (CASE WHEN ${done} THEN v.actual_end_at
                 ELSE COALESCE(v.scheduled_end_at, v.scheduled_start_at + make_interval(mins => ${filter.defaultDurationMinutes}::int)) END) AS end_date,
           NULL::uuid AS type_id, NULL::text AS type_label, v.objective::text AS subject,
           c.id AS customer_id, c.crm_code AS customer_crm_code, c.legal_name AS customer_legal_name, c.legal_name_normalized AS customer_sort,
           p.id AS project_id, p.code AS project_code, p.name AS project_name,
           u.id AS owner_id, u.display_name AS owner_name,
           s.id AS status_id, s.code AS status_code, s.label AS status_label, ${VISIT_GROUP_SQL} AS status_group,
           ((s.metadata ->> 'isRescheduled') = 'true') AS is_rescheduled,
           (${VISIT_GROUP_SQL} = 'PENDING' AND v.scheduled_start_at < ${timestampSql(filter.now)}) AS is_unregistered,
           (v.reminder_minutes_before IS NOT NULL) AS has_reminder,
           (SELECT COUNT(*)::int FROM attachments att WHERE att.visit_id = v.id AND att.deleted_at IS NULL) AS attachment_count
    FROM visits v
    JOIN customers c ON c.id = v.customer_id
    JOIN users u ON u.id = v.owner_id
    JOIN catalog_items s ON s.id = v.status_id
    LEFT JOIN projects p ON p.id = v.project_id
    WHERE ${where}`;
}

/** Rama de actividades: no eliminadas y con `scheduled_at` o `due_at` (RN-04.36). */
function activitiesBranch(filter: AgendaFilter, visibility: SourceVisibility): Prisma.Sql | null {
  if (!visibility.activities || !filter.kinds.includes('ACTIVITY')) return null;
  const group = activityGroupSql(filter.now);
  const conditions = [
    Prisma.sql`a.deleted_at IS NULL`,
    Prisma.sql`${ACTIVITY_AGENDA_DATE_SQL} IS NOT NULL`,
    commercialVisibilitySql('a', 'c', visibility.activities),
    ...commonConditions(filter, ACTIVITY_AGENDA_DATE_SQL, group, 'a', Prisma.sql`a.status_id`),
  ];
  if (filter.activityTypeIds.length > 0) conditions.push(uuidInSql(Prisma.sql`a.type_id`, filter.activityTypeIds));
  return Prisma.sql`
    SELECT 'ACTIVITY'::text AS kind, a.id, a.code, ${ACTIVITY_AGENDA_DATE_SQL} AS date,
           (CASE WHEN a.scheduled_at IS NOT NULL AND a.duration_minutes IS NOT NULL
                 THEN a.scheduled_at + make_interval(mins => a.duration_minutes) END) AS end_date,
           a.type_id, t.label::text AS type_label, a.subject::text AS subject,
           c.id AS customer_id, c.crm_code AS customer_crm_code, c.legal_name AS customer_legal_name, c.legal_name_normalized AS customer_sort,
           p.id AS project_id, p.code AS project_code, p.name AS project_name,
           u.id AS owner_id, u.display_name AS owner_name,
           s.id AS status_id, s.code AS status_code, s.label AS status_label, ${group} AS status_group,
           FALSE AS is_rescheduled, FALSE AS is_unregistered, FALSE AS has_reminder,
           (SELECT COUNT(*)::int FROM attachments att WHERE att.activity_id = a.id AND att.deleted_at IS NULL) AS attachment_count
    FROM activities a
    JOIN customers c ON c.id = a.customer_id
    JOIN users u ON u.id = a.owner_id
    JOIN catalog_items s ON s.id = a.status_id
    JOIN catalog_items t ON t.id = a.type_id
    LEFT JOIN projects p ON p.id = a.project_id
    WHERE ${andSql(conditions)}`;
}

/**
 * Modelo de lectura de la agenda (04 F.3, F.6). Una sola consulta `UNION ALL` de las
 * dos fuentes, filtrada por el alcance de cada una (el mismo predicado que sus
 * listados), ordenada y paginada por la base: así el orden y el total no dependen de
 * mezclar páginas en memoria.
 */
@Injectable()
export class PrismaAgendaReadModel implements AgendaReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async list(criteria: AgendaListCriteria, visibility: SourceVisibility): Promise<Page<AgendaItemRecord>> {
    const union = this.union(criteria, visibility);
    if (!union) return createPage([], 0, criteria);
    const direction = criteria.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = Prisma.raw(`${SORT_COLUMNS[criteria.sortBy]} ${direction} NULLS LAST, agenda.date ASC, agenda.code ASC, agenda.id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<AgendaRow[]>`
        SELECT agenda.* FROM (${union}) agenda
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM (${union}) agenda`,
    ]);
    return createPage(rows.map(toRecord), totals[0]?.total ?? 0, criteria);
  }

  async calendar(filter: AgendaFilter, visibility: SourceVisibility, cap: number): Promise<{ items: AgendaItemRecord[]; truncated: boolean }> {
    const union = this.union(filter, visibility);
    if (!union) return { items: [], truncated: false };
    const rows = await this.prisma.$queryRaw<AgendaRow[]>`
      SELECT agenda.* FROM (${union}) agenda
      ORDER BY agenda.date ASC, agenda.code ASC, agenda.id ASC
      LIMIT ${cap + 1}`;
    return { items: rows.slice(0, cap).map(toRecord), truncated: rows.length > cap };
  }

  private union(filter: AgendaFilter, visibility: SourceVisibility): Prisma.Sql | null {
    const branches = [visitsBranch(filter, visibility), activitiesBranch(filter, visibility)].filter((branch): branch is Prisma.Sql => branch !== null);
    if (branches.length === 0) return null;
    return Prisma.join(branches, ' UNION ALL ');
  }
}
