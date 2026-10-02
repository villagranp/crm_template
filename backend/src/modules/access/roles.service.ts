import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type PermissionRecord,
  type RoleRecord,
} from './ports/access.repository.port';

/**
 * Gestión de roles.
 *
 * La plantilla expone lectura y reasignación de permisos y opciones; crear o
 * borrar roles se deja a cada proyecto porque suele venir con reglas propias
 * (aprobación, segregación de funciones). Los roles marcados como de sistema
 * pueden reasignarse, pero el seed repone sus asignaciones en cada ejecución:
 * si un proyecto necesita un administrador distinto, crea su propio rol.
 */
@Injectable()
export class RolesService {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}

  list(): Promise<RoleRecord[]> {
    return this.repository.listRoles();
  }

  async findById(roleId: string): Promise<RoleRecord> {
    const role = await this.repository.findRoleById(roleId);

    if (!role) {
      throw new NotFoundException('El rol no existe');
    }

    return role;
  }

  async replacePermissions(roleId: string, permissionIds: string[], actorId: string | null): Promise<RoleRecord> {
    await this.findById(roleId);
    await this.repository.replaceRolePermissions(roleId, permissionIds, actorId);
    return this.findById(roleId);
  }

  async replaceMenuOptions(roleId: string, menuOptionIds: string[], actorId: string | null): Promise<RoleRecord> {
    await this.findById(roleId);
    await this.repository.replaceRoleMenuOptions(roleId, menuOptionIds, actorId);
    return this.findById(roleId);
  }

  listPermissions(): Promise<PermissionRecord[]> {
    return this.repository.listPermissions();
  }
}
