import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuditRecordInput, AuditRepository } from '@/modules/audit/ports/audit.repository.port';

import { PrismaService } from '../prisma.service';

/** Adaptador Prisma de la bitácora (ADR-004). */
@Injectable()
export class PrismaAuditRepository implements AuditRepository {
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
}
