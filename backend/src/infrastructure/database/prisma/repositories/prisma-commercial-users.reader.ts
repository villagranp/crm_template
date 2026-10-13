import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { UserRefRecord } from '@/modules/commercial-activity/ports/activity.repository.port';
import type {
  CommercialUsersReader,
  OwnerOptionsSearch,
  UserScopeSet,
  UserState,
} from '@/modules/commercial-activity/ports/commercial-users.reader.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';

import { eligibleUserWhere } from './user-eligibility';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adaptador Prisma de `CommercialUsersReader` (04 RN-04.5, RN-04.6, D-04.10). */
@Injectable()
export class PrismaCommercialUsersReader implements CommercialUsersReader {
  constructor(private readonly prisma: PrismaService) {}

  async isEligibleOwner(
    userId: string,
    criteria: { readonly scope: UserScopeSet; readonly anyOfPermissions: readonly string[] },
    tx?: TransactionContext,
  ): Promise<boolean> {
    if (!UUID_PATTERN.test(userId) || criteria.anyOfPermissions.length === 0) return false;
    const user = await prismaClientFor(this.prisma, tx).user.findFirst({
      where: { id: userId, ...eligibleUserWhere(criteria.anyOfPermissions, criteria.scope, new Date()) },
      select: { id: true },
    });
    return user !== null;
  }

  async listOwnerOptions(search: OwnerOptionsSearch): Promise<Page<UserRefRecord>> {
    if (search.anyOfPermissions.length === 0) return createPage([], 0, search);
    const term = search.search?.trim();
    const ids = search.ids.filter((id) => UUID_PATTERN.test(id));
    if (search.ids.length > 0 && ids.length === 0) return createPage([], 0, search);
    const where: Prisma.UserWhereInput = {
      ...eligibleUserWhere(search.anyOfPermissions, search.scope, new Date()),
      ...(term ? { displayName: { contains: term, mode: 'insensitive' } } : {}),
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { id: true, displayName: true },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (search.page - 1) * search.pageSize,
        take: search.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return createPage(rows, totalItems, search);
  }

  async findTimeZone(userId: string): Promise<string | null> {
    if (!UUID_PATTERN.test(userId)) return null;
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
    return row?.timeZone ?? null;
  }

  async findUserStates(userIds: readonly string[], tx?: TransactionContext): Promise<UserState[]> {
    const ids = [...new Set(userIds)].filter((id) => UUID_PATTERN.test(id));
    if (ids.length === 0) return [];
    const rows = await prismaClientFor(this.prisma, tx).user.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, deletedAt: true },
    });
    return rows.map((row) => ({ id: row.id, isActive: row.status === 'ACTIVE' && row.deletedAt === null }));
  }
}
