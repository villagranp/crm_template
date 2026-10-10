import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  AuditLogFilter,
  AuditLogPageRequest,
  AuditLogRecord,
  AuditQueryRepository,
} from '@/modules/audit/ports/audit-query.repository.port';
import type { AuditRecordInput, AuditRepository } from '@/modules/audit/ports/audit.repository.port';

import { PrismaService } from '../prisma.service';

function toRecord(row: AuditLog): AuditLogRecord {
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

function toWhere(filter: AuditLogFilter): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filter.event) where.event = filter.event;
  if (filter.eventPrefix) where.event = { startsWith: filter.eventPrefix };
  if (filter.subjectId) where.subjectId = filter.subjectId;
  if (filter.resourceType) where.resourceType = filter.resourceType;
  if (filter.resourceId) where.resourceId = filter.resourceId;
  if (filter.correlationId) where.correlationId = filter.correlationId;
  if (filter.occurredFrom || filter.occurredBefore) {
    where.occurredAt = {
      ...(filter.occurredFrom ? { gte: filter.occurredFrom } : {}),
      ...(filter.occurredBefore ? { lt: filter.occurredBefore } : {}),
    };
  }
  if (filter.subjectSearch) {
    where.OR = [
      { subjectEmail: { contains: filter.subjectSearch, mode: 'insensitive' } },
      { subjectId: filter.subjectSearch },
    ];
  }
  return where;
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
    const where = toWhere(filter);
    // `id` desempata: registros del mismo instante no cambian de página entre consultas.
    const orderBy: Prisma.AuditLogOrderByWithRelationInput[] = [{ [page.sortBy]: page.sortOrder }, { id: page.sortOrder }];

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return createPage(rows.map(toRecord), totalItems, page);
  }

  async findForExport(filter: AuditLogFilter, limit: number): Promise<AuditLogRecord[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: toWhere(filter),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toRecord);
  }

  async listEventNames(limit: number): Promise<string[]> {
    // GROUP BY en SQL (no `distinct` de Prisma, que deduplica en memoria).
    const groups = await this.prisma.auditLog.groupBy({ by: ['event'], orderBy: { event: 'asc' }, take: limit });
    return groups.map((group) => group.event);
  }
}
