import { Inject, Injectable } from '@nestjs/common';

import {
  BusinessRuleViolationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import {
  type CreateTeamInput,
  type ListTeamsFilter,
  TEAMS_REPOSITORY,
  type TeamDetailRecord,
  type TeamMembershipInput,
  type TeamRecord,
  type TeamsRepository,
  type UpdateTeamInput,
} from './ports/teams.repository.port';
import { wouldCreateTeamCycle } from './team-hierarchy';

export const TEAM_CYCLE = 'TEAM_CYCLE';
export const HAS_CHILDREN = 'HAS_CHILDREN';
const RESOURCE_TYPE = 'team';

/** Estado auditable de un equipo: lo que cambia por PATCH. */
function auditState(team: TeamRecord): Record<string, unknown> {
  return {
    code: team.code,
    name: team.name,
    description: team.description,
    parentId: team.parentId,
    managerId: team.manager?.id ?? null,
    isActive: team.isActive,
  };
}

/** Miembros como lista comparable: `userId` y, si es su equipo principal, `userId:primary`. */
function auditMembers(members: readonly { userId: string; isPrimary: boolean }[]): Record<string, unknown> {
  return { members: members.map((member) => (member.isPrimary ? `${member.userId}:primary` : member.userId)) };
}

/**
 * Equipos (PLAN-ADMIN, D8).
 *
 * - Jerarquía sin ciclos: un equipo no puede colgar de sí mismo ni de un
 *   descendiente (`422 TEAM_CYCLE`). El alcance de datos `TEAM` recorre
 *   descendientes, y un ciclo lo rompería.
 * - `code` es único (también frente a equipos borrados) e inmutable.
 * - Responsable y miembros deben ser usuarios existentes y no eliminados.
 * - Un usuario tiene como mucho un equipo principal: marcarlo aquí lo desmarca
 *   en los demás, en la misma transacción.
 * - Eliminar es borrado lógico y solo sin miembros ni subequipos (`409 HAS_CHILDREN`).
 *
 * Toda mutación deja registro en la bitácora (D11).
 */
@Injectable()
export class TeamsService {
  constructor(
    @Inject(TEAMS_REPOSITORY) private readonly repository: TeamsRepository,
    private readonly audit: AuditService,
  ) {}

  list(filter: ListTeamsFilter): Promise<Page<TeamRecord>> {
    return this.repository.list(filter);
  }

  async findById(teamId: string): Promise<TeamDetailRecord> {
    const team = await this.repository.findById(teamId);
    if (!team) {
      throw new ResourceNotFoundError('Team', teamId);
    }
    return team;
  }

  async create(input: CreateTeamInput, context: AuditContext): Promise<TeamDetailRecord> {
    if (await this.repository.existsByCode(input.code)) {
      throw new ResourceConflictError('A team with this code already exists', [{ field: 'code', issue: 'duplicated' }]);
    }
    if (input.parentId) {
      await this.findById(input.parentId);
    }
    if (input.managerId) {
      await this.assertUsersExist([input.managerId]);
    }

    const teamId = await this.repository.create(input);
    const created = await this.findById(teamId);

    await this.audit.record('team.created', context, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: null,
      after: auditState(created),
    });
    return created;
  }

  /**
   * Cambiar de padre puede crear un ciclo junto con otro movimiento simultáneo
   * (A bajo B y B bajo A, cada uno válido por separado). La lectura del árbol,
   * la comprobación y la escritura van en la sección crítica de la jerarquía.
   */
  async update(teamId: string, input: UpdateTeamInput, context: AuditContext): Promise<TeamDetailRecord> {
    const { current, updated } = await this.repository.withHierarchyLock(async (repository) => {
      const before = await findOrThrow(repository, teamId);

      if (input.parentId !== undefined && input.parentId !== before.parentId) {
        await assertValidParent(repository, teamId, input.parentId);
      }
      if (input.managerId) {
        await assertUsersExist(repository, [input.managerId]);
      }

      await repository.update(teamId, input);
      return { current: before, updated: await findOrThrow(repository, teamId) };
    });

    await this.audit.record('team.updated', context, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditState(current),
      after: auditState(updated),
    });
    return updated;
  }

  async remove(teamId: string, context: AuditContext): Promise<void> {
    const current = await this.findById(teamId);

    if (current.memberCount > 0 || current.childCount > 0) {
      throw new ResourceConflictError(
        'The team still has members or sub-teams',
        [{ memberCount: current.memberCount, childCount: current.childCount }],
        HAS_CHILDREN,
      );
    }

    await this.repository.softDelete(teamId);
    await this.audit.record('team.deleted', context, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditState(current),
      after: null,
    });
  }

  async replaceMembers(
    teamId: string,
    members: readonly TeamMembershipInput[],
    context: AuditContext,
  ): Promise<TeamDetailRecord> {
    const current = await this.findById(teamId);

    const userIds = members.map((member) => member.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BusinessRuleViolationError('DUPLICATED_MEMBER', 'A user appears more than once');
    }
    await this.assertUsersExist(userIds);

    const primaryUserIds = members.filter((member) => member.isPrimary).map((member) => member.userId);
    await this.repository.replaceMembers(teamId, members, primaryUserIds);
    const updated = await this.findById(teamId);

    await this.audit.record('team.members_replaced', context, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditMembers(current.members),
      after: auditMembers(updated.members),
    });
    return updated;
  }

  private assertUsersExist(userIds: readonly string[]): Promise<void> {
    return assertUsersExist(this.repository, userIds);
  }
}

async function findOrThrow(repository: TeamsRepository, teamId: string): Promise<TeamDetailRecord> {
  const team = await repository.findById(teamId);
  if (!team) {
    throw new ResourceNotFoundError('Team', teamId);
  }
  return team;
}

/** El padre debe existir y no puede ser el propio equipo ni un descendiente. */
async function assertValidParent(repository: TeamsRepository, teamId: string, parentId: string | null): Promise<void> {
  if (parentId === null) {
    return;
  }
  if (parentId !== teamId) {
    await findOrThrow(repository, parentId);
  }

  const links = await repository.listLinks();
  if (wouldCreateTeamCycle(teamId, parentId, links)) {
    throw new BusinessRuleViolationError(TEAM_CYCLE, 'A team cannot be placed under itself or one of its sub-teams', [
      { field: 'parentId', issue: 'cycle' },
    ]);
  }
}

async function assertUsersExist(repository: TeamsRepository, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const existing = new Set(await repository.findExistingUserIds(userIds));
  const missing = userIds.find((userId) => !existing.has(userId));
  if (missing) {
    throw new ResourceNotFoundError('User', missing);
  }
}
