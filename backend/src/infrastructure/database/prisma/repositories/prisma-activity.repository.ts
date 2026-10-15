import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { ActivityDueBucket } from '@/modules/commercial-activity/activity-due-status';
import type { CatalogMetadata } from '@/modules/commercial-activity/catalog-state';
import type {
  ActivityListRecord,
  ActivityPatch,
  ActivityRecord,
  ActivityRepository,
  ActivitySearchCriteria,
  ActivitySortField,
  CatalogValueRecord,
  CreateActivityInput,
  ParticipantRecord,
  ParticipantWrite,
  PendingActivityRecord,
  PendingCounts,
  PendingCriteria,
} from '@/modules/commercial-activity/ports/activity.repository.port';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql, orSql, uuidInSql } from '../sql-text';

import { activityVisibilityWhere, commercialVisibilitySql } from './prisma-commercial-visibility';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATALOG_SELECT = { id: true, code: true, label: true, isActive: true, metadata: true } as const;

const ACTIVITY_INCLUDE = {
  type: { select: CATALOG_SELECT },
  status: { select: CATALOG_SELECT },
  priority: { select: CATALOG_SELECT },
  result: { select: CATALOG_SELECT },
  customer: { select: { id: true, crmCode: true, legalName: true, countryId: true } },
  project: { select: { id: true, code: true, name: true, deletedAt: true } },
  opportunity: { select: { id: true, code: true, deletedAt: true } },
  owner: { select: { id: true, displayName: true } },
  completedBy: { select: { id: true, displayName: true } },
  participants: {
    include: {
      contact: { select: { firstName: true, lastName: true } },
      user: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  _count: { select: { attachments: { where: { deletedAt: null } } } },
} satisfies Prisma.ActivityInclude;

type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;
type CatalogRow = { id: string; code: string; label: string; isActive: boolean; metadata: Prisma.JsonValue };

function toMetadata(value: Prisma.JsonValue | null): CatalogMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toCatalogValue(row: CatalogRow): CatalogValueRecord {
  return { id: row.id, code: row.code, label: row.label, isActive: row.isActive, metadata: toMetadata(row.metadata) };
}

function toParticipant(row: ActivityRow['participants'][number]): ParticipantRecord {
  const kind = row.contactId ? 'CONTACT' : row.userId ? 'USER' : 'EXTERNAL';
  const displayName =
    kind === 'CONTACT' && row.contact
      ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
      : kind === 'USER' && row.user
        ? row.user.displayName
        : (row.externalName ?? '');
  return {
    id: row.id,
    role: row.role,
    kind,
    contactId: row.contactId,
    userId: row.userId,
    externalName: row.externalName,
    displayName,
  };
}

const KIND_ORDER: Readonly<Record<ParticipantRecord['kind'], number>> = { CONTACT: 0, USER: 1, EXTERNAL: 2 };

/**
 * Orden estable de presentación: contactos, usuarios y externos, por nombre. Los
 * participantes de una misma petición comparten `created_at` (una sola inserción).
 */
function compareParticipants(a: ParticipantRecord, b: ParticipantRecord): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
}

function toActivityRecord(row: ActivityRow, names: ReadonlyMap<string, string>): ActivityRecord {
  const userRef = (id: string | null): { id: string; displayName: string } | null => {
    const displayName = id ? names.get(id) : undefined;
    return id && displayName !== undefined ? { id, displayName } : null;
  };
  return {
    id: row.id,
    code: row.code,
    subject: row.subject,
    description: row.description,
    type: toCatalogValue(row.type),
    status: toCatalogValue(row.status),
    priority: toCatalogValue(row.priority),
    result: row.result ? toCatalogValue(row.result) : null,
    customer: row.customer,
    project: row.project ? { id: row.project.id, code: row.project.code, name: row.project.name, isDeleted: row.project.deletedAt !== null } : null,
    opportunity: row.opportunity ? { id: row.opportunity.id, code: row.opportunity.code, isDeleted: row.opportunity.deletedAt !== null } : null,
    owner: row.owner,
    scheduledAt: row.scheduledAt,
    dueAt: row.dueAt,
    durationMinutes: row.durationMinutes,
    summary: row.summary,
    resultNotes: row.resultNotes,
    nextAction: row.nextAction,
    nextActionDate: row.nextActionDate,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    completionComment: row.completionComment,
    cancelledAt: row.cancelledAt,
    participants: row.participants.map(toParticipant).sort(compareParticipants),
    attachmentCount: row._count.attachments,
    createdAt: row.createdAt,
    createdBy: userRef(row.createdById),
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedById),
  };
}

/** Columna de orden de cada campo de la lista blanca (F.2). Solo SQL fijo. */
const SORT_COLUMNS: Readonly<Record<ActivitySortField, string>> = {
  scheduledAt: 'a.scheduled_at',
  dueAt: 'a.due_at',
  code: 'a.code',
  priority: 'priority_weight',
  customerName: 'c.legal_name_normalized',
  ownerName: 'lower(u.display_name)',
  status: 's.label',
};

/** `metadata.weight` de `crm.prioridad` (RN-04.32); 0 si falta o no es número. Alias `pr`; exportado para Reportes (05 E.6). */
export const PRIORITY_WEIGHT_SQL = Prisma.sql`CASE WHEN jsonb_typeof(pr.metadata -> 'weight') = 'number' THEN (pr.metadata ->> 'weight')::numeric ELSE 0 END`;
const IS_OPEN_SQL = Prisma.sql`(s.metadata ->> 'isOpen') = 'true'`;

interface ActivityListRow {
  id: string;
  code: string;
  subject: string;
  scheduled_at: Date | null;
  due_at: Date | null;
  customer_id: string;
  customer_crm_code: string;
  customer_legal_name: string;
  customer_country_id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  opportunity_id: string | null;
  opportunity_code: string | null;
  owner_id: string;
  owner_name: string;
  type_id: string;
  type_code: string;
  type_label: string;
  type_is_active: boolean;
  type_metadata: Prisma.JsonValue;
  status_id: string;
  status_code: string;
  status_label: string;
  status_is_active: boolean;
  status_metadata: Prisma.JsonValue;
  priority_id: string;
  priority_code: string;
  priority_label: string;
  priority_is_active: boolean;
  priority_metadata: Prisma.JsonValue;
  result_id: string | null;
  result_code: string | null;
  result_label: string | null;
  attachment_count: number;
  bucket?: ActivityDueBucket;
}

/** Proyección común del listado y la bandeja (`a` actividad, `c` cliente, `s` estado, `pr` prioridad). */
const LIST_SELECT = Prisma.sql`
  a.id, a.code, a.subject, a.scheduled_at, a.due_at,
  c.id AS customer_id, c.crm_code AS customer_crm_code, c.legal_name AS customer_legal_name, c.country_id AS customer_country_id,
  p.id AS project_id, p.code AS project_code, p.name AS project_name,
  o.id AS opportunity_id, o.code AS opportunity_code,
  u.id AS owner_id, u.display_name AS owner_name,
  t.id AS type_id, t.code AS type_code, t.label AS type_label, t.is_active AS type_is_active, t.metadata AS type_metadata,
  s.id AS status_id, s.code AS status_code, s.label AS status_label, s.is_active AS status_is_active, s.metadata AS status_metadata,
  pr.id AS priority_id, pr.code AS priority_code, pr.label AS priority_label, pr.is_active AS priority_is_active, pr.metadata AS priority_metadata,
  r.id AS result_id, r.code AS result_code, r.label AS result_label,
  (SELECT COUNT(*)::int FROM attachments att WHERE att.activity_id = a.id AND att.deleted_at IS NULL) AS attachment_count,
  ${PRIORITY_WEIGHT_SQL} AS priority_weight`;

const LIST_FROM = Prisma.sql`
  FROM activities a
  JOIN customers c ON c.id = a.customer_id
  JOIN users u ON u.id = a.owner_id
  JOIN catalog_items t ON t.id = a.type_id
  JOIN catalog_items s ON s.id = a.status_id
  JOIN catalog_items pr ON pr.id = a.priority_id
  LEFT JOIN catalog_items r ON r.id = a.result_id
  LEFT JOIN projects p ON p.id = a.project_id
  LEFT JOIN opportunities o ON o.id = a.opportunity_id`;

function toListRecord(row: ActivityListRow): ActivityListRecord {
  return {
    id: row.id,
    code: row.code,
    subject: row.subject,
    type: { id: row.type_id, code: row.type_code, label: row.type_label, isActive: row.type_is_active, metadata: toMetadata(row.type_metadata) },
    status: {
      id: row.status_id,
      code: row.status_code,
      label: row.status_label,
      isActive: row.status_is_active,
      metadata: toMetadata(row.status_metadata),
    },
    priority: {
      id: row.priority_id,
      code: row.priority_code,
      label: row.priority_label,
      isActive: row.priority_is_active,
      metadata: toMetadata(row.priority_metadata),
    },
    result: row.result_id && row.result_code !== null && row.result_label !== null ? { id: row.result_id, code: row.result_code, label: row.result_label } : null,
    customer: { id: row.customer_id, crmCode: row.customer_crm_code, legalName: row.customer_legal_name, countryId: row.customer_country_id },
    project:
      row.project_id && row.project_code !== null && row.project_name !== null
        ? { id: row.project_id, code: row.project_code, name: row.project_name }
        : null,
    opportunity: row.opportunity_id && row.opportunity_code !== null ? { id: row.opportunity_id, code: row.opportunity_code } : null,
    owner: { id: row.owner_id, displayName: row.owner_name },
    scheduledAt: row.scheduled_at,
    dueAt: row.due_at,
    attachmentCount: row.attachment_count,
  };
}

/** Instante como parámetro `timestamptz` explícito (texto ISO 8601 UTC): sin depender de la zona de la sesión. */
function timestampSql(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamptz`;
}

function contains(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

function prefix(value: string): string {
  return `${escapeLikePattern(value)}%`;
}

/** Grupo de la bandeja en SQL: misma regla que `activityDueBucket` (RN-04.31). */
function bucketSql(now: Date, dueSoonUntil: Date): Prisma.Sql {
  return Prisma.sql`(CASE
    WHEN a.due_at IS NULL THEN 'PENDING'
    WHEN a.due_at < ${timestampSql(now)} THEN 'OVERDUE'
    WHEN a.due_at <= ${timestampSql(dueSoonUntil)} THEN 'DUE_SOON'
    ELSE 'PENDING' END)`;
}

/**
 * Adaptador Prisma de actividades (04 F.6, ADR-004). Sin reglas de negocio: aplica
 * la visibilidad recibida y escribe lo que el servicio ya validó. Los listados son
 * SQL parametrizado (plantillas, nunca concatenación) porque ordenan por
 * semántica de catálogo (`metadata.weight`) y texto normalizado.
 */
@Injectable()
export class PrismaActivityRepository implements ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(activityId: string, visibility: CommercialVisibility | null, tx?: TransactionContext): Promise<ActivityRecord | null> {
    if (!UUID_PATTERN.test(activityId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    const row = await db.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...(visibility ? activityVisibilityWhere(visibility) : {}) },
      include: ACTIVITY_INCLUDE,
    });
    if (!row) return null;
    const userIds = [row.createdById, row.updatedById].filter((id): id is string => id !== null);
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }) : [];
    return toActivityRecord(row, new Map(users.map((user) => [user.id, user.displayName])));
  }

  async search(criteria: ActivitySearchCriteria, visibility: CommercialVisibility): Promise<Page<ActivityListRecord>> {
    const where = andSql(this.searchConditions(criteria, visibility));
    const direction = criteria.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = Prisma.raw(`${SORT_COLUMNS[criteria.sortBy]} ${direction} NULLS LAST, a.code ASC, a.id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<ActivityListRow[]>`
        SELECT ${LIST_SELECT} ${LIST_FROM}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${LIST_FROM} WHERE ${where}`,
    ]);
    return createPage(rows.map(toListRecord), totals[0]?.total ?? 0, criteria);
  }

  private searchConditions(criteria: ActivitySearchCriteria, visibility: CommercialVisibility): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`a.deleted_at IS NULL`, commercialVisibilitySql('a', 'c', visibility)];
    const ids = (column: Prisma.Sql, values: readonly string[]): void => {
      if (values.length > 0) conditions.push(uuidInSql(column, values));
    };
    ids(Prisma.sql`a.type_id`, criteria.typeIds);
    ids(Prisma.sql`a.status_id`, criteria.statusIds);
    ids(Prisma.sql`a.priority_id`, criteria.priorityIds);
    ids(Prisma.sql`a.owner_id`, criteria.ownerIds);
    if (criteria.customerId) conditions.push(Prisma.sql`a.customer_id = ${criteria.customerId}::uuid`);
    if (criteria.projectId) conditions.push(Prisma.sql`a.project_id = ${criteria.projectId}::uuid`);
    if (criteria.opportunityId) conditions.push(Prisma.sql`a.opportunity_id = ${criteria.opportunityId}::uuid`);
    if (criteria.countryId) conditions.push(Prisma.sql`c.country_id = ${criteria.countryId}::uuid`);
    if (criteria.scheduledFrom) conditions.push(Prisma.sql`a.scheduled_at >= ${timestampSql(criteria.scheduledFrom)}`);
    if (criteria.scheduledTo) conditions.push(Prisma.sql`a.scheduled_at <= ${timestampSql(criteria.scheduledTo)}`);
    if (criteria.dueFrom) conditions.push(Prisma.sql`a.due_at >= ${timestampSql(criteria.dueFrom)}`);
    if (criteria.dueTo) conditions.push(Prisma.sql`a.due_at <= ${timestampSql(criteria.dueTo)}`);
    if (criteria.overdueAt) conditions.push(Prisma.sql`${IS_OPEN_SQL} AND a.due_at < ${timestampSql(criteria.overdueAt)}`);

    const search: Prisma.Sql[] = [];
    if (criteria.searchCodePrefix) search.push(Prisma.sql`a.code ILIKE ${prefix(criteria.searchCodePrefix)}`);
    if (criteria.searchTerms.length > 0) {
      const subject = normalizedTextSql(Prisma.sql`a.subject`);
      search.push(
        andSql(
          criteria.searchTerms.map((term) => Prisma.sql`(${subject} LIKE ${contains(term)} OR c.legal_name_normalized LIKE ${contains(term)})`),
        ),
      );
    }
    if (search.length > 0) conditions.push(orSql(search));
    return conditions;
  }

  async listPending(
    criteria: PendingCriteria,
    visibility: CommercialVisibility,
  ): Promise<{ page: Page<PendingActivityRecord>; counts: PendingCounts }> {
    const conditions: Prisma.Sql[] = [Prisma.sql`a.deleted_at IS NULL`, IS_OPEN_SQL, commercialVisibilitySql('a', 'c', visibility)];
    if (criteria.ownerIds.length > 0) conditions.push(uuidInSql(Prisma.sql`a.owner_id`, criteria.ownerIds));
    if (criteria.typeIds.length > 0) conditions.push(uuidInSql(Prisma.sql`a.type_id`, criteria.typeIds));
    if (criteria.priorityIds.length > 0) conditions.push(uuidInSql(Prisma.sql`a.priority_id`, criteria.priorityIds));
    if (criteria.customerId) conditions.push(Prisma.sql`a.customer_id = ${criteria.customerId}::uuid`);
    const base = andSql(conditions);
    const bucket = bucketSql(criteria.now, criteria.dueSoonUntil);
    const withBucket =
      criteria.buckets.length > 0 ? Prisma.sql`${base} AND ${bucket} IN (${Prisma.join([...criteria.buckets])})` : base;
    const orderBy =
      criteria.sortBy === 'dueAt'
        ? Prisma.raw(`a.due_at ${criteria.sortOrder === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, priority_weight DESC, a.code ASC, a.id ASC`)
        : // RN-04.32: peso desc, vencimiento asc (nulos al final), programada asc, código.
          Prisma.raw('priority_weight DESC, a.due_at ASC NULLS LAST, a.scheduled_at ASC NULLS LAST, a.code ASC, a.id ASC');
    const offset = (criteria.page - 1) * criteria.pageSize;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<(ActivityListRow & { bucket: ActivityDueBucket })[]>`
        SELECT ${LIST_SELECT}, ${bucket} AS bucket ${LIST_FROM}
        WHERE ${withBucket}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ overdue: number; due_soon: number; pending: number; total: number }[]>`
        SELECT COUNT(*) FILTER (WHERE bucket = 'OVERDUE')::int AS overdue,
               COUNT(*) FILTER (WHERE bucket = 'DUE_SOON')::int AS due_soon,
               COUNT(*) FILTER (WHERE bucket = 'PENDING')::int AS pending,
               COUNT(*)::int AS total
        FROM (SELECT ${bucket} AS bucket ${LIST_FROM} WHERE ${base}) counted`,
    ]);
    const totalsRow = totals[0] ?? { overdue: 0, due_soon: 0, pending: 0, total: 0 };
    const counts: PendingCounts = { overdue: totalsRow.overdue, dueSoon: totalsRow.due_soon, pending: totalsRow.pending, total: totalsRow.total };
    const byBucket: Record<ActivityDueBucket, number> = { OVERDUE: counts.overdue, DUE_SOON: counts.dueSoon, PENDING: counts.pending };
    const totalItems = criteria.buckets.length > 0 ? criteria.buckets.reduce((sum, item) => sum + byBucket[item], 0) : counts.total;
    return {
      page: createPage(
        rows.map((row) => ({ ...toListRecord(row), bucket: row.bucket })),
        totalItems,
        criteria,
      ),
      counts,
    };
  }

  async create(input: CreateActivityInput, tx: TransactionContext): Promise<string> {
    const db = prismaClientFor(this.prisma, tx);
    const { participants, createdById, ...fields } = input;
    const created = await db.activity.create({ data: { ...fields, createdById, updatedById: createdById }, select: { id: true } });
    await this.insertParticipants(created.id, input.customerId, participants, createdById, tx);
    return created.id;
  }

  async update(activityId: string, expectedStatusId: string, patch: ActivityPatch, tx: TransactionContext): Promise<boolean> {
    const db = prismaClientFor(this.prisma, tx);
    const result = await db.activity.updateMany({ where: { id: activityId, statusId: expectedStatusId, deletedAt: null }, data: patch });
    return result.count === 1;
  }

  async deleteParticipants(activityId: string, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).interactionParticipant.deleteMany({ where: { activityId } });
  }

  async insertParticipants(
    activityId: string,
    customerId: string,
    participants: readonly ParticipantWrite[],
    createdById: string | null,
    tx: TransactionContext,
  ): Promise<void> {
    if (participants.length === 0) return;
    await prismaClientFor(this.prisma, tx).interactionParticipant.createMany({
      data: participants.map((participant) => ({
        activityId,
        customerId,
        role: participant.role,
        contactId: participant.contactId,
        userId: participant.userId,
        externalName: participant.externalName,
        createdById,
      })),
    });
  }
}
