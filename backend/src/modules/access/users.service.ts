import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { MAX_EXPORT_ROWS, toCsv, type CsvColumn } from '@/common/csv';
import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';
import { AuditService } from '@/modules/audit/audit.service';
import { InitialCredentialService } from '@/modules/auth/initial-credential.service';
import { AUTH_REPOSITORY, type AuthRepository } from '@/modules/auth/ports/auth.repository.port';

import { ACCESS_ERROR_CODES, ADMIN_ROLE_CODE, type ActorContext, missingIds } from './access-rules';
import type { DirectAssignmentDto } from './dto/assignment.dto';
import type { CreateUserDto, ExportUsersQueryDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type AccessUserRecord,
  type DirectAssignmentInput,
  type ListUsersFilter,
  type Paginated,
  type UserDetailRecord,
  type UserListItem,
  type UserStatus,
} from './ports/access.repository.port';

const SUSPENDABLE: ReadonlySet<UserStatus> = new Set(['ACTIVE', 'INVITED', 'LOCKED']);
const REACTIVATABLE: ReadonlySet<UserStatus> = new Set(['SUSPENDED', 'LOCKED']);

export interface UsersExport {
  csv: string;
  rowCount: number;
  /** Había más filas que `MAX_EXPORT_ROWS`; el CSV lleva sólo las primeras. */
  truncated: boolean;
}

const EXPORT_COLUMNS: readonly CsvColumn<UserListItem>[] = [
  { header: 'Correo', value: (user) => user.email },
  { header: 'Nombre', value: (user) => user.displayName },
  { header: 'Puesto', value: (user) => user.jobTitle },
  { header: 'Estado', value: (user) => user.status },
  { header: 'Roles', value: (user) => user.roles.join(' | ') },
  { header: 'Equipos', value: (user) => user.teams.map((team) => team.name).join(' | ') },
  { header: 'Último acceso', value: (user) => user.lastLoginAt },
  { header: 'Alta', value: (user) => user.createdAt },
];

/**
 * Gestión de usuarios y de sus asignaciones.
 *
 * Reglas que se aplican aquí y no en el controlador, para que valgan también
 * cuando el caso de uso se invoque desde un proceso o una importación:
 * - Un usuario nace con al menos un rol: sin rol no ve nada y el alta parecería
 *   rota.
 * - Las asignaciones directas siempre llevan razón (lo exige el DTO) y se
 *   reemplazan en bloque, no se acumulan.
 * - D3: nadie se suspende ni se quita su propio rol de administrador, y siempre
 *   queda al menos un administrador activo.
 * - D4: el estado sólo cambia con suspender/reactivar; suspender cierra todas
 *   las sesiones al instante.
 * - D11: toda mutación queda en la bitácora con su diferencia.
 *
 * Límite conocido: la comprobación del último administrador y el cambio no
 * son atómicos. Dos administradores suspendiéndose mutuamente en el mismo
 * instante podrían dejar el sistema sin ninguno; el riesgo es mínimo y se
 * corrige con la semilla (repone el usuario administrador).
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    @Inject(AUTH_REPOSITORY) private readonly authRepository: Pick<AuthRepository, 'revokeAllUserSessions'>,
    private readonly initialCredentials: InitialCredentialService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListUsersQueryDto): Promise<Paginated<UserListItem>> {
    return this.repository.listUsers({ ...toFilter(query), page: query.page, pageSize: query.pageSize });
  }

  /**
   * D13: CSV con los filtros activos, como mucho `MAX_EXPORT_ROWS` filas (mismo
   * criterio que la exportación de auditoría: se trunca y se avisa). Se audita.
   */
  async export(query: ExportUsersQueryDto, actor: ActorContext): Promise<UsersExport> {
    const result = await this.repository.listUsers({ ...toFilter(query), page: 1, pageSize: MAX_EXPORT_ROWS });
    const truncated = result.totalItems > result.items.length;

    await this.audit.record('user.exported', actor.audit, {
      resourceType: 'user',
      resourceId: 'export',
      metadata: {
        rowCount: result.items.length,
        truncated,
        search: query.search ?? null,
        status: query.status ?? null,
        roleCode: query.roleCode ?? null,
        teamId: query.teamId ?? null,
      },
    });

    return { csv: toCsv(result.items, EXPORT_COLUMNS), rowCount: result.items.length, truncated };
  }

  async getDetail(userId: string): Promise<UserDetailRecord> {
    const user = await this.repository.findUserDetail(userId);
    if (!user) {
      throw new NotFoundException('El usuario no existe');
    }
    return user;
  }

  async create(dto: CreateUserDto, actor: ActorContext): Promise<AccessUserRecord> {
    if (dto.roleIds.length === 0) {
      throw new BadRequestException('El usuario debe tener al menos un rol asignado');
    }
    await this.assertExisting('role', dto.roleIds, await this.repository.existingRoleIds(dto.roleIds));

    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ResourceConflictError('Ya existe un usuario con ese correo');
    }

    const user = await this.repository.createUser({
      email: dto.email.trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      roleIds: dto.roleIds,
      teamIds: dto.teamIds ?? [],
      createdById: actor.userId,
    });

    // Nace INVITED con la contraseña inicial y cambio obligatorio. Si no está
    // configurada, nace sin credencial; un administrador puede asignarla
    // después con el restablecimiento.
    await this.initialCredentials.assignDefaultPassword(user.id);

    const created = await this.getDetail(user.id);
    await this.audit.record('user.created', actor.audit, {
      resourceType: 'user',
      resourceId: user.id,
      before: null,
      after: { ...userAuditView(created), roles: created.roles.map((role) => role.code) },
    });

    return user;
  }

  async update(userId: string, dto: UpdateUserDto, actor: ActorContext): Promise<UserDetailRecord> {
    const before = await this.getDetail(userId);

    await this.repository.updateUser(userId, {
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      updatedById: actor.userId,
    });

    const after = await this.getDetail(userId);
    await this.audit.record('user.updated', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: userAuditView(before),
      after: userAuditView(after),
    });
    return after;
  }

  /** D3 + D4: suspende y cierra todas sus sesiones. */
  async suspend(userId: string, reason: string | undefined, actor: ActorContext): Promise<UserDetailRecord> {
    const user = await this.getDetail(userId);

    if (actor.userId === user.id) {
      throw new ResourceConflictError('You cannot suspend yourself', [], ACCESS_ERROR_CODES.selfLockout);
    }
    if (!SUSPENDABLE.has(user.status)) {
      throw new ResourceConflictError(
        `A user in status ${user.status} cannot be suspended`,
        [{ status: user.status }],
        ACCESS_ERROR_CODES.invalidStatusTransition,
      );
    }
    await this.assertNotLastAdmin(user);

    await this.repository.setUserStatus(userId, 'SUSPENDED', actor.userId);
    const revokedSessions = await this.authRepository.revokeAllUserSessions(userId, 'account_disabled', new Date());

    await this.audit.record('user.suspended', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { status: user.status },
      after: { status: 'SUSPENDED' },
      metadata: { revokedSessions, reason: reason ?? null },
    });

    return this.getDetail(userId);
  }

  /** D4: vuelve a ACTIVE, o a INVITED si nunca fijó su contraseña. */
  async reactivate(userId: string, reason: string | undefined, actor: ActorContext): Promise<UserDetailRecord> {
    const user = await this.getDetail(userId);

    if (!REACTIVATABLE.has(user.status)) {
      throw new ResourceConflictError(
        `A user in status ${user.status} cannot be reactivated`,
        [{ status: user.status }],
        ACCESS_ERROR_CODES.invalidStatusTransition,
      );
    }

    const status: UserStatus = user.hasCompletedActivation ? 'ACTIVE' : 'INVITED';
    await this.repository.setUserStatus(userId, status, actor.userId);

    await this.audit.record('user.reactivated', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { status: user.status },
      after: { status },
      metadata: { reason: reason ?? null },
    });

    return this.getDetail(userId);
  }

  async replaceRoles(userId: string, roleIds: string[], actor: ActorContext): Promise<void> {
    const user = await this.getDetail(userId);

    if (roleIds.length === 0) {
      throw new BadRequestException('El usuario debe conservar al menos un rol');
    }
    await this.assertExisting('role', roleIds, await this.repository.existingRoleIds(roleIds));

    const adminRole = user.roles.find((role) => role.code === ADMIN_ROLE_CODE && isCurrent(role.expiresAt));
    if (adminRole && !roleIds.includes(adminRole.id)) {
      if (actor.userId === user.id) {
        throw new ResourceConflictError(
          'You cannot remove your own administrator role',
          [],
          ACCESS_ERROR_CODES.selfLockout,
        );
      }
      await this.assertNotLastAdmin(user);
    }

    await this.repository.replaceUserRoles(userId, roleIds, actor.userId);

    const after = await this.getDetail(userId);
    await this.audit.record('user.roles_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { roles: user.roles.map((role) => role.code) },
      after: { roles: after.roles.map((role) => role.code) },
    });
  }

  /** Excepciones directas de permisos. Reemplaza el conjunto completo. */
  async replacePermissions(userId: string, assignments: DirectAssignmentDto[], actor: ActorContext): Promise<void> {
    const before = await this.getDetail(userId);
    const ids = assignments.map((assignment) => assignment.targetId);
    assertFutureExpiry(assignments);
    await this.assertExisting('permission', ids, await this.repository.existingPermissionIds(ids));

    await this.repository.replaceUserPermissions(userId, assignments.map(toAssignmentInput), actor.userId);

    const after = await this.getDetail(userId);
    await this.audit.record('user.permissions_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { permissions: before.directPermissions.map((item) => assignmentAuditView(item.code, item)) },
      after: { permissions: after.directPermissions.map((item) => assignmentAuditView(item.code, item)) },
    });
  }

  /** Asignación directa de opciones de menú. Reemplaza el conjunto completo. */
  async replaceMenuOptions(userId: string, assignments: DirectAssignmentDto[], actor: ActorContext): Promise<void> {
    const before = await this.getDetail(userId);
    const ids = assignments.map((assignment) => assignment.targetId);
    assertFutureExpiry(assignments);
    await this.assertExisting('menuOption', ids, await this.repository.existingMenuOptionIds(ids));

    await this.repository.replaceUserMenuOptions(userId, assignments.map(toAssignmentInput), actor.userId);

    const after = await this.getDetail(userId);
    await this.audit.record('user.menu_options_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { menuOptions: before.directMenuOptions.map((item) => assignmentAuditView(item.key, item)) },
      after: { menuOptions: after.directMenuOptions.map((item) => assignmentAuditView(item.key, item)) },
    });
  }

  /** D3: si el usuario es un administrador activo, debe quedar otro. */
  private async assertNotLastAdmin(user: UserDetailRecord): Promise<void> {
    const isActiveAdmin =
      user.status === 'ACTIVE' && user.roles.some((role) => role.code === ADMIN_ROLE_CODE && isCurrent(role.expiresAt));
    if (!isActiveAdmin) {
      return;
    }

    const others = await this.repository.countActiveUsersWithRole(ADMIN_ROLE_CODE, user.id);
    if (others === 0) {
      throw new ResourceConflictError(
        'At least one active administrator must remain',
        [],
        ACCESS_ERROR_CODES.lastAdmin,
      );
    }
  }

  private async assertExisting(resource: string, requested: string[], existing: string[]): Promise<void> {
    const missing = missingIds(requested, existing);
    if (missing.length > 0) {
      throw new BusinessRuleViolationError(
        ACCESS_ERROR_CODES.unknownReference,
        `Unknown ${resource} identifiers`,
        missing.map((id) => ({ resource, identifier: id })),
      );
    }
  }
}

function toFilter(query: ExportUsersQueryDto): Omit<ListUsersFilter, 'page' | 'pageSize'> {
  return {
    search: query.search?.trim() || undefined,
    status: query.status,
    roleCode: query.roleCode,
    teamId: query.teamId,
    sortBy: query.sortBy,
    // Sin campo de orden explícito, por nombre ascendente.
    sortOrder: query.sortBy ? query.sortOrder : 'asc',
  };
}

/** Una excepción que ya caducó al crearla no tiene sentido: casi siempre es un error de fecha. */
function assertFutureExpiry(assignments: DirectAssignmentDto[]): void {
  const now = Date.now();
  const expired = assignments.filter((assignment) => assignment.expiresAt && assignment.expiresAt.getTime() <= now);
  if (expired.length > 0) {
    // Mensaje como lista: el filtro global lo convierte en `details[].issue`.
    throw new BadRequestException(['expiresAt debe ser una fecha futura']);
  }
}

function isCurrent(expiresAt: Date | null): boolean {
  return expiresAt === null || expiresAt.getTime() > Date.now();
}

function userAuditView(user: UserDetailRecord): Record<string, unknown> {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    phone: user.phone,
    status: user.status,
  };
}

/** Una asignación directa como texto estable para la diferencia de auditoría. */
function assignmentAuditView(
  target: string,
  assignment: { effect: string; reason: string; expiresAt: Date | null },
): string {
  const expiry = assignment.expiresAt ? ` hasta ${assignment.expiresAt.toISOString()}` : '';
  return `${target}:${assignment.effect}${expiry} (${assignment.reason})`;
}

function toAssignmentInput(assignment: DirectAssignmentDto): DirectAssignmentInput {
  return {
    targetId: assignment.targetId,
    effect: assignment.effect,
    reason: assignment.reason.trim(),
    expiresAt: assignment.expiresAt ?? null,
  };
}
