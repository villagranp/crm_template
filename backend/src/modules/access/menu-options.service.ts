import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { BusinessRuleViolationError, ResourceConflictError } from '@/common/errors/application-error';
import { AuditService } from '@/modules/audit/audit.service';

import { ACCESS_ERROR_CODES, type ActorContext, findCycle, missingIds } from './access-rules';
import type { CreateMenuOptionDto, ReorderMenuOptionsDto, UpdateMenuOptionDto } from './dto/menu-option.dto';
import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type MenuOptionKind,
  type MenuOptionRecord,
  type ModuleRecord,
  type UpdateMenuOptionInput,
} from './ports/access.repository.port';
import { isRegisteredRoute, listRegisteredRoutes, type RegisteredRoute } from './route-registry';

/** Estado final de una opción tras aplicar un cambio, para validarlo entero. */
export interface MenuOptionShape {
  id: string | null;
  moduleId: string;
  parentId: string | null;
  kind: MenuOptionKind;
  path: string | null;
}

/**
 * Validación estructural pura de una opción (D6, D7). Devuelve el error o `null`.
 *
 * - `LINK` lleva una ruta registrada; `GROUP` no lleva ruta.
 * - El padre existe, es `GROUP`, es del mismo módulo y no es la propia opción.
 */
export function validateMenuOptionShape(
  shape: MenuOptionShape,
  parent: MenuOptionRecord | null | undefined,
): BusinessRuleViolationError | null {
  if (shape.kind === 'GROUP' && shape.path) {
    return new BusinessRuleViolationError(ACCESS_ERROR_CODES.invalidMenuStructure, 'A GROUP option has no path', [
      { field: 'path', issue: 'Un grupo no lleva ruta.' },
    ]);
  }
  if (shape.kind === 'LINK') {
    if (!shape.path) {
      return new BusinessRuleViolationError(ACCESS_ERROR_CODES.invalidMenuStructure, 'A LINK option needs a path', [
        { field: 'path', issue: 'Una opción navegable necesita una ruta.' },
      ]);
    }
    if (!isRegisteredRoute(shape.path)) {
      return new BusinessRuleViolationError(ACCESS_ERROR_CODES.routeNotRegistered, 'The path is not a registered route', [
        { field: 'path', value: shape.path },
      ]);
    }
  }
  if (shape.parentId) {
    if (shape.parentId === shape.id) {
      return new BusinessRuleViolationError(ACCESS_ERROR_CODES.menuCycle, 'An option cannot be its own parent', [
        { field: 'parentId' },
      ]);
    }
    if (!parent) {
      return new BusinessRuleViolationError(ACCESS_ERROR_CODES.unknownReference, 'Unknown parent option', [
        { resource: 'menuOption', identifier: shape.parentId },
      ]);
    }
    if (parent.kind !== 'GROUP' || parent.module.id !== shape.moduleId) {
      return new BusinessRuleViolationError(
        ACCESS_ERROR_CODES.invalidMenuStructure,
        'The parent must be a GROUP of the same module',
        [{ field: 'parentId', issue: 'El padre debe ser un grupo del mismo módulo.' }],
      );
    }
  }
  return null;
}

/**
 * Catálogo de opciones de menú (PLAN-ADMIN D6, D7).
 *
 * - `key` es inmutable y única (también frente a opciones borradas).
 * - Las opciones de sistema no se eliminan ni cambian de ruta, de tipo ni de
 *   permiso: las usa el propio código. Sí admiten etiqueta, icono, orden y
 *   activación (la semilla repone etiqueta y orden en cada despliegue).
 * - Eliminar es borrado lógico y sólo sin hijas.
 * - Mover y reordenar en bloque con prevención de ciclos.
 */
@Injectable()
export class MenuOptionsService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<MenuOptionRecord[]> {
    return this.repository.listMenuOptions();
  }

  listRoutes(): readonly RegisteredRoute[] {
    return listRegisteredRoutes();
  }

  listModules(): Promise<ModuleRecord[]> {
    return this.repository.listModules();
  }

  async create(dto: CreateMenuOptionDto, actor: ActorContext): Promise<MenuOptionRecord> {
    const modules = await this.repository.listModules();
    if (!modules.some((module) => module.id === dto.moduleId)) {
      throw unknownReference('module', dto.moduleId);
    }

    const shape: MenuOptionShape = {
      id: null,
      moduleId: dto.moduleId,
      parentId: dto.parentId ?? null,
      kind: dto.kind,
      path: dto.path ?? null,
    };
    const parent = shape.parentId ? await this.repository.findMenuOptionById(shape.parentId) : null;
    throwIf(validateMenuOptionShape(shape, parent));
    await assertPermissionExists(this.repository, dto.requiredPermissionId);

    if (await this.repository.menuOptionKeyExists(dto.key)) {
      throw new ResourceConflictError('A menu option with that key already exists', [{ field: 'key', value: dto.key }]);
    }

    const option = await this.repository.createMenuOption({
      moduleId: dto.moduleId,
      parentId: shape.parentId,
      key: dto.key,
      label: dto.label.trim(),
      description: dto.description?.trim() ?? null,
      icon: dto.icon ?? null,
      kind: dto.kind,
      path: shape.path,
      sortOrder: dto.sortOrder ?? 0,
      requiredPermissionId: dto.requiredPermissionId ?? null,
      isPublic: dto.isPublic ?? false,
      isActive: dto.isActive ?? true,
    });

    await this.audit.record('menu_option.created', actor.audit, {
      resourceType: 'menu_option',
      resourceId: option.id,
      before: null,
      after: menuOptionAuditView(option),
    });
    return option;
  }

  /**
   * Cambiar de padre puede crear un ciclo junto con otro movimiento simultáneo
   * (A bajo B y B bajo A, cada uno válido por separado). Por eso la lectura del
   * árbol, la comprobación y la escritura van en la sección crítica de la
   * jerarquía del menú (D7).
   */
  async update(menuOptionId: string, dto: UpdateMenuOptionDto, actor: ActorContext): Promise<MenuOptionRecord> {
    const { current, updated } = await this.repository.withMenuHierarchyLock((repository) =>
      this.applyUpdate(repository, menuOptionId, dto),
    );

    await this.audit.record('menu_option.updated', actor.audit, {
      resourceType: 'menu_option',
      resourceId: menuOptionId,
      before: menuOptionAuditView(current),
      after: menuOptionAuditView(updated),
    });
    return updated;
  }

  private async applyUpdate(
    repository: AccessRepository,
    menuOptionId: string,
    dto: UpdateMenuOptionDto,
  ): Promise<{ current: MenuOptionRecord; updated: MenuOptionRecord }> {
    const current = await findOrThrow(repository, menuOptionId);

    if (current.isSystem) {
      const locked: (keyof UpdateMenuOptionDto)[] = ['path', 'kind', 'requiredPermissionId', 'parentId', 'isPublic'];
      const changed = locked.filter((field) => dto[field] !== undefined && dto[field] !== current[field]);
      if (changed.length > 0) {
        throw new ResourceConflictError(
          'System menu options cannot change path, kind, permission, parent or visibility',
          changed.map((field) => ({ field })),
          ACCESS_ERROR_CODES.systemResourceReadOnly,
        );
      }
    }

    const shape: MenuOptionShape = {
      id: current.id,
      moduleId: current.module.id,
      parentId: dto.parentId === undefined ? current.parentId : dto.parentId,
      kind: dto.kind ?? current.kind,
      // Pasar a GROUP sin indicar ruta la quita: un grupo no lleva ruta.
      path: dto.path === undefined ? (dto.kind === 'GROUP' ? null : current.path) : dto.path,
    };
    const parent = shape.parentId ? await repository.findMenuOptionById(shape.parentId) : null;
    throwIf(validateMenuOptionShape(shape, parent));
    if (shape.parentId !== current.parentId) {
      assertNoCycle([{ id: current.id, parentId: shape.parentId }], await repository.listMenuOptions());
    }
    if (dto.kind === 'LINK' && current.kind === 'GROUP' && (await repository.countMenuOptionChildren(current.id)) > 0) {
      throw new ResourceConflictError('The group has child options', [], ACCESS_ERROR_CODES.hasChildren);
    }
    await assertPermissionExists(repository, dto.requiredPermissionId);

    const input: UpdateMenuOptionInput = {
      parentId: dto.parentId,
      label: dto.label?.trim(),
      description: dto.description === undefined ? undefined : (dto.description?.trim() ?? null),
      icon: dto.icon,
      kind: dto.kind,
      path: shape.path === current.path ? undefined : shape.path,
      sortOrder: dto.sortOrder,
      requiredPermissionId: dto.requiredPermissionId,
      isPublic: dto.isPublic,
      isActive: dto.isActive,
    };
    return { current, updated: await repository.updateMenuOption(menuOptionId, input) };
  }

  /** D7: borrado lógico; nunca de sistema ni con hijas. */
  async delete(menuOptionId: string, actor: ActorContext): Promise<void> {
    const option = await this.findById(menuOptionId);

    if (option.isSystem) {
      throw new ResourceConflictError(
        'System menu options cannot be deleted',
        [{ key: option.key }],
        ACCESS_ERROR_CODES.systemResourceReadOnly,
      );
    }
    const children = await this.repository.countMenuOptionChildren(menuOptionId);
    if (children > 0) {
      throw new ResourceConflictError('The option has child options', [{ children }], ACCESS_ERROR_CODES.hasChildren);
    }

    await this.repository.softDeleteMenuOption(menuOptionId);
    await this.audit.record('menu_option.deleted', actor.audit, {
      resourceType: 'menu_option',
      resourceId: menuOptionId,
      before: menuOptionAuditView(option),
      after: null,
    });
  }

  /**
   * Orden y padre en bloque. Valida el árbol resultante completo antes de
   * escribir, en la sección crítica de la jerarquía del menú (ver `update`).
   */
  async reorder(dto: ReorderMenuOptionsDto, actor: ActorContext): Promise<MenuOptionRecord[]> {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BusinessRuleViolationError(ACCESS_ERROR_CODES.invalidMenuStructure, 'Duplicated option in the order', [
        { field: 'items' },
      ]);
    }

    const previous = await this.repository.withMenuHierarchyLock((repository) => applyReorder(repository, dto));

    for (const item of dto.items) {
      const option = previous.get(item.id)!;
      await this.audit.record('menu_option.reordered', actor.audit, {
        resourceType: 'menu_option',
        resourceId: item.id,
        before: { parentId: option.parentId, sortOrder: option.sortOrder },
        after: { parentId: item.parentId, sortOrder: item.sortOrder },
      });
    }

    return this.repository.listMenuOptions();
  }

  findById(menuOptionId: string): Promise<MenuOptionRecord> {
    return findOrThrow(this.repository, menuOptionId);
  }
}

/** Valida y aplica un reordenamiento. Devuelve el estado previo de cada opción, para auditar. */
async function applyReorder(
  repository: AccessRepository,
  dto: ReorderMenuOptionsDto,
): Promise<Map<string, MenuOptionRecord>> {
  const all = await repository.listMenuOptions();
  const byId = new Map(all.map((option) => [option.id, option]));
  const missing = missingIds(
    dto.items.map((item) => item.id),
    [...byId.keys()],
  );
  if (missing.length > 0) {
    throw unknownReference('menuOption', missing[0] ?? '');
  }

  for (const item of dto.items) {
    const option = byId.get(item.id)!;
    if (option.isSystem && item.parentId !== option.parentId) {
      throw new ResourceConflictError(
        'System menu options cannot change parent',
        [{ key: option.key }],
        ACCESS_ERROR_CODES.systemResourceReadOnly,
      );
    }
    const parent = item.parentId ? byId.get(item.parentId) : null;
    throwIf(
      validateMenuOptionShape(
        { id: option.id, moduleId: option.module.id, parentId: item.parentId, kind: option.kind, path: option.path },
        parent,
      ),
    );
  }

  assertNoCycle(dto.items, all);
  await repository.reorderMenuOptions(dto.items);
  return byId;
}

async function findOrThrow(repository: AccessRepository, menuOptionId: string): Promise<MenuOptionRecord> {
  const option = await repository.findMenuOptionById(menuOptionId);
  if (!option) {
    throw new NotFoundException('La opción de menú no existe');
  }
  return option;
}

/** Superpone los cambios al árbol dado y busca un ciclo. */
function assertNoCycle(changes: { id: string; parentId: string | null }[], options: MenuOptionRecord[]): void {
  const overrides = new Map(changes.map((change) => [change.id, change.parentId]));
  const nodes = options.map((option) => ({
    id: option.id,
    parentId: overrides.has(option.id) ? (overrides.get(option.id) ?? null) : option.parentId,
  }));

  if (findCycle(nodes)) {
    throw new BusinessRuleViolationError(
      ACCESS_ERROR_CODES.menuCycle,
      'An option cannot be placed inside itself or one of its descendants',
    );
  }
}

async function assertPermissionExists(
  repository: AccessRepository,
  permissionId: string | null | undefined,
): Promise<void> {
  if (!permissionId) {
    return;
  }
  const existing = await repository.existingPermissionIds([permissionId]);
  if (existing.length === 0) {
    throw unknownReference('permission', permissionId);
  }
}

function throwIf(error: Error | null): void {
  if (error) {
    throw error;
  }
}

function unknownReference(resource: string, identifier: string): BusinessRuleViolationError {
  return new BusinessRuleViolationError(ACCESS_ERROR_CODES.unknownReference, `Unknown ${resource}`, [
    { resource, identifier },
  ]);
}

function menuOptionAuditView(option: MenuOptionRecord): Record<string, unknown> {
  return {
    key: option.key,
    moduleKey: option.module.key,
    parentId: option.parentId,
    label: option.label,
    description: option.description,
    icon: option.icon,
    kind: option.kind,
    path: option.path,
    sortOrder: option.sortOrder,
    requiredPermission: option.requiredPermissionCode,
    isPublic: option.isPublic,
    isActive: option.isActive,
  };
}
