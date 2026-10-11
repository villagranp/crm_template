import { Injectable } from '@nestjs/common';

import type { TeamScopeRecord, VisibilityScopeReader } from '@/modules/access/ports/visibility-scope.port';

import { PrismaService } from '../prisma.service';

/**
 * Adaptador de `VisibilityScopeReader` (00 §4.2). La jerarquía de equipos se
 * recorre en la base con un CTE recursivo: `UNION` (no `UNION ALL`) descarta los
 * equipos ya visitados, así que un ciclo corrupto en `parent_id` no lo hace infinito.
 */
@Injectable()
export class PrismaVisibilityScopeRepository implements VisibilityScopeReader {
  constructor(private readonly prisma: PrismaService) {}

  async findUserCountryId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { countryId: true } });
    return user?.countryId ?? null;
  }

  async findTeamScope(userId: string): Promise<TeamScopeRecord> {
    const teams = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE scope_teams AS (
        SELECT t.id
        FROM teams t
        WHERE t.deleted_at IS NULL
          AND t.is_active
          AND (
            t.manager_id = ${userId}::uuid
            OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = ${userId}::uuid)
          )
        UNION
        SELECT c.id
        FROM teams c
        JOIN scope_teams s ON c.parent_id = s.id
        WHERE c.deleted_at IS NULL AND c.is_active
      )
      SELECT id FROM scope_teams`;
    const teamIds = teams.map((team) => team.id);
    if (teamIds.length === 0) {
      return { teamIds: [], userIds: [] };
    }

    const [members, managers] = await this.prisma.$transaction([
      this.prisma.teamMember.findMany({ where: { teamId: { in: teamIds } }, select: { userId: true } }),
      this.prisma.team.findMany({ where: { id: { in: teamIds }, managerId: { not: null } }, select: { managerId: true } }),
    ]);
    const userIds = new Set<string>(members.map((member) => member.userId));
    for (const team of managers) {
      if (team.managerId) userIds.add(team.managerId);
    }
    return { teamIds, userIds: [...userIds] };
  }
}
