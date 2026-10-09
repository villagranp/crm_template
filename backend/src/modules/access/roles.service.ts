import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';
import { AuditService } from '@/modules/audit/audit.service';

import { ACCESS_ERROR_CODES, type ActorContext, missingIds } from './access-rules';
import { AccessService } from './access.service';
import type { CreateRoleDto, DuplicateRoleDto, ListRolesQueryDto, UpdateRoleDto } from './dto/role.dto';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type Paginated,
  type PermissionRecord,
  type RoleRecord,
} from './ports/access.repository.port';

/**
 * Gestión de roles (PLAN-ADMIN D1, D2).
 *
 * - D1: los roles de sistema son de solo lectura (nombre, permisos, opciones,
 *   alcance y estado): la semilla repone sus asignaciones en cada despliegue y
 *   un cambio desde la interfaz se perdería sin avisar. Para una variante se
 *   duplica.
 * - D2: los roles propios se crean, editan, duplican y eliminan (borrado
 *   lógico). No se elimina un rol con usuarios asignados.
 * - D11: toda mutación queda en la bitácora con su diferencia.
 * - ADR-020: crear, duplicar y cambiar lo que concede un rol (permisos,
 *   opciones, alcance de datos, activación) es exclusivo del administrador
 *   (`403 ADMIN_ONLY`). Renombrar, describir o eliminar no lo es.
 */
@Injectable()
export class RolesService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    private readonly audit: AuditService,
    private readonly accessService: AccessService,
  ) {}

  list(query: ListRolesQueryDto): Promise<Paginated<RoleRecord>> {
    return this.repository.listRoles({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search?.trim() || undefined,
      isSystem: query.isSystem,
      sortBy: query.sortBy,
      sortOrder: query.sortBy ? query.sortOrder : 'asc',
    });
  }

  async findById(roleId: string): Promise<RoleRecord> {
    const role = await this.repository.findRoleById(roleId);

    if (!role) {
      throw new NotFoundException('El rol no existe');
    }

    return role;
  }

  async create(dto: CreateRoleDto, actor: ActorContext): Promise<RoleRecord> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const permissionIds = dto.permissionIds ?? [];
    const menuOptionIds = dto.menuOptionIds ?? [];
    await this.assertReferences(permissionIds, menuOptionIds);
    await this.assertCodeAvailable(dto.code);

    const role = await this.repository.createRole({
      code: dto.code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      dataScope: dto.dataScope,
      permissionIds,
      menuOptionIds,
      actorId: actor.userId,
    });

    await this.audit.record('role.created', actor.audit, {
      resourceType: 'role',
      resourceId: role.id,
      before: null,
      after: roleAuditView(role),
    });
    return role;
  }

  /** D1: copia editable de cualquier rol, incluido uno de sistema. */
  async duplicate(sourceId: string, dto: DuplicateRoleDto, actor: ActorContext): Promise<RoleRecord> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const source = await this.findById(sourceId);
    await this.assertCodeAvailable(dto.code);

    const permissionIds = await this.permissionIdsFor(source.permissionCodes);
    const role = await this.repository.createRole({
      code: dto.code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? source.description,
      dataScope: source.dataScope,
      permissionIds,
      menuOptionIds: source.menuOptionIds,
      actorId: actor.userId,
    });

    await this.audit.record('role.duplicated', actor.audit, {
      resourceType: 'role',
      resourceId: role.id,
      before: null,
      after: roleAuditView(role),
      metadata: { sourceRoleId: source.id, sourceRoleCode: source.code },
    });
    return role;
  }

  async update(roleId: string, dto: UpdateRoleDto, actor: ActorContext): Promise<RoleRecord> {
    const before = await this.requireEditable(roleId);
    // ADR-020: el alcance y la activación cambian lo que concede el rol.
    const changesScope = dto.dataScope !== undefined && dto.dataScope !== before.dataScope;
    const changesActivation = dto.isActive !== undefined && dto.isActive !== before.isActive;
    if (changesScope || changesActivation) {
      await this.accessService.assertActorIsAdministrador(actor.userId);
    }

    await this.repository.updateRole(roleId, {
      name: dto.name?.trim(),
      description: dto.description === undefined ? undefined : (dto.description?.trim() ?? null),
      dataScope: dto.dataScope,
      isActive: dto.isActive,
    });

    const after = await this.findById(roleId);
    await this.audit.record('role.updated', actor.audit, {
      resourceType: 'role',
      resourceId: roleId,
      before: roleAuditView(before),
      after: roleAuditView(after),
    });
    return after;
  }

  /** D2: borrado lógico, sólo sin usuarios asignados. */
  async delete(roleId: string, actor: ActorContext): Promise<void> {
    const role = await this.requireEditable(roleId);

    if (role.userCount > 0) {
      throw new ResourceConflictError(
        'The role has users assigned',
        [{ userCount: role.userCount }],
        ACCESS_ERROR_CODES.roleInUse,
      );
    }

    await this.repository.softDeleteRole(roleId);
    await this.audit.record('role.deleted', actor.audit, {
      resourceType: 'role',
      resourceId: roleId,
      before: roleAuditView(role),
      after: null,
    });
  }

  async replacePermissions(roleId: string, permissionIds: string[], actor: ActorContext): Promise<RoleRecord> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const before = await this.requireEditable(roleId);
    await this.assertReferences(permissionIds, []);

    await this.repository.replaceRolePermissions(roleId, permissionIds, actor.userId);

    const after = await this.findById(roleId);
    await this.audit.record('role.permissions_replaced', actor.audit, {
      resourceType: 'role',
      resourceId: roleId,
      before: { permissions: before.permissionCodes },
      after: { permissions: after.permissionCodes },
    });
    return after;
  }

  async replaceMenuOptions(roleId: string, menuOptionIds: string[], actor: ActorContext): Promise<RoleRecord> {
    await this.accessService.assertActorIsAdministrador(actor.userId);
    const before = await this.requireEditable(roleId);
    await this.assertReferences([], menuOptionIds);

    await this.repository.replaceRoleMenuOptions(roleId, menuOptionIds, actor.userId);

    const after = await this.findById(roleId);
    await this.audit.record('role.menu_options_replaced', actor.audit, {
      resourceType: 'role',
      resourceId: roleId,
      before: { menuOptions: before.menuOptionIds },
      after: { menuOptions: after.menuOptionIds },
    });
    return after;
  }

  listPermissions(): Promise<PermissionRecord[]> {
    return this.repository.listPermissions();
  }

  /** D1: el rol existe y no es de sistema. */
  private async requireEditable(roleId: string): Promise<RoleRecord> {
    const role = await this.findById(roleId);
    if (role.isSystem) {
      throw new ResourceConflictError(
        'System roles are read-only; duplicate it to create an editable variant',
        [{ roleCode: role.code }],
        ACCESS_ERROR_CODES.systemResourceReadOnly,
      );
    }
    return role;
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    if (await this.repository.roleCodeExists(code)) {
      throw new ResourceConflictError('A role with that code already exists', [{ field: 'code', value: code }]);
    }
  }

  private async assertReferences(permissionIds: string[], menuOptionIds: string[]): Promise<void> {
    const missing = [
      ...missingIds(permissionIds, await this.repository.existingPermissionIds(permissionIds)).map((id) => ({
        resource: 'permission',
        identifier: id,
      })),
      ...missingIds(menuOptionIds, await this.repository.existingMenuOptionIds(menuOptionIds)).map((id) => ({
        resource: 'menuOption',
        identifier: id,
      })),
    ];
    if (missing.length > 0) {
      throw new BusinessRuleViolationError(ACCESS_ERROR_CODES.unknownReference, 'Unknown identifiers', missing);
    }
  }

  private async permissionIdsFor(codes: string[]): Promise<string[]> {
    const wanted = new Set(codes);
    return (await this.repository.listPermissions())
      .filter((permission) => wanted.has(permission.code))
      .map((permission) => permission.id);
  }
}

function roleAuditView(role: RoleRecord): Record<string, unknown> {
  return {
    code: role.code,
    name: role.name,
    description: role.description,
    dataScope: role.dataScope,
    isActive: role.isActive,
    permissions: role.permissionCodes,
    menuOptions: role.menuOptionIds,
  };
}
