import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ResourceConflictError } from '@/common/errors/application-error';
import { isPendingAccess } from '@/modules/access/access-rules';

import {
  type AccessRepository,
  type AccessUserRecord,
  type CountryReference,
  type CreateMenuOptionInput,
  type CreateRoleInput,
  type CreateUserInput,
  type DirectAssignmentInput,
  type IdentityOwnerRecord,
  type IdentityProviderName,
  type LinkIdentityInput,
  type LinkIdentityOutcome,
  type ListRolesFilter,
  type ListUsersFilter,
  type MenuOptionRecord,
  type MenuOrderItem,
  type ModuleRecord,
  type Paginated,
  type PermissionRecord,
  type ProvisionExternalUserInput,
  type ProvisionExternalUserOutcome,
  type RoleGrantRecord,
  type RoleRecord,
  type UpdateMenuOptionInput,
  type UpdateRoleInput,
  type UpdateUserInput,
  type UserAccessSnapshot,
  type UserDetailRecord,
  type UserListItem,
  type UserStatus,
} from '@/modules/access/ports/access.repository.port';

import { ADVISORY_LOCK_KEYS, type AdvisoryLockKey, acquireAdvisoryXactLock, withAdvisoryXactLock } from '../advisory-lock';
import { PrismaService } from '../prisma.service';

const ROLE_INCLUDE = {
  permissions: { include: { permission: { select: { code: true } } } },
  menuOptions: { select: { menuOptionId: true } },
  _count: { select: { users: true } },
} as const;

const MENU_OPTION_INCLUDE = { module: true, requiredPermission: { select: { code: true } } } as const;

/** País del usuario en la lista y el detalle (07 F.1). */
const USER_COUNTRY_SELECT = { select: { id: true, isoCode: true, name: true } } as const;

const UNIQUE_VIOLATION = 'P2002';

/** Asignación de rol vigente: sin caducar y de un rol activo y no borrado. */
function currentRoleAssignment(now: Date): Prisma.UserRoleWhereInput {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    role: { isActive: true, deletedAt: null },
  };
}

/** Una identidad sin tenant guardado sirve con cualquiera; con tenant guardado, solo con el mismo. */
function tenantMatches(stored: string | null, expected: string | undefined): boolean {
  return stored === null || expected === undefined || stored === expected;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

/**
 * Carrera entre la comprobación de unicidad del servicio y la escritura: el
 * índice único de `employee_code` responde lo mismo que el servicio (RN-07.1).
 */
function rethrowEmployeeCodeConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
    const target = JSON.stringify(error.meta?.target ?? '');
    if (target.includes('employee_code') || target.includes('employeeCode')) {
      throw new ResourceConflictError('A user with this employee code already exists', [
        { field: 'employeeCode', issue: 'duplicated' },
      ]);
    }
  }
  throw error;
}

/**
 * Adaptador Prisma del puerto de acceso (ADR-004).
 *
 * Es el único archivo del módulo de acceso que conoce Prisma. Las reglas viven
 * en los servicios; aquí sólo hay traducción entre el modelo relacional y los
 * tipos del puerto.
 */
@Injectable()
export class PrismaAccessRepository implements AccessRepository {
  /**
   * Cliente con el que consulta este adaptador: el global o, en la copia que
   * entregan los métodos `with…Lock`, el de la transacción interactiva.
   */
  private db: Prisma.TransactionClient;
  /** `true` en la copia ligada a una transacción interactiva. */
  private transactional = false;

  constructor(private readonly prisma: PrismaService) {
    this.db = prisma;
  }

  // --- Secciones críticas (bloqueos consultivos) ------------------------------

  withAdminInvariantLock<T>(work: (repository: AccessRepository) => Promise<T>): Promise<T> {
    return this.withLock(ADVISORY_LOCK_KEYS.adminInvariant, work);
  }

  withMenuHierarchyLock<T>(work: (repository: AccessRepository) => Promise<T>): Promise<T> {
    return this.withLock(ADVISORY_LOCK_KEYS.menuHierarchy, work);
  }

  private async withLock<T>(key: AdvisoryLockKey, work: (repository: AccessRepository) => Promise<T>): Promise<T> {
    if (this.transactional) {
      // Ya dentro de una transacción: se toma el bloqueo en ella (es reentrante
      // en la misma sesión) en lugar de anidar otra, que Prisma no admite.
      await acquireAdvisoryXactLock(this.db, key);
      return work(this);
    }
    return withAdvisoryXactLock(this.prisma, key, (tx) => work(this.boundTo(tx)));
  }

  /** Copia del adaptador cuyas consultas van por la transacción `tx`. */
  private boundTo(tx: Prisma.TransactionClient): PrismaAccessRepository {
    const scoped = new PrismaAccessRepository(this.prisma);
    scoped.db = tx;
    scoped.transactional = true;
    return scoped;
  }

  /**
   * Ejecuta varias operaciones de forma atómica y en orden. Fuera de una
   * transacción abre una por lotes; dentro, ya son atómicas por la
   * transacción que las contiene y se ejecutan una tras otra.
   */
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

  async findUserBySubject(provider: 'LOCAL' | 'ENTRA_ID', subject: string, tenantId?: string): Promise<AccessUserRecord | null> {
    const identity = await this.db.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: { include: { teams: { include: { team: true } } } } },
    });

    if (!identity || identity.user.deletedAt || !tenantMatches(identity.tenantId, tenantId)) {
      return null;
    }

    return toUserRecord(identity.user);
  }

  async findUserByEmail(email: string): Promise<AccessUserRecord | null> {
    const user = await this.db.user.findUnique({
      where: { emailNormalized: email.trim().toLowerCase() },
      include: { teams: { include: { team: true } } },
    });

    return user && !user.deletedAt ? toUserRecord(user) : null;
  }

  async userHasIdentity(userId: string, provider: IdentityProviderName): Promise<boolean> {
    const count = await this.db.userIdentity.count({ where: { userId, provider, user: { deletedAt: null } } });
    return count > 0;
  }

  async findIdentityOwner(provider: IdentityProviderName, subject: string, tenantId?: string): Promise<IdentityOwnerRecord | null> {
    const identity = await this.db.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      select: { userId: true, tenantId: true, user: { select: { status: true, deletedAt: true } } },
    });

    return identity && tenantMatches(identity.tenantId, tenantId)
      ? { userId: identity.userId, status: identity.user.status, userDeleted: identity.user.deletedAt !== null }
      : null;
  }

  async provisionExternalUser(input: ProvisionExternalUserInput): Promise<ProvisionExternalUserOutcome> {
    try {
      // Una sola sentencia anidada: el usuario y su identidad se confirman juntos o ninguno.
      // Sin `roles`, `permissions` ni `teams`: el acceso lo asigna el administrador (ADR-020, ADR-027).
      const user = await this.db.user.create({
        data: {
          email: input.email,
          emailNormalized: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          displayName: input.displayName,
          status: 'ACTIVE',
          identities: { create: { provider: input.provider, subject: input.subject, tenantId: input.tenantId } },
        },
        select: { id: true },
      });
      return { kind: 'created', userId: user.id };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Carrera: otra petición del mismo primer ingreso ganó (su transacción ya se confirmó,
      // porque el índice único espera a que termine), o el correo lo ocupa otro usuario.
      const owner = await this.findIdentityOwner(input.provider, input.subject, input.tenantId ?? undefined);
      if (owner) {
        return { kind: 'linked', userId: owner.userId };
      }
      // Otra identidad con ese sujeto pero de otro tenant: no es la misma persona ni se pisa.
      if (await this.findIdentityOwner(input.provider, input.subject)) {
        return { kind: 'email_taken' };
      }
      const byEmail = await this.db.user.findUnique({ where: { emailNormalized: input.email }, select: { id: true } });
      if (byEmail) {
        return { kind: 'email_taken' };
      }
      throw error;
    }
  }

  async linkIdentity(input: LinkIdentityInput): Promise<LinkIdentityOutcome> {
    try {
      await this.db.userIdentity.create({
        data: { userId: input.userId, provider: input.provider, subject: input.subject, tenantId: input.tenantId },
      });
      return { kind: 'linked' };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const owner = await this.findIdentityOwner(input.provider, input.subject);
      if (owner?.userId === input.userId) {
        return { kind: 'already_linked' };
      }
      if (owner) {
        return { kind: 'identity_taken' };
      }
      throw error;
    }
  }

  async findUserIdByEmployeeCode(employeeCode: string): Promise<string | null> {
    const user = await this.db.user.findUnique({ where: { employeeCode }, select: { id: true } });
    return user?.id ?? null;
  }

  async findCountry(countryId: string): Promise<CountryReference | null> {
    return this.db.country.findUnique({
      where: { id: countryId },
      select: { id: true, isoCode: true, name: true, isActive: true },
    });
  }

  async getUserAccessSnapshot(userId: string): Promise<UserAccessSnapshot | null> {
    const now = new Date();

    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        teams: { include: { team: true } },
        roles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: {
            role: {
              include: {
                permissions: { include: { permission: { select: { code: true } } } },
                menuOptions: { select: { menuOptionId: true } },
              },
            },
          },
        },
        permissions: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: { permission: { select: { code: true } } },
        },
        menuOptions: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
      },
    });

    if (!user || user.deletedAt) {
      return null;
    }

    // Sólo cuentan los roles activos: desactivar un rol debe retirar el acceso
    // sin tener que desasignarlo de cada usuario.
    const activeRoles = user.roles.filter((assignment) => assignment.role.isActive && !assignment.role.deletedAt);

    return {
      user: toUserRecord(user),
      roles: activeRoles.map((assignment) => ({
        id: assignment.role.id,
        code: assignment.role.code,
        name: assignment.role.name,
        dataScope: assignment.role.dataScope,
        permissionCodes: assignment.role.permissions.map((item) => item.permission.code),
      })),
      rolePermissionCodes: [
        ...new Set(
          activeRoles.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)),
        ),
      ],
      directPermissions: user.permissions.map((item) => ({
        code: item.permission.code,
        effect: item.effect,
        reason: item.reason,
        expiresAt: item.expiresAt,
      })),
      roleMenuOptionIds: [
        ...new Set(activeRoles.flatMap((assignment) => assignment.role.menuOptions.map((item) => item.menuOptionId))),
      ],
      directMenuOptions: user.menuOptions.map((item) => ({ menuOptionId: item.menuOptionId, effect: item.effect })),
    };
  }

  async listMenuOptions(): Promise<MenuOptionRecord[]> {
    const options = await this.db.menuOption.findMany({
      where: { deletedAt: null, module: { isActive: true } },
      include: MENU_OPTION_INCLUDE,
      orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    return options.map(toMenuOptionRecord);
  }

  // --- Usuarios --------------------------------------------------------------

  async listUsers(filter: ListUsersFilter): Promise<Paginated<UserListItem>> {
    const now = new Date();
    // Cuenta pendiente de acceso (ADR-027): ACTIVE y sin ningún rol vigente, con el mismo criterio de
    // vigencia que `getUserAccessSnapshot` (asignación sin caducar de un rol activo y no borrado).
    const pending: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      roles: { none: currentRoleAssignment(now) },
      // También sin permisos directos vigentes (`isPendingAccess`): las denegaciones no dan nada y no cuentan.
      permissions: { none: { effect: 'GRANT', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    };
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filter.pendingAccess === true ? { AND: [pending] } : {}),
      ...(filter.pendingAccess === false ? { NOT: pending } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.roleCode ? { roles: { some: { role: { code: filter.roleCode } } } } : {}),
      ...(filter.teamId ? { teams: { some: { teamId: filter.teamId } } } : {}),
      ...(filter.countryId ? { countryId: filter.countryId } : {}),
      ...(filter.search
        ? {
            OR: [
              { displayName: { contains: filter.search, mode: 'insensitive' as const } },
              { emailNormalized: { contains: filter.search.toLowerCase() } },
              // El código se guarda en mayúsculas (RN-07.1).
              { employeeCode: { contains: filter.search.toUpperCase() } },
            ],
          }
        : {}),
    };
    const sortBy = filter.sortBy ?? 'displayName';
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [sortBy]: filter.sortOrder ?? 'asc' },
      // Desempate estable: sin él, la paginación puede repetir o saltar filas.
      { id: 'asc' },
    ];

    const [items, totalItems] = await this.atomic([
      this.db.user.findMany({
        where,
        include: {
          teams: { include: { team: true } },
          roles: { include: { role: { select: { code: true, isActive: true, deletedAt: true } } } },
          permissions: { where: { effect: 'GRANT' }, select: { expiresAt: true } },
          country: USER_COUNTRY_SELECT,
        },
        orderBy,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.db.user.count({ where }),
    ]);

    return {
      items: items.map((user) => ({
        ...toUserRecord(user),
        employeeCode: user.employeeCode,
        country: user.country,
        roles: user.roles.map((assignment) => assignment.role.code),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        pendingAccess: isPendingAccess(
          {
            status: user.status,
            roles: user.roles
              .filter((assignment) => assignment.role.deletedAt === null)
              .map((assignment) => ({ expiresAt: assignment.expiresAt, isActive: assignment.role.isActive })),
            grantedPermissionExpiries: user.permissions.map((permission) => permission.expiresAt),
          },
          now,
        ),
      })),
      totalItems,
    };
  }

  async findUserDetail(userId: string): Promise<UserDetailRecord | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        teams: { include: { team: true } },
        roles: { include: { role: true }, orderBy: { createdAt: 'asc' } },
        permissions: { include: { permission: { select: { code: true, name: true } } }, orderBy: { createdAt: 'asc' } },
        menuOptions: { include: { menuOption: { select: { key: true, label: true } } }, orderBy: { createdAt: 'asc' } },
        credential: { select: { passwordChangedAt: true } },
        identities: { select: { provider: true } },
        country: USER_COUNTRY_SELECT,
      },
    });

    if (!user || user.deletedAt) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      phone: user.phone,
      employeeCode: user.employeeCode,
      country: user.country,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      teams: toUserRecord(user).teams,
      roles: user.roles
        .filter((assignment) => !assignment.role.deletedAt)
        .map((assignment) => ({
          id: assignment.role.id,
          code: assignment.role.code,
          name: assignment.role.name,
          isSystem: assignment.role.isSystem,
          expiresAt: assignment.expiresAt,
          isActive: assignment.role.isActive,
        })),
      directPermissions: user.permissions.map((item) => ({
        targetId: item.permissionId,
        code: item.permission.code,
        name: item.permission.name,
        effect: item.effect,
        reason: item.reason,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
      directMenuOptions: user.menuOptions.map((item) => ({
        targetId: item.menuOptionId,
        key: item.menuOption.key,
        label: item.menuOption.label,
        effect: item.effect,
        reason: item.reason,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
      hasCompletedActivation:
        Boolean(user.credential?.passwordChangedAt) || user.identities.some((identity) => identity.provider === 'ENTRA_ID'),
      pendingAccess: isPendingAccess({
        status: user.status,
        roles: user.roles.filter((assignment) => !assignment.role.deletedAt).map((assignment) => ({ expiresAt: assignment.expiresAt, isActive: assignment.role.isActive })),
        grantedPermissionExpiries: user.permissions.filter((item) => item.effect === 'GRANT').map((item) => item.expiresAt),
      }),
    };
  }

  async createUser(input: CreateUserInput): Promise<AccessUserRecord> {
    const displayName = `${input.firstName} ${input.lastName}`.trim();

    const user = await this.db.user
      .create({
        data: {
          email: input.email,
          emailNormalized: input.email.toLowerCase(),
          firstName: input.firstName,
          lastName: input.lastName,
          displayName,
          jobTitle: input.jobTitle ?? null,
          phone: input.phone ?? null,
          employeeCode: input.employeeCode ?? null,
          countryId: input.countryId ?? null,
          status: 'INVITED',
          createdById: input.createdById,
          roles: { create: input.roleIds.map((roleId) => ({ roleId, createdById: input.createdById })) },
          teams: { create: input.teamIds.map((teamId, index) => ({ teamId, isPrimary: index === 0 })) },
        },
        include: { teams: { include: { team: true } } },
      })
      .catch(rethrowEmployeeCodeConflict);

    return toUserRecord(user);
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<AccessUserRecord> {
    const current = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const firstName = input.firstName ?? current.firstName;
    const lastName = input.lastName ?? current.lastName;

    const user = await this.db.user
      .update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
          jobTitle: input.jobTitle === undefined ? undefined : input.jobTitle,
          phone: input.phone === undefined ? undefined : input.phone,
          employeeCode: input.employeeCode,
          countryId: input.countryId,
          updatedById: input.updatedById,
        },
        include: { teams: { include: { team: true } } },
      })
      .catch(rethrowEmployeeCodeConflict);

    return toUserRecord(user);
  }

  async setUserStatus(userId: string, status: UserStatus, actorId: string | null): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { status, updatedById: actorId } });
  }

  async listActiveUserIdsWithRole(roleCode: string, excludingUserId: string | null): Promise<string[]> {
    const now = new Date();
    const rows = await this.db.user.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
        roles: {
          some: {
            role: { code: roleCode, isActive: true, deletedAt: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    });
    return rows.map((row) => row.id);
  }

  async replaceUserRoles(userId: string, roleIds: string[], actorId: string | null): Promise<void> {
    // En una transacción: entre el borrado y el alta el usuario no debe quedar
    // ni un instante sin roles para una petición concurrente.
    await this.atomic([
      this.db.userRole.deleteMany({ where: { userId } }),
      this.db.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId, createdById: actorId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async replaceUserPermissions(
    userId: string,
    assignments: DirectAssignmentInput[],
    actorId: string | null,
  ): Promise<void> {
    await this.atomic([
      this.db.userPermission.deleteMany({ where: { userId } }),
      this.db.userPermission.createMany({
        data: assignments.map((assignment) => ({
          userId,
          permissionId: assignment.targetId,
          effect: assignment.effect,
          reason: assignment.reason,
          expiresAt: assignment.expiresAt ?? null,
          createdById: actorId,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  async replaceUserMenuOptions(
    userId: string,
    assignments: DirectAssignmentInput[],
    actorId: string | null,
  ): Promise<void> {
    await this.atomic([
      this.db.userMenuOption.deleteMany({ where: { userId } }),
      this.db.userMenuOption.createMany({
        data: assignments.map((assignment) => ({
          userId,
          menuOptionId: assignment.targetId,
          effect: assignment.effect,
          reason: assignment.reason,
          expiresAt: assignment.expiresAt ?? null,
          createdById: actorId,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  // --- Roles -----------------------------------------------------------------

  async listRoles(filter: ListRolesFilter): Promise<Paginated<RoleRecord>> {
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(filter.isSystem === undefined ? {} : { isSystem: filter.isSystem }),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' as const } },
              { code: { contains: filter.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const sortBy = filter.sortBy ?? 'name';

    const [roles, totalItems] = await this.atomic([
      this.db.role.findMany({
        where,
        include: ROLE_INCLUDE,
        orderBy: [{ [sortBy]: filter.sortOrder ?? 'asc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.db.role.count({ where }),
    ]);

    return { items: roles.map(toRoleRecord), totalItems };
  }

  async findRoleById(roleId: string): Promise<RoleRecord | null> {
    const role = await this.db.role.findUnique({ where: { id: roleId }, include: ROLE_INCLUDE });
    return role && !role.deletedAt ? toRoleRecord(role) : null;
  }

  async roleCodeExists(code: string): Promise<boolean> {
    return (await this.db.role.count({ where: { code } })) > 0;
  }

  async createRole(input: CreateRoleInput): Promise<RoleRecord> {
    const role = await this.db.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        dataScope: input.dataScope,
        isSystem: false,
        permissions: {
          create: input.permissionIds.map((permissionId) => ({ permissionId, createdById: input.actorId })),
        },
        menuOptions: {
          create: input.menuOptionIds.map((menuOptionId) => ({ menuOptionId, createdById: input.actorId })),
        },
      },
      include: ROLE_INCLUDE,
    });
    return toRoleRecord(role);
  }

  async updateRole(roleId: string, input: UpdateRoleInput): Promise<void> {
    await this.db.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description,
        dataScope: input.dataScope,
        isActive: input.isActive,
      },
    });
  }

  async softDeleteRole(roleId: string): Promise<void> {
    await this.db.role.update({ where: { id: roleId }, data: { deletedAt: new Date(), isActive: false } });
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[], actorId: string | null): Promise<void> {
    await this.atomic([
      this.db.rolePermission.deleteMany({ where: { roleId } }),
      this.db.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId, createdById: actorId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async replaceRoleMenuOptions(roleId: string, menuOptionIds: string[], actorId: string | null): Promise<void> {
    await this.atomic([
      this.db.roleMenuOption.deleteMany({ where: { roleId } }),
      this.db.roleMenuOption.createMany({
        data: menuOptionIds.map((menuOptionId) => ({ roleId, menuOptionId, createdById: actorId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async listPermissions(): Promise<PermissionRecord[]> {
    const permissions = await this.db.permission.findMany({
      include: { module: { select: { key: true } } },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    return permissions.map((permission) => ({
      id: permission.id,
      code: permission.code,
      resource: permission.resource,
      action: permission.action,
      name: permission.name,
      moduleKey: permission.module?.key ?? null,
    }));
  }

  // --- Validación de referencias ---------------------------------------------

  async existingRoleIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.role.findMany({
      where: { id: { in: ids }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async existingPermissionIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.permission.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async existingMenuOptionIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.menuOption.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async existingTeamIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.team.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async findRoleIdsGrantingPermissions(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const rows = await this.db.role.findMany({
      where: { id: { in: roleIds }, permissions: { some: {} } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findRoleGrants(roleIds: string[]): Promise<RoleGrantRecord[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const rows = await this.db.role.findMany({
      where: { id: { in: roleIds }, isActive: true, deletedAt: null },
      select: { id: true, code: true, permissions: { select: { permission: { select: { code: true } } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      permissionCodes: row.permissions.map((item) => item.permission.code),
    }));
  }

  // --- Opciones de menú y módulos --------------------------------------------

  async findMenuOptionById(menuOptionId: string): Promise<MenuOptionRecord | null> {
    const option = await this.db.menuOption.findUnique({ where: { id: menuOptionId }, include: MENU_OPTION_INCLUDE });
    return option && !option.deletedAt ? toMenuOptionRecord(option) : null;
  }

  async menuOptionKeyExists(key: string): Promise<boolean> {
    return (await this.db.menuOption.count({ where: { key } })) > 0;
  }

  async createMenuOption(input: CreateMenuOptionInput): Promise<MenuOptionRecord> {
    const option = await this.db.menuOption.create({
      data: { ...input, isSystem: false },
      include: MENU_OPTION_INCLUDE,
    });
    return toMenuOptionRecord(option);
  }

  async updateMenuOption(menuOptionId: string, input: UpdateMenuOptionInput): Promise<MenuOptionRecord> {
    const option = await this.db.menuOption.update({
      where: { id: menuOptionId },
      data: input,
      include: MENU_OPTION_INCLUDE,
    });
    return toMenuOptionRecord(option);
  }

  async softDeleteMenuOption(menuOptionId: string): Promise<void> {
    await this.db.menuOption.update({
      where: { id: menuOptionId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async countMenuOptionChildren(menuOptionId: string): Promise<number> {
    return this.db.menuOption.count({ where: { parentId: menuOptionId, deletedAt: null } });
  }

  async reorderMenuOptions(items: MenuOrderItem[]): Promise<void> {
    await this.atomic(
      items.map((item) =>
        this.db.menuOption.update({
          where: { id: item.id },
          data: { parentId: item.parentId, sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async listModules(): Promise<ModuleRecord[]> {
    const modules = await this.db.appModule.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
    return modules.map((module) => ({
      id: module.id,
      key: module.key,
      name: module.name,
      icon: module.icon,
      sortOrder: module.sortOrder,
      isSystem: module.isSystem,
      isActive: module.isActive,
    }));
  }
}

interface UserWithTeams {
  id: string;
  email: string;
  displayName: string;
  status: AccessUserRecord['status'];
  jobTitle: string | null;
  teams: { isPrimary: boolean; team: { id: string; name: string } }[];
}

function toUserRecord(user: UserWithTeams): AccessUserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    jobTitle: user.jobTitle,
    teams: user.teams.map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      isPrimary: membership.isPrimary,
    })),
  };
}

interface RoleWithRelations {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataScope: RoleRecord['dataScope'];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { code: string } }[];
  menuOptions: { menuOptionId: string }[];
  _count: { users: number };
}

function toRoleRecord(role: RoleWithRelations): RoleRecord {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    dataScope: role.dataScope,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissionCodes: role.permissions.map((item) => item.permission.code).sort(),
    menuOptionIds: role.menuOptions.map((item) => item.menuOptionId),
    userCount: role._count.users,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

interface MenuOptionWithRelations {
  id: string;
  key: string;
  parentId: string | null;
  label: string;
  description: string | null;
  icon: string | null;
  path: string | null;
  kind: MenuOptionRecord['kind'];
  sortOrder: number;
  requiredPermissionId: string | null;
  isPublic: boolean;
  isSystem: boolean;
  isActive: boolean;
  requiredPermission: { code: string } | null;
  module: { id: string; key: string; name: string; icon: string | null; sortOrder: number; isSystem: boolean };
}

function toMenuOptionRecord(option: MenuOptionWithRelations): MenuOptionRecord {
  return {
    id: option.id,
    key: option.key,
    parentId: option.parentId,
    label: option.label,
    description: option.description,
    icon: option.icon,
    path: option.path,
    kind: option.kind,
    sortOrder: option.sortOrder,
    requiredPermissionId: option.requiredPermissionId,
    requiredPermissionCode: option.requiredPermission?.code ?? null,
    isPublic: option.isPublic,
    isSystem: option.isSystem,
    isActive: option.isActive,
    module: {
      id: option.module.id,
      key: option.module.key,
      name: option.module.name,
      icon: option.module.icon,
      sortOrder: option.module.sortOrder,
      isSystem: option.module.isSystem,
    },
  };
}
