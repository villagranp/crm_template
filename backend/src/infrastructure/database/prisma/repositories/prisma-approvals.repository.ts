import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  ApprovalDetailRecord,
  ApprovalListFilter,
  ApprovalPageRequest,
  ApprovalsRepository,
  ApprovalSummaryRecord,
  RoleRef,
} from '@/modules/approvals/ports/approvals.repository.port';

import { PrismaService } from '../prisma.service';

const PERSON = { select: { id: true, displayName: true } } as const;

type SummaryRow = Prisma.ApprovalRequestGetPayload<{
  include: { requestedBy: typeof PERSON; _count: { select: { steps: true } } };
}>;

function toSummary(row: SummaryRow): ApprovalSummaryRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    status: row.status,
    requestedBy: row.requestedBy,
    stepCount: row._count.steps,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

/** Adaptador Prisma de aprobaciones, sólo lectura (ADR-004, PLAN-ADMIN D12). */
@Injectable()
export class PrismaApprovalsRepository implements ApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ApprovalListFilter, page: ApprovalPageRequest): Promise<Page<ApprovalSummaryRecord>> {
    const where: Prisma.ApprovalRequestWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { code: { contains: filter.search, mode: 'insensitive' } },
              { title: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({
        where,
        include: { requestedBy: PERSON, _count: { select: { steps: true } } },
        orderBy: [{ [page.sortBy]: page.sortOrder }, { id: page.sortOrder }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return createPage(rows.map(toSummary), totalItems, page);
  }

  async findById(id: string): Promise<ApprovalDetailRecord | null> {
    const row = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requestedBy: PERSON,
        _count: { select: { steps: true } },
        steps: { include: { approver: PERSON }, orderBy: { sequence: 'asc' } },
      },
    });
    if (!row) {
      return null;
    }

    // `approverRoleId` no tiene relación en el esquema: los roles se resuelven aparte.
    const roleIds = [...new Set(row.steps.map((step) => step.approverRoleId).filter((roleId): roleId is string => !!roleId))];
    const roles = roleIds.length
      ? await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
      : [];
    const rolesById = new Map<string, RoleRef>(roles.map((role) => [role.id, role]));

    return {
      ...toSummary(row),
      reason: row.reason,
      payload: row.payload,
      updatedAt: row.updatedAt,
      steps: row.steps.map((step) => ({
        id: step.id,
        sequence: step.sequence,
        status: step.status,
        approver: step.approver,
        approverRole: step.approverRoleId ? (rolesById.get(step.approverRoleId) ?? null) : null,
        comment: step.comment,
        createdAt: step.createdAt,
        resolvedAt: step.resolvedAt,
      })),
    };
  }
}
