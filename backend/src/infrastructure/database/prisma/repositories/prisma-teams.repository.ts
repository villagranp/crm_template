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
  UserTeamAssignmentInput,
  UserTeamMembershipRecord,
} from '@/modules/teams/ports/teams.repository.port';

import { ADVISORY_LOCK_KEYS, acquireAdvisoryXactLock, withAdvisoryXactLock } from '../advisory-lock';
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

const TEAM_DETAIL_SELECT = {
  ...TEAM_SELECT,
  members: {
    select: { userId: true, isPrimary: true, user: { select: { displayName: true, email: true } } },
    orderBy: { user: { displayName: 'asc' } },
  },
} satisfies Prisma.TeamSelect;

type TeamDetailRow = Prisma.TeamGetPayload<{ select: typeof TEAM_DETAIL_SELECT }>;

function toTeamDetailRecord(row: TeamDetailRow): TeamDetailRecord {
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

/**
 * Adaptador Prisma de equipos (ADR-004). Sin reglas de negocio: traduce y
 * aplica en una transacción lo que `TeamsService` ya decidió.
 */
@Injectable()
export class PrismaTeamsRepository implements TeamsRepository {
  /** Cliente global o, en la copia de `withHierarchyLock`, el de la transacción. */
  private db: Prisma.TransactionClient;
  /** `true` en la copia ligada a una transacción interactiva. */
  private transactional = false;

  constructor(private readonly prisma: PrismaService) {
    this.db = prisma;
  }

  async withHierarchyLock<T>(work: (repository: TeamsRepository) => Promise<T>): Promise<T> {
    if (this.transactional) {
      await acquireAdvisoryXactLock(this.db, ADVISORY_LOCK_KEYS.teamsHierarchy);
      return work(this);
    }
    return withAdvisoryXactLock(this.prisma, ADVISORY_LOCK_KEYS.teamsHierarchy, (tx) => {
      const scoped = new PrismaTeamsRepository(this.prisma);
      scoped.db = tx;
      scoped.transactional = true;
      return work(scoped);
    });
  }

  /** Transacción interactiva propia, o la que ya contiene a esta copia (Prisma no las anida). */
  private inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.transactional ? work(this.db) : this.prisma.$transaction(work);
  }

  /** Lecturas/escrituras en lote atómicas: por lotes fuera de una transacción, en orden dentro de ella. */
  private async atomic<P extends Prisma.PrismaPromise<unknown>[]>(
    operations: [...P],
  ): Promise<{ [K in keyof P]: Awaited<P[K]> }> {
    if (!this.transactional) {
      return (await this.prisma.$transaction(operations)) as { [K in keyof P]: Awaited<P[K]> };
    }
    const results: unknown[] = [];
    for (const operation of operations) {
      results.push(await operation);
    }
    return results as { [K in keyof P]: Awaited<P[K]> };
  }

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

    const [rows, totalItems] = await this.atomic([
      this.db.team.findMany({
        where,
        select: TEAM_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.db.team.count({ where }),
    ]);

    return createPage(rows.map(toTeamRecord), totalItems, filter);
  }

  async findById(teamId: string): Promise<TeamDetailRecord | null> {
    const row = await this.db.team.findFirst({ where: { id: teamId, deletedAt: null }, select: TEAM_DETAIL_SELECT });
    return row ? toTeamDetailRecord(row) : null;
  }

  async findManyByIds(teamIds: readonly string[]): Promise<TeamDetailRecord[]> {
    if (teamIds.length === 0) {
      return [];
    }
    const rows = await this.db.team.findMany({
      where: { id: { in: [...teamIds] }, deletedAt: null },
      select: TEAM_DETAIL_SELECT,
      orderBy: { id: 'asc' },
    });
    return rows.map(toTeamDetailRecord);
  }

  async existsByCode(code: string): Promise<boolean> {
    const count = await this.db.team.count({ where: { code: { equals: code, mode: 'insensitive' } } });
    return count > 0;
  }

  listLinks(): Promise<TeamLink[]> {
    return this.db.team.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
  }

  async findExistingUserIds(userIds: readonly string[]): Promise<string[]> {
    const users = await this.db.user.findMany({
      where: { id: { in: [...userIds] }, deletedAt: null },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async findExistingTeamIds(teamIds: readonly string[]): Promise<string[]> {
    if (teamIds.length === 0) {
      return [];
    }
    const teams = await this.db.team.findMany({
      where: { id: { in: [...teamIds] }, deletedAt: null },
      select: { id: true },
    });
    return teams.map((team) => team.id);
  }

  async listUserMemberships(userId: string): Promise<UserTeamMembershipRecord[]> {
    const rows = await this.db.teamMember.findMany({
      where: { userId, team: { deletedAt: null } },
      select: { teamId: true, isPrimary: true, team: { select: { name: true } } },
      orderBy: [{ team: { name: 'asc' } }, { teamId: 'asc' }],
    });
    return rows.map((row) => ({ teamId: row.teamId, teamName: row.team.name, isPrimary: row.isPrimary }));
  }

  async create(input: CreateTeamInput): Promise<string> {
    try {
      const team = await this.db.team.create({ data: input, select: { id: true } });
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
    await this.db.team.update({ where: { id: teamId }, data: input });
  }

  async softDelete(teamId: string): Promise<void> {
    await this.db.team.update({ where: { id: teamId }, data: { deletedAt: new Date(), isActive: false } });
  }

  async replaceMembers(
    teamId: string,
    members: readonly TeamMembershipInput[],
    clearPrimaryElsewhereFor: readonly string[],
  ): Promise<void> {
    const userIds = members.map((member) => member.userId);

    await this.inTransaction(async (tx) => {
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

  async replaceUserTeams(userId: string, teams: readonly UserTeamAssignmentInput[]): Promise<void> {
    const teamIds = teams.map((team) => team.teamId);

    await this.inTransaction(async (tx) => {
      // Mismo bloqueo de fila que `replaceMembers`: serializa con un reemplazo
      // de miembros concurrente que toque el equipo principal de este usuario.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      // Solo equipos no eliminados: ver el contrato del puerto.
      await tx.teamMember.deleteMany({ where: { userId, teamId: { notIn: teamIds }, team: { deletedAt: null } } });
      if (teams.some((team) => team.isPrimary)) {
        await tx.teamMember.updateMany({
          where: { userId, isPrimary: true, team: { deletedAt: { not: null } } },
          data: { isPrimary: false },
        });
      }

      for (const team of teams) {
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId: team.teamId, userId } },
          create: { teamId: team.teamId, userId, isPrimary: team.isPrimary },
          update: { isPrimary: team.isPrimary },
        });
      }
    });
  }
}
