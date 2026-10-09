import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ResourceConflictError } from '@/common/errors/application-error';
import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type {
  CreateTeamInput,
  ListTeamsFilter,
  TeamDetailRecord,
  TeamLink,
  TeamMembershipInput,
  TeamRecord,
  TeamsRepository,
  UpdateTeamInput,
} from '@/modules/teams/ports/teams.repository.port';

import { PrismaService } from '../prisma.service';

const UNIQUE_VIOLATION = 'P2002';

const TEAM_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  parentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: { name: true } },
  manager: { select: { id: true, displayName: true } },
  _count: { select: { members: true, children: { where: { deletedAt: null } } } },
} satisfies Prisma.TeamSelect;

type TeamRow = Prisma.TeamGetPayload<{ select: typeof TEAM_SELECT }>;

function toTeamRecord(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    manager: row.manager ? { id: row.manager.id, displayName: row.manager.displayName } : null,
    isActive: row.isActive,
    memberCount: row._count.members,
    childCount: row._count.children,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Adaptador Prisma de equipos (ADR-004). Sin reglas de negocio: traduce y
 * aplica en una transacción lo que `TeamsService` ya decidió.
 */
@Injectable()
export class PrismaTeamsRepository implements TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListTeamsFilter): Promise<Page<TeamRecord>> {
    const where: Prisma.TeamWhereInput = {
      deletedAt: null,
      ...(filter.parentId ? { parentId: filter.parentId } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.search
        ? {
            OR: [
              { code: { contains: filter.search, mode: 'insensitive' } },
              { name: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sortBy = filter.sortBy ?? 'name';
    const sortOrder = filter.sortOrder ?? 'asc';

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        select: TEAM_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.team.count({ where }),
    ]);

    return createPage(rows.map(toTeamRecord), totalItems, filter);
  }

  async findById(teamId: string): Promise<TeamDetailRecord | null> {
    const row = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: {
        ...TEAM_SELECT,
        members: {
          select: { userId: true, isPrimary: true, user: { select: { displayName: true, email: true } } },
          orderBy: { user: { displayName: 'asc' } },
        },
      },
    });
    if (!row) {
      return null;
    }

    return {
      ...toTeamRecord(row),
      members: row.members.map((member) => ({
        userId: member.userId,
        displayName: member.user.displayName,
        email: member.user.email,
        isPrimary: member.isPrimary,
      })),
    };
  }

  async existsByCode(code: string): Promise<boolean> {
    const count = await this.prisma.team.count({ where: { code: { equals: code, mode: 'insensitive' } } });
    return count > 0;
  }

  listLinks(): Promise<TeamLink[]> {
    return this.prisma.team.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
  }

  async findExistingUserIds(userIds: readonly string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] }, deletedAt: null },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async create(input: CreateTeamInput): Promise<string> {
    try {
      const team = await this.prisma.team.create({ data: input, select: { id: true } });
      return team.id;
    } catch (error) {
      // Carrera entre la comprobación del servicio y la inserción.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictError('A team with this code already exists', [{ field: 'code', issue: 'duplicated' }]);
      }
      throw error;
    }
  }

  async update(teamId: string, input: UpdateTeamInput): Promise<void> {
    await this.prisma.team.update({ where: { id: teamId }, data: input });
  }

  async softDelete(teamId: string): Promise<void> {
    await this.prisma.team.update({ where: { id: teamId }, data: { deletedAt: new Date(), isActive: false } });
  }

  async replaceMembers(
    teamId: string,
    members: readonly TeamMembershipInput[],
    clearPrimaryElsewhereFor: readonly string[],
  ): Promise<void> {
    const userIds = members.map((member) => member.userId);

    await this.prisma.$transaction(async (tx) => {
      if (clearPrimaryElsewhereFor.length > 0) {
        // Bloquea las filas de los usuarios (en orden, sin interbloqueos) para que
        // dos reemplazos concurrentes no dejen a un usuario con dos equipos
        // principales. Consulta parametrizada: sin concatenar SQL.
        const lockIds = [...clearPrimaryElsewhereFor].sort();
        await tx.$queryRaw`SELECT id FROM users WHERE id = ANY(${lockIds}::uuid[]) ORDER BY id FOR UPDATE`;
        await tx.teamMember.updateMany({
          where: { userId: { in: lockIds }, teamId: { not: teamId }, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await tx.teamMember.deleteMany({ where: { teamId, userId: { notIn: userIds } } });

      for (const member of members) {
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId, userId: member.userId } },
          create: { teamId, userId: member.userId, isPrimary: member.isPrimary },
          update: { isPrimary: member.isPrimary },
        });
      }
    });
  }
}
