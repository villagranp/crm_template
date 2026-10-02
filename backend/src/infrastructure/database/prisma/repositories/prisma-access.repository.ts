import { Injectable } from '@nestjs/common';

import {
  type AccessRepository,
  type AccessUserRecord,
  type CreateUserInput,
  type DirectAssignmentInput,
  type ListUsersFilter,
  type MenuOptionRecord,
  type Paginated,
  type PermissionRecord,
  type RoleRecord,
  type UpdateUserInput,
  type UserAccessSnapshot,
} from '@/modules/access/ports/access.repository.port';

import { PrismaService } from '../prisma.service';

/**
 * Adaptador Prisma del puerto de acceso (ADR-004).
 *
 * Es el único archivo del módulo de acceso que conoce Prisma. Las reglas viven
 * en los servicios; aquí sólo hay traducción entre el modelo relacional y los
 * tipos del puerto.
 */
@Injectable()
export class PrismaAccessRepository implements AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserBySubject(provider: 'LOCAL' | 'ENTRA_ID', subject: string): Promise<AccessUserRecord | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: { include: { teams: { include: { team: true } } } } },
    });

    if (!identity || identity.user.deletedAt) {
      return null;
    }

    return toUserRecord(identity.user);
  }

  async findUserByEmail(email: string): Promise<AccessUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email.trim().toLowerCase() },
      include: { teams: { include: { team: true } } },
    });

    return user && !user.deletedAt ? toUserRecord(user) : null;
  }

  async getUserAccessSnapshot(userId: string): Promise<UserAccessSnapshot | null> {
    const now = new Date();

    const user = await this.prisma.user.findUnique({
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
      })),
      rolePermissionCodes: [
        ...new Set(
          activeRoles.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)),
        ),
      ],
      directPermissions: user.permissions.map((item) => ({ code: item.permission.code, effect: item.effect })),
      roleMenuOptionIds: [
        ...new Set(activeRoles.flatMap((assignment) => assignment.role.menuOptions.map((item) => item.menuOptionId))),
      ],
      directMenuOptions: user.menuOptions.map((item) => ({ menuOptionId: item.menuOptionId, effect: item.effect })),
    };
  }

  async listMenuOptions(): Promise<MenuOptionRecord[]> {
    const options = await this.prisma.menuOption.findMany({
      where: { deletedAt: null, module: { isActive: true } },
      include: { module: true, requiredPermission: { select: { code: true } } },
      orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    return options.map((option) => ({
      id: option.id,
      key: option.key,
      parentId: option.parentId,
      label: option.label,
      icon: option.icon,
      path: option.path,
      kind: option.kind,
      sortOrder: option.sortOrder,
      requiredPermissionCode: option.requiredPermission?.code ?? null,
      isPublic: option.isPublic,
      isActive: option.isActive,
      module: {
        key: option.module.key,
        name: option.module.name,
        icon: option.module.icon,
        sortOrder: option.module.sortOrder,
      },
    }));
  }

  async listUsers(filter: ListUsersFilter): Promise<Paginated<AccessUserRecord & { roles: string[] }>> {
    const where = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.roleCode ? { roles: { some: { role: { code: filter.roleCode } } } } : {}),
      ...(filter.teamId ? { teams: { some: { teamId: filter.teamId } } } : {}),
      ...(filter.search
        ? {
            OR: [
              { displayName: { contains: filter.search, mode: 'insensitive' as const } },
              { emailNormalized: { contains: filter.search.toLowerCase() } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { teams: { include: { team: true } }, roles: { include: { role: { select: { code: true } } } } },
        orderBy: { displayName: 'asc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => ({
        ...toUserRecord(user),
        roles: user.roles.map((assignment) => assignment.role.code),
      })),
      totalItems,
    };
  }

  async createUser(input: CreateUserInput): Promise<AccessUserRecord> {
    const displayName = `${input.firstName} ${input.lastName}`.trim();

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        emailNormalized: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        displayName,
        jobTitle: input.jobTitle ?? null,
        phone: input.phone ?? null,
        status: 'INVITED',
        createdById: input.createdById,
        roles: { create: input.roleIds.map((roleId) => ({ roleId, createdById: input.createdById })) },
        teams: { create: input.teamIds.map((teamId, index) => ({ teamId, isPrimary: index === 0 })) },
      },
      include: { teams: { include: { team: true } } },
    });

    return toUserRecord(user);
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<AccessUserRecord> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const firstName = input.firstName ?? current.firstName;
    const lastName = input.lastName ?? current.lastName;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        jobTitle: input.jobTitle === undefined ? undefined : input.jobTitle,
        phone: input.phone === undefined ? undefined : input.phone,
        status: input.status,
        updatedById: input.updatedById,
      },
      include: { teams: { include: { team: true } } },
    });

    return toUserRecord(user);
  }

  async replaceUserRoles(userId: string, roleIds: string[], actorId: string | null): Promise<void> {
    // En una transacción: entre el borrado y el alta el usuario no debe quedar
    // ni un instante sin roles para una petición concurrente.
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
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
    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      this.prisma.userPermission.createMany({
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
    await this.prisma.$transaction([
      this.prisma.userMenuOption.deleteMany({ where: { userId } }),
      this.prisma.userMenuOption.createMany({
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

  async listRoles(): Promise<RoleRecord[]> {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        menuOptions: { select: { menuOptionId: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map(toRoleRecord);
  }

  async findRoleById(roleId: string): Promise<RoleRecord | null> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        menuOptions: { select: { menuOptionId: true } },
        _count: { select: { users: true } },
      },
    });

    return role && !role.deletedAt ? toRoleRecord(role) : null;
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[], actorId: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId, createdById: actorId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async replaceRoleMenuOptions(roleId: string, menuOptionIds: string[], actorId: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.roleMenuOption.deleteMany({ where: { roleId } }),
      this.prisma.roleMenuOption.createMany({
        data: menuOptionIds.map((menuOptionId) => ({ roleId, menuOptionId, createdById: actorId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async listPermissions(): Promise<PermissionRecord[]> {
    const permissions = await this.prisma.permission.findMany({
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
    permissionCodes: role.permissions.map((item) => item.permission.code),
    menuOptionIds: role.menuOptions.map((item) => item.menuOptionId),
    userCount: role._count.users,
  };
}
