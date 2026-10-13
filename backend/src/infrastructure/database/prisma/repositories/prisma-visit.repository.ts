import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { CatalogMetadata } from '@/modules/commercial-activity/catalog-state';
import type {
  CatalogValueRecord,
  ParticipantRecord,
  ParticipantRole,
  ParticipantWrite,
} from '@/modules/commercial-activity/ports/activity.repository.port';
import type { CommercialVisibility } from '@/modules/commercial-activity/ports/commercial-visibility';
import type {
  CreateVisitInput,
  ScheduleCandidateQuery,
  ScheduleCandidateRecord,
  VisitEventRecord,
  VisitEventRef,
  VisitEventWrite,
  VisitListRecord,
  VisitPatch,
  VisitRecord,
  VisitRepository,
  VisitSearchCriteria,
  VisitSortField,
  VisitWriteCondition,
} from '@/modules/commercial-activity/ports/visit.repository.port';
import type { VisitStatusGroup } from '@/modules/commercial-activity/visit-lifecycle';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, normalizedTextSql, orSql, uuidInSql } from '../sql-text';

import { commercialVisibilitySql } from './prisma-commercial-visibility';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Espacio de nombres del bloqueo consultivo de agenda (RN-04.14): `hashtext` del prefijo + usuario. */
const SCHEDULE_LOCK_PREFIX = 'crm.visit.schedule:';

const CATALOG_SELECT = { id: true, code: true, label: true, isActive: true, metadata: true } as const;
const USER_SELECT = { id: true, displayName: true } as const;

const VISIT_INCLUDE = {
  status: { select: CATALOG_SELECT },
  result: { select: CATALOG_SELECT },
  customer: { select: { id: true, crmCode: true, legalName: true, countryId: true } },
  project: { select: { id: true, code: true, name: true, deletedAt: true } },
  owner: { select: USER_SELECT },
  completionRecordedBy: { select: USER_SELECT },
  confirmedBy: { select: USER_SELECT },
  participants: {
    include: {
      contact: { select: { firstName: true, lastName: true } },
      user: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  _count: { select: { attachments: { where: { deletedAt: null } } } },
} satisfies Prisma.VisitInclude;

type VisitRow = Prisma.VisitGetPayload<{ include: typeof VISIT_INCLUDE }>;
type CatalogRow = { id: string; code: string; label: string; isActive: boolean; metadata: Prisma.JsonValue };

function toMetadata(value: Prisma.JsonValue | null): CatalogMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toCatalogValue(row: CatalogRow): CatalogValueRecord {
  return { id: row.id, code: row.code, label: row.label, isActive: row.isActive, metadata: toMetadata(row.metadata) };
}

const KIND_ORDER: Readonly<Record<ParticipantRecord['kind'], number>> = { CONTACT: 0, USER: 1, EXTERNAL: 2 };
const ROLE_ORDER: Readonly<Record<ParticipantRecord['role'], number>> = { INVITED: 0, ATTENDED: 1 };

function toParticipant(row: VisitRow['participants'][number]): ParticipantRecord {
  const kind = row.contactId ? 'CONTACT' : row.userId ? 'USER' : 'EXTERNAL';
  const displayName =
    kind === 'CONTACT' && row.contact
      ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
      : kind === 'USER' && row.user
        ? row.user.displayName
        : (row.externalName ?? '');
  return { id: row.id, role: row.role, kind, contactId: row.contactId, userId: row.userId, externalName: row.externalName, displayName };
}

/** Invitados y después asistentes; dentro de cada rol, contactos, usuarios y externos por nombre. */
function compareParticipants(a: ParticipantRecord, b: ParticipantRecord): number {
  return (
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.displayName.localeCompare(b.displayName) ||
    a.id.localeCompare(b.id)
  );
}

function toVisitRecord(row: VisitRow, names: ReadonlyMap<string, string>): VisitRecord {
  const userRef = (id: string | null): { id: string; displayName: string } | null => {
    const displayName = id ? names.get(id) : undefined;
    return id && displayName !== undefined ? { id, displayName } : null;
  };
  return {
    id: row.id,
    code: row.code,
    customer: row.customer,
    project: row.project ? { id: row.project.id, code: row.project.code, name: row.project.name, isDeleted: row.project.deletedAt !== null } : null,
    owner: row.owner,
    status: toCatalogValue(row.status),
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    originalScheduledAt: row.originalScheduledAt,
    rescheduleCount: row.rescheduleCount,
    objective: row.objective,
    location: row.location,
    reminderMinutesBefore: row.reminderMinutesBefore,
    actualStartAt: row.actualStartAt,
    actualEndAt: row.actualEndAt,
    topics: row.topics,
    agreements: row.agreements,
    result: row.result ? toCatalogValue(row.result) : null,
    resultSummary: row.resultSummary,
    comments: row.comments,
    nextAction: row.nextAction,
    nextActionDate: row.nextActionDate,
    completionRecordedBy: row.completionRecordedBy,
    completionRecordedAt: row.completionRecordedAt,
    confirmedAt: row.confirmedAt,
    confirmedBy: row.confirmedBy,
    confirmationSummary: row.confirmationSummary,
    cancelledAt: row.cancelledAt,
    participants: row.participants.map(toParticipant).sort(compareParticipants),
    attachmentCount: row._count.attachments,
    createdAt: row.createdAt,
    createdBy: userRef(row.createdById),
    updatedAt: row.updatedAt,
    updatedBy: userRef(row.updatedById),
  };
}

/** Instante como parámetro `timestamptz` explícito (texto ISO 8601 UTC). */
function timestampSql(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamptz`;
}

function flagSql(alias: string, key: 'isPending' | 'isDone' | 'isConfirmed' | 'isCancelled'): Prisma.Sql {
  return Prisma.sql`(${Prisma.raw(alias)}.metadata ->> ${key}) = 'true'`;
}

/**
 * Grupo del estado de una visita en SQL (`s` = estado): misma regla que
 * `visitStatusGroup` (sin indicador válido = terminal, `CANCELLED`).
 */
export const VISIT_GROUP_SQL = Prisma.sql`(CASE
  WHEN (s.metadata ->> 'isPending') = 'true' THEN 'PENDING'
  WHEN (s.metadata ->> 'isDone') = 'true' THEN 'DONE'
  WHEN (s.metadata ->> 'isConfirmed') = 'true' THEN 'CONFIRMED'
  ELSE 'CANCELLED' END)`;

/** Fecha de agenda de una visita (RN-04.36): real si está realizada o confirmada, si no la vigente. */
export const VISIT_AGENDA_DATE_SQL = Prisma.sql`(CASE
  WHEN ((s.metadata ->> 'isDone') = 'true' OR (s.metadata ->> 'isConfirmed') = 'true') AND v.actual_start_at IS NOT NULL
  THEN v.actual_start_at ELSE v.scheduled_start_at END)`;

const SORT_COLUMNS: Readonly<Record<VisitSortField, string>> = {
  scheduledStartAt: 'v.scheduled_start_at',
  code: 'v.code',
  customerName: 'c.legal_name_normalized',
  ownerName: 'lower(u.display_name)',
  status: 's.label',
};

interface VisitListRow {
  id: string;
  code: string;
  objective: string;
  scheduled_start_at: Date;
  scheduled_end_at: Date | null;
  actual_start_at: Date | null;
  reschedule_count: number;
  reminder_minutes_before: number | null;
  customer_id: string;
  customer_crm_code: string;
  customer_legal_name: string;
  customer_country_id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  owner_id: string;
  owner_name: string;
  status_id: string;
  status_code: string;
  status_label: string;
  status_is_active: boolean;
  status_metadata: Prisma.JsonValue;
  result_id: string | null;
  result_code: string | null;
  result_label: string | null;
  attachment_count: number;
}

const LIST_SELECT = Prisma.sql`
  v.id, v.code, v.objective, v.scheduled_start_at, v.scheduled_end_at, v.actual_start_at, v.reschedule_count, v.reminder_minutes_before,
  c.id AS customer_id, c.crm_code AS customer_crm_code, c.legal_name AS customer_legal_name, c.country_id AS customer_country_id,
  p.id AS project_id, p.code AS project_code, p.name AS project_name,
  u.id AS owner_id, u.display_name AS owner_name,
  s.id AS status_id, s.code AS status_code, s.label AS status_label, s.is_active AS status_is_active, s.metadata AS status_metadata,
  r.id AS result_id, r.code AS result_code, r.label AS result_label,
  (SELECT COUNT(*)::int FROM attachments att WHERE att.visit_id = v.id AND att.deleted_at IS NULL) AS attachment_count`;

const LIST_FROM = Prisma.sql`
  FROM visits v
  JOIN customers c ON c.id = v.customer_id
  JOIN users u ON u.id = v.owner_id
  JOIN catalog_items s ON s.id = v.status_id
  LEFT JOIN catalog_items r ON r.id = v.result_id
  LEFT JOIN projects p ON p.id = v.project_id`;

function toListRecord(row: VisitListRow): VisitListRecord {
  return {
    id: row.id,
    code: row.code,
    objective: row.objective,
    customer: { id: row.customer_id, crmCode: row.customer_crm_code, legalName: row.customer_legal_name, countryId: row.customer_country_id },
    project:
      row.project_id && row.project_code !== null && row.project_name !== null
        ? { id: row.project_id, code: row.project_code, name: row.project_name }
        : null,
    owner: { id: row.owner_id, displayName: row.owner_name },
    status: { id: row.status_id, code: row.status_code, label: row.status_label, isActive: row.status_is_active, metadata: toMetadata(row.status_metadata) },
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    actualStartAt: row.actual_start_at,
    rescheduleCount: row.reschedule_count,
    reminderMinutesBefore: row.reminder_minutes_before,
    result: row.result_id && row.result_code !== null && row.result_label !== null ? { id: row.result_id, code: row.result_code, label: row.result_label } : null,
    attachmentCount: row.attachment_count,
  };
}

function contains(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

function prefix(value: string): string {
  return `${escapeLikePattern(value)}%`;
}

function groupSql(group: VisitStatusGroup): Prisma.Sql {
  switch (group) {
    case 'PENDING':
      return flagSql('s', 'isPending');
    case 'DONE':
      return Prisma.sql`(NOT ${flagSql('s', 'isPending')} AND ${flagSql('s', 'isDone')})`;
    case 'CONFIRMED':
      return Prisma.sql`(NOT ${flagSql('s', 'isPending')} AND NOT ${flagSql('s', 'isDone')} AND ${flagSql('s', 'isConfirmed')})`;
    case 'CANCELLED':
      return Prisma.sql`${VISIT_GROUP_SQL} = 'CANCELLED'`;
  }
}

/**
 * Adaptador Prisma de visitas y su historial (04 F.6, ADR-004). Sin reglas de
 * negocio: aplica la visibilidad recibida y escribe lo que el servicio ya validó.
 */
@Injectable()
export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(visitId: string, visibility: CommercialVisibility | null, tx?: TransactionContext): Promise<VisitRecord | null> {
    if (!UUID_PATTERN.test(visitId)) return null;
    const db = prismaClientFor(this.prisma, tx);
    if (visibility) {
      // Mismo predicado SQL que el listado, la agenda y las interacciones (H.3).
      const visible = await db.$queryRaw<{ id: string }[]>`
        SELECT v.id FROM visits v JOIN customers c ON c.id = v.customer_id
        WHERE v.id = ${visitId}::uuid AND ${commercialVisibilitySql('v', 'c', visibility)}`;
      if (visible.length === 0) return null;
    }
    const row = await db.visit.findUnique({ where: { id: visitId }, include: VISIT_INCLUDE });
    if (!row) return null;
    const userIds = [row.createdById, row.updatedById].filter((id): id is string => id !== null);
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: USER_SELECT }) : [];
    return toVisitRecord(row, new Map(users.map((user) => [user.id, user.displayName])));
  }

  async search(criteria: VisitSearchCriteria, visibility: CommercialVisibility): Promise<Page<VisitListRecord>> {
    const where = andSql(this.searchConditions(criteria, visibility));
    const direction = criteria.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderBy = Prisma.raw(`${SORT_COLUMNS[criteria.sortBy]} ${direction} NULLS LAST, v.code ASC, v.id ASC`);
    const offset = (criteria.page - 1) * criteria.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<VisitListRow[]>`
        SELECT ${LIST_SELECT} ${LIST_FROM}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${criteria.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${LIST_FROM} WHERE ${where}`,
    ]);
    return createPage(rows.map(toListRecord), totals[0]?.total ?? 0, criteria);
  }

  private searchConditions(criteria: VisitSearchCriteria, visibility: CommercialVisibility): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [commercialVisibilitySql('v', 'c', visibility)];
    if (criteria.statusIds.length > 0) conditions.push(uuidInSql(Prisma.sql`v.status_id`, criteria.statusIds));
    if (criteria.statusGroups.length > 0) conditions.push(orSql(criteria.statusGroups.map(groupSql)));
    if (criteria.ownerIds.length > 0) conditions.push(uuidInSql(Prisma.sql`v.owner_id`, criteria.ownerIds));
    if (criteria.customerId) conditions.push(Prisma.sql`v.customer_id = ${criteria.customerId}::uuid`);
    if (criteria.projectId) conditions.push(Prisma.sql`v.project_id = ${criteria.projectId}::uuid`);
    if (criteria.countryId) conditions.push(Prisma.sql`c.country_id = ${criteria.countryId}::uuid`);
    if (criteria.from) conditions.push(Prisma.sql`${VISIT_AGENDA_DATE_SQL} >= ${timestampSql(criteria.from)}`);
    if (criteria.to) conditions.push(Prisma.sql`${VISIT_AGENDA_DATE_SQL} <= ${timestampSql(criteria.to)}`);
    if (criteria.unregisteredAt) {
      conditions.push(Prisma.sql`${flagSql('s', 'isPending')} AND v.scheduled_start_at < ${timestampSql(criteria.unregisteredAt)}`);
    }
    if (criteria.pendingConfirmation) conditions.push(groupSql('DONE'));

    const search: Prisma.Sql[] = [];
    if (criteria.searchCodePrefix) search.push(Prisma.sql`v.code ILIKE ${prefix(criteria.searchCodePrefix)}`);
    if (criteria.searchTerms.length > 0) {
      const objective = normalizedTextSql(Prisma.sql`v.objective`);
      search.push(
        andSql(
          criteria.searchTerms.map((term) => Prisma.sql`(${objective} LIKE ${contains(term)} OR c.legal_name_normalized LIKE ${contains(term)})`),
        ),
      );
    }
    if (search.length > 0) conditions.push(orSql(search));
    return conditions;
  }

  async listEvents(visitId: string): Promise<VisitEventRecord[]> {
    if (!UUID_PATTERN.test(visitId)) return [];
    const rows = await this.prisma.visitEvent.findMany({
      where: { visitId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      include: {
        fromStatus: { select: { id: true, code: true, label: true } },
        toStatus: { select: { id: true, code: true, label: true } },
        reason: { select: { id: true, code: true, label: true } },
        performedBy: { select: USER_SELECT },
        _count: { select: { attachments: { where: { deletedAt: null } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      previousScheduledStartAt: row.previousScheduledStartAt,
      newScheduledStartAt: row.newScheduledStartAt,
      reason: row.reason,
      reasonText: row.reasonText,
      comment: row.comment,
      performedBy: row.performedBy,
      occurredAt: row.occurredAt,
      attachmentCount: row._count.attachments,
    }));
  }

  async findEvent(visitId: string, eventId: string): Promise<VisitEventRef | null> {
    if (!UUID_PATTERN.test(visitId) || !UUID_PATTERN.test(eventId)) return null;
    const row = await this.prisma.visitEvent.findFirst({
      where: { id: eventId, visitId },
      select: { id: true, visitId: true, eventType: true, performedById: true, occurredAt: true },
    });
    return row;
  }

  async lockOwnerSchedules(ownerIds: readonly string[], tx: TransactionContext): Promise<void> {
    const db = prismaClientFor(this.prisma, tx);
    for (const ownerId of [...new Set(ownerIds)].sort()) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SCHEDULE_LOCK_PREFIX + ownerId}))`;
    }
  }

  async findScheduleCandidates(
    query: ScheduleCandidateQuery,
    visibility: CommercialVisibility,
    tx?: TransactionContext,
  ): Promise<ScheduleCandidateRecord[]> {
    if (!UUID_PATTERN.test(query.ownerId)) return [];
    const db = prismaClientFor(this.prisma, tx);
    const exclude = query.excludeVisitId && UUID_PATTERN.test(query.excludeVisitId) ? Prisma.sql`AND v.id <> ${query.excludeVisitId}::uuid` : Prisma.empty;
    // Acotado con el índice (owner_id, scheduled_start_at); el solape exacto lo decide `findScheduleConflicts`.
    const rows = await db.$queryRaw<
      {
        id: string;
        code: string;
        owner_id: string;
        scheduled_start_at: Date;
        scheduled_end_at: Date | null;
        is_cancelled: boolean;
        customer_name: string;
        is_visible: boolean;
      }[]
    >`
      SELECT v.id, v.code, v.owner_id, v.scheduled_start_at, v.scheduled_end_at,
             ${VISIT_GROUP_SQL} = 'CANCELLED' AS is_cancelled,
             c.legal_name AS customer_name,
             ${commercialVisibilitySql('v', 'c', visibility)} AS is_visible
      FROM visits v
      JOIN customers c ON c.id = v.customer_id
      JOIN catalog_items s ON s.id = v.status_id
      WHERE v.owner_id = ${query.ownerId}::uuid
        AND v.scheduled_start_at < ${timestampSql(query.end)}
        AND COALESCE(v.scheduled_end_at, v.scheduled_start_at + make_interval(mins => ${query.defaultDurationMinutes}::int)) > ${timestampSql(query.start)}
        AND ${VISIT_GROUP_SQL} <> 'CANCELLED'
        ${exclude}
      ORDER BY v.scheduled_start_at ASC, v.id ASC
      LIMIT 100`;
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      ownerId: row.owner_id,
      scheduledStartAt: row.scheduled_start_at,
      scheduledEndAt: row.scheduled_end_at,
      isCancelled: row.is_cancelled,
      customerName: row.customer_name,
      isVisible: row.is_visible,
    }));
  }

  async create(input: CreateVisitInput, tx: TransactionContext): Promise<string> {
    const db = prismaClientFor(this.prisma, tx);
    const created = await db.visit.create({
      data: {
        ...input.fields,
        code: input.code,
        originalScheduledAt: input.fields.scheduledStartAt,
        rescheduleCount: 0,
        createdById: input.createdById,
        updatedById: input.createdById,
      },
      select: { id: true },
    });
    await this.insertEvent(created.id, input.plannedEvent, tx);
    await this.insertParticipantRows(created.id, input.fields.customerId, input.participants, input.createdById, tx);
    return created.id;
  }

  async update(visitId: string, condition: VisitWriteCondition, patch: VisitPatch, tx: TransactionContext): Promise<boolean> {
    const db = prismaClientFor(this.prisma, tx);
    const where: Prisma.VisitWhereInput = {
      id: visitId,
      statusId: condition.statusId,
      rescheduleCount: condition.rescheduleCount,
      ...(condition.requiresSummary ? { OR: [{ resultSummary: { not: null } }, { comments: { not: null } }] } : {}),
    };
    const result = await db.visit.updateMany({ where, data: patch });
    return result.count === 1;
  }

  async insertEvent(visitId: string, event: VisitEventWrite, tx: TransactionContext): Promise<string> {
    const created = await prismaClientFor(this.prisma, tx).visitEvent.create({ data: { visitId, ...event }, select: { id: true } });
    return created.id;
  }

  async replaceParticipants(
    visitId: string,
    customerId: string,
    role: ParticipantRole,
    participants: readonly ParticipantWrite[],
    createdById: string | null,
    tx: TransactionContext,
  ): Promise<void> {
    await prismaClientFor(this.prisma, tx).interactionParticipant.deleteMany({ where: { visitId, role } });
    await this.insertParticipantRows(
      visitId,
      customerId,
      participants.map((participant) => ({ ...participant, role })),
      createdById,
      tx,
    );
  }

  private async insertParticipantRows(
    visitId: string,
    customerId: string,
    participants: readonly ParticipantWrite[],
    createdById: string | null,
    tx: TransactionContext,
  ): Promise<void> {
    if (participants.length === 0) return;
    await prismaClientFor(this.prisma, tx).interactionParticipant.createMany({
      data: participants.map((participant) => ({
        visitId,
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
