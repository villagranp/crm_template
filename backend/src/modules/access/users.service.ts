import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { MAX_EXPORT_ROWS, toCsv, type CsvColumn } from '@/common/csv';
import {
  BusinessRuleViolationError,
  PermissionDeniedError,
  ResourceConflictError,
} from '@/common/errors/application-error';
import { AuditService } from '@/modules/audit/audit.service';
import { InitialCredentialService } from '@/modules/auth/initial-credential.service';
import { AUTH_REPOSITORY, type AuthRepository } from '@/modules/auth/ports/auth.repository.port';

import { ACCESS_ERROR_CODES, ADMIN_ROLE_CODE, type ActorContext, missingIds } from './access-rules';
import { AccessService } from './access.service';
import {
  ADMIN_CRITICAL_PERMISSIONS,
  SELF_ADMINISTRATION_PERMISSION,
  isAdminGuardian,
  isSelfLockout,
  losesAdminGuardian,
} from './admin-invariant';
import { adminOnlyError, assertAssignableByNonAdministrador } from './admin-only';
import { type CrmProfile, assertCrmProfileComplete } from './crm-profile';
import type { DirectAssignmentDto } from './dto/assignment.dto';
import type { CreateUserDto, ExportUsersQueryDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type DirectAssignmentInput,
  type ListUsersFilter,
  type Paginated,
  type UserDetailRecord,
  type UserListItem,
  type UserStatus,
} from './ports/access.repository.port';

/** Ningún país asignado (`null`) o el id del país. */
type CountryId = string | null;

const SUSPENDABLE: ReadonlySet<UserStatus> = new Set(['ACTIVE', 'INVITED', 'LOCKED']);
const REACTIVATABLE: ReadonlySet<UserStatus> = new Set(['SUSPENDED', 'LOCKED']);

/** Permiso que exige asignar miembros a un equipo; también al darlos en el alta. */
export const TEAM_MEMBERSHIP_PERMISSION = 'equipos.editar';

export interface UsersExport {
  csv: string;
  rowCount: number;
  /** Había más filas que `MAX_EXPORT_ROWS`; el CSV lleva sólo las primeras. */
  truncated: boolean;
}

const EXPORT_COLUMNS: readonly CsvColumn<UserListItem>[] = [
  { header: 'Código de colaborador', value: (user) => user.employeeCode },
  { header: 'Correo', value: (user) => user.email },
  { header: 'Nombre', value: (user) => user.displayName },
  { header: 'País', value: (user) => user.country?.name ?? null },
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
 * - Asignar equipos en el alta exige además `equipos.editar` (lo mismo que
 *   `PUT /teams/{id}/members`) y ser administrador (addendum de ADR-020,
 *   RN-07.10); los equipos deben existir y no estar borrados.
 * - País (RN-07.4, RN-07.5): fijarlo en el alta o cambiarlo en la edición es
 *   exclusivo del administrador; debe existir y estar activo al asignarlo.
 * - Código de colaborador (RN-07.1): único en todo el sistema, recortado y en
 *   mayúsculas (lo normaliza el DTO).
 * - Perfil comercial (D-07.3, `crm-profile.ts`): con un rol comercial, código
 *   y país son obligatorios al asignar roles, en el alta y al editar (no se
 *   pueden vaciar): `422 CRM_PROFILE_INCOMPLETE`.
 * - Las asignaciones directas siempre llevan razón (lo exige el DTO) y se
 *   reemplazan en bloque, no se acumulan.
 * - D3: nadie se suspende ni se quita su propio rol de administrador, nadie se
 *   deja sin `usuarios.editar` efectivo (`SELF_LOCKOUT`), y siempre queda al
 *   menos un administrador activo con los permisos críticos efectivos
 *   (`LAST_ADMIN`; ver `admin-invariant.ts`).
 * - D4: el estado sólo cambia con suspender/reactivar; suspender cierra todas
 *   las sesiones al instante; reactivar a un bloqueado limpia su bloqueo.
 * - D11: toda mutación queda en la bitácora con su diferencia.
 * - ADR-020: asignar roles, permisos u opciones directas es exclusivo del
 *   administrador, igual que editar, suspender o reactivar a un administrador;
 *   en el alta, un no administrador sólo asigna roles sin permisos
 *   (`403 ADMIN_ONLY`). Se comprueba al principio de cada caso de uso, antes
 *   que el resto de reglas.
 *
 * Toda mutación que puede romper D3 (suspender, roles, permisos y opciones
 * directas) pasa por `mutateUnderAdminInvariant`: comprobación y escritura en
 * la misma transacción, serializada con un bloqueo, así que dos
 * administradores que se suspenden mutuamente a la vez no dejan el sistema
 * sin ninguno.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: Pick<
      AuthRepository,
      'revokeAllUserSessions' | 'findAccountByUserId' | 'clearFailedAttempts'
    >,
    private readonly initialCredentials: InitialCredentialService,
    private readonly audit: AuditService,
    private readonly accessService: AccessService,
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
        countryId: query.countryId ?? null,
        pendingAccess: query.pendingAccess ?? null,
      },
    });

    return { csv: toCsv(result.items, EXPORT_COLUMNS), rowCount: result.items.length, truncated };
  }

  getDetail(userId: string): Promise<UserDetailRecord> {
    return detailOrThrow(this.repository, userId);
  }

  async create(dto: CreateUserDto, actor: ActorContext): Promise<UserDetailRecord> {
    const teamIds = dto.teamIds ?? [];
    const employeeCode = dto.employeeCode ?? null;
    const countryId = dto.countryId ?? null;

    if (dto.roleIds.length === 0) {
      throw new BadRequestException('El usuario debe tener al menos un rol asignado');
    }
    const isAdministrador = await this.accessService.isAdministrador(actor.userId);
    // ADR-020: un no administrador sólo da de alta con roles que no conceden
    // ningún permiso (hoy, `usuario`), sin país (RN-07.5).
    if (!isAdministrador) {
      assertAssignableByNonAdministrador(await this.repository.findRoleIdsGrantingPermissions(dto.roleIds));
      if (countryId !== null) {
        throw adminOnlyError('Only an administrator can set the country of a user');
      }
    }
    // Autorización antes que validar referencias: sin el permiso no se revela
    // qué equipos existen. Primero el permiso del recurso (PERMISSION_DENIED) y
    // después la regla de administrador (ADMIN_ONLY, RN-07.10).
    if (teamIds.length > 0) {
      await this.assertActorHolds(actor, TEAM_MEMBERSHIP_PERMISSION);
      if (!isAdministrador) {
        throw adminOnlyError('Only an administrator can assign teams to a user');
      }
    }
    await this.assertExisting('role', dto.roleIds, await this.repository.existingRoleIds(dto.roleIds));
    await this.assertExisting('team', teamIds, await this.repository.existingTeamIds(teamIds));
    if (countryId !== null) {
      await this.assertAssignableCountry(this.repository, countryId);
    }
    assertCrmProfileComplete(await this.repository.findRoleGrants(dto.roleIds), { employeeCode, countryId });

    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ResourceConflictError('Ya existe un usuario con ese correo');
    }
    if (employeeCode !== null) {
      await this.assertEmployeeCodeAvailable(employeeCode, null);
    }

    const user = await this.repository.createUser({
      email: dto.email.trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      employeeCode,
      countryId,
      roleIds: dto.roleIds,
      teamIds,
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
      after: {
        ...userAuditView(created),
        roles: created.roles.map((role) => role.code),
        teamIds: created.teams.map((team) => team.id),
      },
    });

    // El detalle completo (código, país, fechas), no el registro mínimo de la inserción.
    return created;
  }

  async update(userId: string, dto: UpdateUserDto, actor: ActorContext): Promise<UserDetailRecord> {
    await this.accessService.assertActorMayActOn(actor.userId, userId);
    const before = await this.getDetail(userId);

    // Omitido = sin cambio. Enviar el valor actual tampoco es un cambio.
    const countryChange = changedValue<CountryId>(dto.countryId, before.country?.id ?? null);
    const employeeCodeChange = changedValue(dto.employeeCode, before.employeeCode);

    // RN-07.5: cambiar el país cambia lo que ve con alcance COUNTRY.
    if (countryChange !== undefined && !(await this.accessService.isAdministrador(actor.userId))) {
      throw adminOnlyError('Only an administrator can change the country of a user');
    }
    if (countryChange) {
      await this.assertAssignableCountry(this.repository, countryChange);
    }
    // D-07.3: a un usuario comercial no se le vacía el perfil.
    if (countryChange === null || employeeCodeChange === null) {
      const snapshot = await this.repository.getUserAccessSnapshot(userId);
      assertCrmProfileComplete(snapshot?.roles ?? [], {
        employeeCode: employeeCodeChange === undefined ? before.employeeCode : employeeCodeChange,
        countryId: countryChange === undefined ? (before.country?.id ?? null) : countryChange,
      });
    }
    if (employeeCodeChange) {
      await this.assertEmployeeCodeAvailable(employeeCodeChange, userId);
    }

    await this.repository.updateUser(userId, {
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      employeeCode: employeeCodeChange,
      countryId: countryChange,
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
    await this.accessService.assertActorMayActOn(actor.userId, userId);
    const previousStatus = await this.mutateUnderAdminInvariant(userId, actor, async (repository) => {
      const user = await detailOrThrow(repository, userId);

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

      await repository.setUserStatus(userId, 'SUSPENDED', actor.userId);
      return user.status;
    });

    // Después de confirmar: si se revocaran dentro y la transacción se
    // deshiciera, perdería sus sesiones sin quedar suspendido.
    const revokedSessions = await this.authRepository.revokeAllUserSessions(userId, 'account_disabled', new Date());

    await this.audit.record('user.suspended', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { status: previousStatus },
      after: { status: 'SUSPENDED' },
      metadata: { revokedSessions, reason: reason ?? null },
    });

    return this.getDetail(userId);
  }

  /**
   * D4: vuelve a ACTIVE, o a INVITED si nunca fijó su contraseña. Reactivar a
   * un `LOCKED` limpia también el bloqueo de su credencial (intentos fallidos y
   * `lockedUntil`): si no, el estado diría que puede entrar y el login lo
   * seguiría rechazando hasta que caducara el bloqueo.
   *
   * No pasa por el invariante D3: reactivar sólo puede añadir administradores.
   */
  async reactivate(userId: string, reason: string | undefined, actor: ActorContext): Promise<UserDetailRecord> {
    await this.accessService.assertActorMayActOn(actor.userId, userId);
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

    let clearedLockout = false;
    if (user.status === 'LOCKED') {
      const credentialId = (await this.authRepository.findAccountByUserId(userId))?.credential?.id;
      if (credentialId) {
        await this.authRepository.clearFailedAttempts(credentialId);
        clearedLockout = true;
      }
    }

    await this.audit.record('user.reactivated', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { status: user.status },
      after: { status },
      metadata: { reason: reason ?? null, clearedLockout },
    });

    return this.getDetail(userId);
  }

  async replaceRoles(userId: string, roleIds: string[], actor: ActorContext): Promise<void> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    if (roleIds.length === 0) {
      throw new BadRequestException('El usuario debe conservar al menos un rol');
    }

    const { before, after } = await this.mutateUnderAdminInvariant(userId, actor, async (repository) => {
      const user = await detailOrThrow(repository, userId);
      await this.assertExisting('role', roleIds, await repository.existingRoleIds(roleIds));
      // D-07.3: un rol comercial exige código y país.
      assertCrmProfileComplete(await repository.findRoleGrants(roleIds), crmProfileOf(user));

      // D3 literal: el propio rol de administrador no se quita, aunque otro rol
      // conservara los permisos críticos.
      const adminRole = user.roles.find((role) => role.code === ADMIN_ROLE_CODE && isCurrent(role.expiresAt));
      if (adminRole && !roleIds.includes(adminRole.id) && actor.userId === user.id) {
        throw new ResourceConflictError(
          'You cannot remove your own administrator role',
          [],
          ACCESS_ERROR_CODES.selfLockout,
        );
      }

      await repository.replaceUserRoles(userId, roleIds, actor.userId);
      return { before: user, after: await detailOrThrow(repository, userId) };
    });

    await this.audit.record('user.roles_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { roles: before.roles.map((role) => role.code) },
      after: { roles: after.roles.map((role) => role.code) },
    });
  }

  /** Excepciones directas de permisos. Reemplaza el conjunto completo. Un DENY también cuenta para D3. */
  async replacePermissions(userId: string, assignments: DirectAssignmentDto[], actor: ActorContext): Promise<void> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const ids = assignments.map((assignment) => assignment.targetId);
    assertFutureExpiry(assignments);

    const { before, after } = await this.mutateUnderAdminInvariant(userId, actor, async (repository) => {
      const current = await detailOrThrow(repository, userId);
      await this.assertExisting('permission', ids, await repository.existingPermissionIds(ids));

      await repository.replaceUserPermissions(userId, assignments.map(toAssignmentInput), actor.userId);
      return { before: current, after: await detailOrThrow(repository, userId) };
    });

    await this.audit.record('user.permissions_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { permissions: before.directPermissions.map((item) => assignmentAuditView(item.code, item)) },
      after: { permissions: after.directPermissions.map((item) => assignmentAuditView(item.code, item)) },
    });
  }

  /**
   * Asignación directa de opciones de menú. Reemplaza el conjunto completo.
   *
   * Hoy una opción de menú no aporta ni quita permisos (sólo visibilidad), así
   * que no puede romper D3; pasa igualmente por el invariante para que la regla
   * siga valiendo si eso cambia y para que toda asignación directa tenga un
   * único camino.
   */
  async replaceMenuOptions(userId: string, assignments: DirectAssignmentDto[], actor: ActorContext): Promise<void> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const ids = assignments.map((assignment) => assignment.targetId);
    assertFutureExpiry(assignments);

    const { before, after } = await this.mutateUnderAdminInvariant(userId, actor, async (repository) => {
      const current = await detailOrThrow(repository, userId);
      await this.assertExisting('menuOption', ids, await repository.existingMenuOptionIds(ids));

      await repository.replaceUserMenuOptions(userId, assignments.map(toAssignmentInput), actor.userId);
      return { before: current, after: await detailOrThrow(repository, userId) };
    });

    await this.audit.record('user.menu_options_replaced', actor.audit, {
      resourceType: 'user',
      resourceId: userId,
      before: { menuOptions: before.directMenuOptions.map((item) => assignmentAuditView(item.key, item)) },
      after: { menuOptions: after.directMenuOptions.map((item) => assignmentAuditView(item.key, item)) },
    });
  }

  /**
   * Único punto donde se aplica el invariante D3 (ver `admin-invariant.ts`).
   *
   * Dentro de la sección crítica del repositorio: lee el acceso efectivo del
   * usuario, ejecuta `change` (sus comprobaciones previas y su escritura, con el
   * repositorio de la transacción), lo vuelve a leer y valida la
   * postcondición. Si se viola, lanza y la transacción se deshace: nada queda
   * escrito. Las reglas que dependan del actor y de lo que concede (p. ej.
   * "sólo concede lo que tiene") encajan aquí, junto a las de D3.
   */
  private mutateUnderAdminInvariant<T>(
    userId: string,
    actor: ActorContext,
    change: (repository: AccessRepository) => Promise<T>,
  ): Promise<T> {
    return this.repository.withAdminInvariantLock(async (repository) => {
      const before = await repository.getUserAccessSnapshot(userId);
      const result = await change(repository);
      const after = await repository.getUserAccessSnapshot(userId);

      if (isSelfLockout(actor.userId === userId, before, after)) {
        throw new ResourceConflictError(
          `You cannot remove your own ${SELF_ADMINISTRATION_PERMISSION} permission`,
          [{ permission: SELF_ADMINISTRATION_PERMISSION }],
          ACCESS_ERROR_CODES.selfLockout,
        );
      }
      if (losesAdminGuardian(before, after) && !(await anotherAdminGuardianExists(repository, userId))) {
        throw new ResourceConflictError(
          'At least one active administrator with the critical permissions must remain',
          [{ permissions: [...ADMIN_CRITICAL_PERMISSIONS] }],
          ACCESS_ERROR_CODES.lastAdmin,
        );
      }
      return result;
    });
  }

  /** 403 `PERMISSION_DENIED` (con `requiredPermission`) si el actor no tiene `permission` efectivo. */
  private async assertActorHolds(actor: ActorContext, permission: string): Promise<void> {
    const granted = actor.userId ? await this.accessService.getEffectivePermissions(actor.userId) : new Set<string>();
    if (!granted.has(permission)) {
      throw new PermissionDeniedError(permission);
    }
  }

  /** RN-07.4: `422 UNKNOWN_REFERENCE` si el país no existe (`issue: "not_found"`) o está inactivo (`"inactive"`). */
  private async assertAssignableCountry(repository: AccessRepository, countryId: string): Promise<void> {
    const country = await repository.findCountry(countryId);
    if (!country || !country.isActive) {
      throw new BusinessRuleViolationError(ACCESS_ERROR_CODES.unknownReference, 'Unknown or inactive country', [
        { field: 'countryId', resource: 'country', identifier: countryId, issue: country ? 'inactive' : 'not_found' },
      ]);
    }
  }

  /** RN-07.1: `409 RESOURCE_CONFLICT` con `field = employeeCode` si otro usuario (incluso eliminado) ya lo usa. */
  private async assertEmployeeCodeAvailable(employeeCode: string, ownerId: string | null): Promise<void> {
    const holder = await this.repository.findUserIdByEmployeeCode(employeeCode);
    if (holder !== null && holder !== ownerId) {
      throw new ResourceConflictError('A user with this employee code already exists', [
        { field: 'employeeCode', issue: 'duplicated' },
      ]);
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

async function detailOrThrow(repository: AccessRepository, userId: string): Promise<UserDetailRecord> {
  const user = await repository.findUserDetail(userId);
  if (!user) {
    throw new NotFoundException('El usuario no existe');
  }
  return user;
}

/** Algún administrador activo, distinto de `excludingUserId`, sostiene el invariante D3. */
async function anotherAdminGuardianExists(repository: AccessRepository, excludingUserId: string): Promise<boolean> {
  const candidates = await repository.listActiveUserIdsWithRole(ADMIN_ROLE_CODE, excludingUserId);
  for (const candidateId of candidates) {
    if (isAdminGuardian(await repository.getUserAccessSnapshot(candidateId))) {
      return true;
    }
  }
  return false;
}

function toFilter(query: ExportUsersQueryDto): Omit<ListUsersFilter, 'page' | 'pageSize'> {
  return {
    search: query.search?.trim() || undefined,
    status: query.status,
    roleCode: query.roleCode,
    teamId: query.teamId,
    countryId: query.countryId,
    pendingAccess: query.pendingAccess,
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

/**
 * Valor nuevo de un campo anulable de un PATCH, o `undefined` si no cambia
 * (omitido o igual al actual).
 */
function changedValue<T extends string | null>(requested: T | undefined, current: T): T | undefined {
  if (requested === undefined) {
    return undefined;
  }
  const next = (requested ?? null) as T;
  return next === current ? undefined : next;
}

function crmProfileOf(user: UserDetailRecord): CrmProfile {
  return { employeeCode: user.employeeCode, countryId: user.country?.id ?? null };
}

/** RN-07.11: el país se audita con su id y su código ISO (legible en la bitácora). */
function userAuditView(user: UserDetailRecord): Record<string, unknown> {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    phone: user.phone,
    employeeCode: user.employeeCode,
    countryId: user.country?.id ?? null,
    countryIsoCode: user.country?.isoCode ?? null,
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
