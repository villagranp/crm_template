import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  AuditLogFilter,
  AuditLogPageRequest,
  AuditLogRecord,
  AuditQueryRepository,
  AuditSortField,
} from '@/modules/audit/ports/audit-query.repository.port';
import type { AuditRecordInput, AuditRepository } from '@/modules/audit/ports/audit.repository.port';

import { PrismaService } from '../prisma.service';
import { andSql, escapeLikePattern, orSql } from '../sql-text';

/** Fila de `audit_logs` tal como la devuelve `$queryRaw` (columnas con alias en camelCase). */
interface AuditLogRow {
  id: string;
  occurredAt: Date;
  event: string;
  correlationId: string;
  subjectId: string | null;
  subjectEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  changes: unknown;
  metadata: unknown;
}

function toRecord(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    event: row.event,
    correlationId: row.correlationId,
    subjectId: row.subjectId,
    subjectEmail: row.subjectEmail,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    ipAddress: row.ipAddress,
    changes: row.changes,
    metadata: row.metadata,
  };
}

const SELECT_COLUMNS = Prisma.sql`
  a.id::text            AS "id",
  a.occurred_at         AS "occurredAt",
  a.event               AS "event",
  a.correlation_id      AS "correlationId",
  a.subject_id          AS "subjectId",
  a.subject_email       AS "subjectEmail",
  a.resource_type       AS "resourceType",
  a.resource_id         AS "resourceId",
  a.ip_address          AS "ipAddress",
  a.changes             AS "changes",
  a.metadata            AS "metadata"`;

/** Columnas ordenables: lista cerrada, nunca texto del usuario en `ORDER BY`. */
const SORT_COLUMNS: Record<AuditSortField, string> = {
  occurredAt: 'a.occurred_at',
  event: 'a.event',
};

/**
 * Criterios → `WHERE` parametrizado. SQL a mano (no `findMany`) porque el filtro por
 * campo es `changes ? $campo` (D-07.10), que Prisma no expresa: el nombre del campo
 * viaja como parámetro, nunca interpolado.
 */
function toWhereSql(filter: AuditLogFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filter.event) conditions.push(Prisma.sql`a.event = ${filter.event}`);
  if (filter.eventPrefix) conditions.push(Prisma.sql`a.event LIKE ${`${escapeLikePattern(filter.eventPrefix)}%`}`);
  if (filter.subjectId) conditions.push(Prisma.sql`a.subject_id = ${filter.subjectId}`);
  if (filter.resourceType) conditions.push(Prisma.sql`a.resource_type = ${filter.resourceType}`);
  if (filter.resourceId) conditions.push(Prisma.sql`a.resource_id = ${filter.resourceId}`);
  if (filter.correlationId) conditions.push(Prisma.sql`a.correlation_id = ${filter.correlationId}`);
  if (filter.changedField) conditions.push(Prisma.sql`a.changes ? ${filter.changedField}`);
  if (filter.occurredFrom) conditions.push(Prisma.sql`a.occurred_at >= ${filter.occurredFrom.toISOString()}::timestamptz`);
  if (filter.occurredBefore) conditions.push(Prisma.sql`a.occurred_at < ${filter.occurredBefore.toISOString()}::timestamptz`);
  if (filter.subjectSearch) {
    conditions.push(
      orSql([
        Prisma.sql`a.subject_email ILIKE ${`%${escapeLikePattern(filter.subjectSearch)}%`}`,
        Prisma.sql`a.subject_id = ${filter.subjectSearch}`,
      ]),
    );
  }
  return andSql(conditions);
}

/** Adaptador Prisma de la bitácora: escritura y consulta (ADR-004). */
@Injectable()
export class PrismaAuditRepository implements AuditRepository, AuditQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        event: entry.event,
        correlationId: entry.correlationId.slice(0, 64),
        subjectId: entry.subjectId,
        subjectEmail: entry.subjectEmail,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: entry.metadata ?? undefined,
      },
    });
  }

  async search(filter: AuditLogFilter, page: AuditLogPageRequest): Promise<Page<AuditLogRecord>> {
    const where = toWhereSql(filter);
    const direction = page.sortOrder === 'asc' ? 'ASC' : 'DESC';
    // `id` desempata: registros del mismo instante no cambian de página entre consultas.
    const orderBy = Prisma.raw(`${SORT_COLUMNS[page.sortBy]} ${direction}, a.id ${direction}`);

    const [rows, counted] = await this.prisma.$transaction([
      this.prisma.$queryRaw<AuditLogRow[]>`
        SELECT ${SELECT_COLUMNS} FROM audit_logs a WHERE ${where}
        ORDER BY ${orderBy} LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
      this.prisma.$queryRaw<Array<{ total: number }>>`SELECT count(*)::int AS total FROM audit_logs a WHERE ${where}`,
    ]);

    return createPage(rows.map(toRecord), counted[0]?.total ?? 0, page);
  }

  async findForExport(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]> {
    const rows = await this.prisma.$queryRaw<AuditLogRow[]>`
      SELECT ${SELECT_COLUMNS} FROM audit_logs a WHERE ${toWhereSql(filter)}
      ORDER BY a.occurred_at DESC, a.id DESC LIMIT ${limit}`;
    return rows.map(toRecord);
  }

  async listEventNames(limit: number): Promise<string[]> {
    // GROUP BY en SQL (no `distinct` de Prisma, que deduplica en memoria).
    const groups = await this.prisma.auditLog.groupBy({ by: ['event'], orderBy: { event: 'asc' }, take: limit });
    return groups.map((group) => group.event);
  }
}
