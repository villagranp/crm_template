import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ResourceConflictError } from '@/common/errors/application-error';

import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';
import type { DirectAssignmentDto } from './dto/assignment.dto';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type AccessUserRecord,
  type Paginated,
} from './ports/access.repository.port';

/**
 * Gestión de usuarios y de sus asignaciones.
 *
 * Reglas que se aplican aquí y no en el controlador, para que valgan también
 * cuando el caso de uso se invoque desde un proceso o una importación:
 * - Un usuario nace con al menos un rol: sin rol no ve nada y el alta parecería
 *   rota.
 * - Las asignaciones directas siempre llevan razón (lo exige el DTO) y se
 *   reemplazan en bloque, no se acumulan.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<AccessUserRecord & { roles: string[] }>> {
    return this.repository.listUsers({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      roleCode: query.roleCode,
      teamId: query.teamId,
    });
  }

  async create(dto: CreateUserDto, actorId: string | null): Promise<AccessUserRecord> {
    if (dto.roleIds.length === 0) {
      throw new BadRequestException('El usuario debe tener al menos un rol asignado');
    }

    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ResourceConflictError('Ya existe un usuario con ese correo');
    }

    return this.repository.createUser({
      email: dto.email.trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      roleIds: dto.roleIds,
      teamIds: dto.teamIds ?? [],
      createdById: actorId,
    });
  }

  async update(userId: string, dto: UpdateUserDto, actorId: string | null): Promise<AccessUserRecord> {
    await this.requireUser(userId);

    return this.repository.updateUser(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      jobTitle: dto.jobTitle,
      phone: dto.phone,
      status: dto.status,
      updatedById: actorId,
    });
  }

  async replaceRoles(userId: string, roleIds: string[], actorId: string | null): Promise<void> {
    await this.requireUser(userId);

    if (roleIds.length === 0) {
      throw new BadRequestException('El usuario debe conservar al menos un rol');
    }

    await this.repository.replaceUserRoles(userId, roleIds, actorId);
  }

  /** Excepciones directas de permisos. Reemplaza el conjunto completo. */
  async replacePermissions(userId: string, assignments: DirectAssignmentDto[], actorId: string | null): Promise<void> {
    await this.requireUser(userId);
    await this.repository.replaceUserPermissions(userId, assignments.map(toAssignmentInput), actorId);
  }

  /** Asignación directa de opciones de menú. Reemplaza el conjunto completo. */
  async replaceMenuOptions(userId: string, assignments: DirectAssignmentDto[], actorId: string | null): Promise<void> {
    await this.requireUser(userId);
    await this.repository.replaceUserMenuOptions(userId, assignments.map(toAssignmentInput), actorId);
  }

  private async requireUser(userId: string): Promise<void> {
    const snapshot = await this.repository.getUserAccessSnapshot(userId);
    if (!snapshot) {
      throw new NotFoundException('El usuario no existe');
    }
  }
}

function toAssignmentInput(assignment: DirectAssignmentDto) {
  return {
    targetId: assignment.targetId,
    effect: assignment.effect,
    reason: assignment.reason,
    expiresAt: assignment.expiresAt ?? null,
  };
}
