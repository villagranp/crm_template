import { Inject, Injectable } from '@nestjs/common';

import {
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { Page } from '@/infrastructure/database/ports/pagination';
import { ACCESS_ERROR_CODES, type ActorContext } from '@/modules/access/access-rules';
import { AccessService } from '@/modules/access/access.service';
import { AuditService } from '@/modules/audit/audit.service';

import {
  type CreateTeamInput,
  type ListTeamsFilter,
  TEAMS_REPOSITORY,
  type TeamDetailRecord,
  type TeamMembershipInput,
  type TeamRecord,
  type TeamsRepository,
  type UpdateTeamInput,
  type UserTeamAssignmentInput,
  type UserTeamMembershipRecord,
} from './ports/teams.repository.port';
import { wouldCreateTeamCycle } from './team-hierarchy';

export const TEAM_CYCLE = 'TEAM_CYCLE';
export const HAS_CHILDREN = 'HAS_CHILDREN';
const RESOURCE_TYPE = 'team';

/** Lo que necesita el servicio para aplicar la regla de administrador (ADR-020). */
export type AdministratorCheck = Pick<AccessService, 'assertActorIsAdministrador'>;

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

/** Equipos de un usuario como lista comparable: `teamId` y, si es el principal, `teamId:primary`. */
function auditUserTeams(teams: readonly { teamId: string; isPrimary: boolean }[]): Record<string, unknown> {
  return { teams: teams.map((team) => (team.isPrimary ? `${team.teamId}:primary` : team.teamId)) };
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
 * - Addendum de 2026-10-10 a ADR-020 (RN-07.45, RN-07.10): la composición de
 *   un equipo cambia lo que ven los usuarios con alcance `TEAM`, así que es
 *   exclusiva del administrador (`403 ADMIN_ONLY`, además del permiso del
 *   endpoint): reemplazar miembros, los equipos de un usuario, fijar o cambiar
 *   responsable o padre, y eliminar, activar o desactivar un equipo con
 *   miembros o subequipos (decisión de 2026-10-14). Crear un equipo sin
 *   responsable ni padre, editar sus datos y activar o desactivar un equipo
 *   vacío no la exigen. Se comprueba antes que el resto de reglas, salvo donde
 *   depende del estado actual del equipo (cambio de responsable, padre o
 *   estado, eliminar).
 *
 * Toda mutación deja registro en la bitácora (D11).
 */
@Injectable()
export class TeamsService {
  constructor(
    @Inject(TEAMS_REPOSITORY) private readonly repository: TeamsRepository,
    private readonly audit: AuditService,
    @Inject(AccessService) private readonly access: AdministratorCheck,
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

  async create(input: CreateTeamInput, actor: ActorContext): Promise<TeamDetailRecord> {
    if (input.managerId || input.parentId) {
      await this.access.assertActorIsAdministrador(actor.userId);
    }
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

    await this.audit.record('team.created', actor.audit, {
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
  async update(teamId: string, input: UpdateTeamInput, actor: ActorContext): Promise<TeamDetailRecord> {
    const { current, updated } = await this.repository.withHierarchyLock(async (repository) => {
      const before = await findOrThrow(repository, teamId);
      const parentChanges = input.parentId !== undefined && input.parentId !== before.parentId;
      const managerChanges = input.managerId !== undefined && input.managerId !== (before.manager?.id ?? null);
      // Activar o desactivar un equipo con miembros o subequipos cambia lo que
      // ven los usuarios con alcance TEAM: mismo criterio que eliminarlo.
      const activationChangesPopulated =
        input.isActive !== undefined &&
        input.isActive !== before.isActive &&
        (before.memberCount > 0 || before.childCount > 0);

      if (parentChanges || managerChanges || activationChangesPopulated) {
        await this.access.assertActorIsAdministrador(actor.userId);
      }
      if (parentChanges) {
        await assertValidParent(repository, teamId, input.parentId ?? null);
      }
      if (input.managerId) {
        await assertUsersExist(repository, [input.managerId]);
      }

      await repository.update(teamId, input);
      return { current: before, updated: await findOrThrow(repository, teamId) };
    });

    await this.audit.record('team.updated', actor.audit, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditState(current),
      after: auditState(updated),
    });
    return updated;
  }

  async remove(teamId: string, actor: ActorContext): Promise<void> {
    const current = await this.findById(teamId);

    if (current.memberCount > 0 || current.childCount > 0) {
      // Sólo el administrador llega a saber que no se puede borrar todavía.
      await this.access.assertActorIsAdministrador(actor.userId);
      throw new ResourceConflictError(
        'The team still has members or sub-teams',
        [{ memberCount: current.memberCount, childCount: current.childCount }],
        HAS_CHILDREN,
      );
    }

    await this.repository.softDelete(teamId);
    await this.audit.record('team.deleted', actor.audit, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditState(current),
      after: null,
    });
  }

  async replaceMembers(
    teamId: string,
    members: readonly TeamMembershipInput[],
    actor: ActorContext,
  ): Promise<TeamDetailRecord> {
    await this.access.assertActorIsAdministrador(actor.userId);
    const current = await this.findById(teamId);

    const userIds = members.map((member) => member.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BusinessRuleViolationError('DUPLICATED_MEMBER', 'A user appears more than once');
    }
    await this.assertUsersExist(userIds);

    const primaryUserIds = members.filter((member) => member.isPrimary).map((member) => member.userId);
    await this.repository.replaceMembers(teamId, members, primaryUserIds);
    const updated = await this.findById(teamId);

    await this.audit.record('team.members_replaced', actor.audit, {
      resourceType: RESOURCE_TYPE,
      resourceId: teamId,
      before: auditMembers(current.members),
      after: auditMembers(updated.members),
    });
    return updated;
  }

  /**
   * Equipos de un usuario desde su ficha (`PUT /users/{id}/teams`, D-07.4):
   * conjunto completo, con las mismas reglas que `PUT /teams/{id}/members`.
   *
   * - Exclusivo del administrador (`403 ADMIN_ONLY`, RN-07.10).
   * - Como mucho un equipo principal (`409 RESOURCE_CONFLICT`); lista vacía
   *   permitida (lo deja sin equipos).
   * - Usuario existente y no eliminado (`404`); equipos existentes y no
   *   eliminados (`422 UNKNOWN_REFERENCE`).
   * - Auditoría: `team.members_replaced` por cada equipo cuya composición
   *   cambia (el mismo evento que el reemplazo desde Equipos, para que la
   *   historia del equipo esté completa) y `user.teams_replaced` sobre el usuario.
   * - Sin cambios (mismo conjunto y mismo principal): devuelve los equipos
   *   actuales sin escribir ni auditar.
   * - Las pertenencias a equipos eliminados no se tocan (ver el puerto).
   */
  async replaceUserTeams(
    userId: string,
    teams: readonly UserTeamAssignmentInput[],
    actor: ActorContext,
  ): Promise<UserTeamMembershipRecord[]> {
    await this.access.assertActorIsAdministrador(actor.userId);

    const teamIds = teams.map((team) => team.teamId);
    if (new Set(teamIds).size !== teamIds.length) {
      throw new RequestValidationError('A team appears more than once', [{ field: 'teams', issue: 'duplicated' }]);
    }
    if (teams.filter((team) => team.isPrimary).length > 1) {
      throw new ResourceConflictError('A user can have only one primary team', [
        { field: 'teams', issue: 'multiple_primary' },
      ]);
    }
    await this.assertUsersExist([userId]);

    const existing = new Set(await this.repository.findExistingTeamIds(teamIds));
    const missing = teamIds.filter((teamId) => !existing.has(teamId));
    if (missing.length > 0) {
      throw new BusinessRuleViolationError(
        ACCESS_ERROR_CODES.unknownReference,
        'Unknown team identifiers',
        missing.map((teamId) => ({ field: 'teams', resource: 'team', identifier: teamId })),
      );
    }

    const before = await this.repository.listUserMemberships(userId);
    const affected = changedTeamIds(before, teams);
    if (affected.length === 0) {
      // Mismo conjunto y mismo principal: nada que escribir ni que auditar.
      return before;
    }
    const teamsBefore = await this.repository.findManyByIds(affected);

    await this.repository.replaceUserTeams(userId, teams);

    const after = await this.repository.listUserMemberships(userId);
    const teamsAfter = new Map((await this.repository.findManyByIds(affected)).map((team) => [team.id, team]));
    for (const previous of teamsBefore) {
      await this.audit.record('team.members_replaced', actor.audit, {
        resourceType: RESOURCE_TYPE,
        resourceId: previous.id,
        before: auditMembers(previous.members),
        after: auditMembers(teamsAfter.get(previous.id)?.members ?? []),
        metadata: { source: 'user', userId },
      });
    }
    await this.audit.record('user.teams_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: auditUserTeams(before),
      after: auditUserTeams(after),
    });
    return after;
  }

  private assertUsersExist(userIds: readonly string[]): Promise<void> {
    return assertUsersExist(this.repository, userIds);
  }
}

/**
 * Equipos cuya composición cambia al pasar de `before` a `requested`: los que
 * se añaden, los que se quitan y aquellos en los que cambia el principal.
 */
export function changedTeamIds(
  before: readonly { teamId: string; isPrimary: boolean }[],
  requested: readonly { teamId: string; isPrimary: boolean }[],
): string[] {
  const previous = new Map(before.map((team) => [team.teamId, team.isPrimary]));
  const next = new Map(requested.map((team) => [team.teamId, team.isPrimary]));
  const ids = [...new Set([...previous.keys(), ...next.keys()])];
  return ids.filter((teamId) => previous.get(teamId) !== next.get(teamId));
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
