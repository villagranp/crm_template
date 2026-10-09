import type { AuditService } from '@/modules/audit/audit.service';

import type { ActorContext } from './access-rules';
import { MenuOptionsService, validateMenuOptionShape } from './menu-options.service';
import type { AccessRepository, MenuOptionRecord } from './ports/access.repository.port';

const MODULE = { id: 'mod-1', key: 'administracion', name: 'Administración', icon: null, sortOrder: 90 };
const ACTOR: ActorContext = { userId: 'admin', audit: { correlationId: 'c', actorId: 'admin', actorEmail: null, ipAddress: null } };

function option(overrides: Partial<MenuOptionRecord> = {}): MenuOptionRecord {
  return {
    id: 'opt-1',
    key: 'opt-1',
    parentId: null,
    label: 'Opción',
    description: null,
    icon: null,
    path: '/administracion/usuarios',
    kind: 'LINK',
    sortOrder: 10,
    requiredPermissionId: null,
    requiredPermissionCode: null,
    isPublic: false,
    isSystem: false,
    isActive: true,
    module: MODULE,
    ...overrides,
  };
}

function setup(options: MenuOptionRecord[]) {
  const byId = new Map(options.map((item) => [item.id, item]));
  const repository = {
    listMenuOptions: jest.fn(async () => options),
    listModules: jest.fn(async () => [{ ...MODULE, isSystem: true, isActive: true }]),
    findMenuOptionById: jest.fn(async (id: string) => byId.get(id) ?? null),
    menuOptionKeyExists: jest.fn(async () => false),
    createMenuOption: jest.fn(async () => option({ id: 'new' })),
    updateMenuOption: jest.fn(async (id: string) => byId.get(id)!),
    softDeleteMenuOption: jest.fn(async () => undefined),
    countMenuOptionChildren: jest.fn(async () => 0),
    reorderMenuOptions: jest.fn(async () => undefined),
    existingPermissionIds: jest.fn(async (ids: string[]) => ids),
    // La sección crítica se simula ejecutando el trabajo con el mismo repositorio.
    withMenuHierarchyLock: jest.fn(<T>(work: (repo: AccessRepository) => Promise<T>): Promise<T> =>
      work(repository as unknown as AccessRepository),
    ),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new MenuOptionsService(repository as unknown as AccessRepository, audit as unknown as AuditService);
  return { service, repository, audit };
}

describe('validateMenuOptionShape (D6)', () => {
  const shape = { id: null, moduleId: 'mod-1', parentId: null, kind: 'LINK' as const, path: '/administracion/usuarios' };

  it('acepta un LINK hacia una ruta registrada', () => {
    expect(validateMenuOptionShape(shape, null)).toBeNull();
  });

  it('rechaza una ruta no registrada', () => {
    expect(validateMenuOptionShape({ ...shape, path: '/no-existe' }, null)?.code).toBe('ROUTE_NOT_REGISTERED');
  });

  it('exige ruta en un LINK y la prohíbe en un GROUP', () => {
    expect(validateMenuOptionShape({ ...shape, path: null }, null)?.code).toBe('INVALID_MENU_STRUCTURE');
    expect(validateMenuOptionShape({ ...shape, kind: 'GROUP' }, null)?.code).toBe('INVALID_MENU_STRUCTURE');
    expect(validateMenuOptionShape({ ...shape, kind: 'GROUP', path: null }, null)).toBeNull();
  });

  it('el padre debe ser un GROUP del mismo módulo', () => {
    const withParent = { ...shape, parentId: 'p' };
    expect(validateMenuOptionShape(withParent, option({ id: 'p' }))?.code).toBe('INVALID_MENU_STRUCTURE');
    expect(
      validateMenuOptionShape(withParent, option({ id: 'p', kind: 'GROUP', path: null, module: { ...MODULE, id: 'otro' } }))
        ?.code,
    ).toBe('INVALID_MENU_STRUCTURE');
    expect(validateMenuOptionShape(withParent, option({ id: 'p', kind: 'GROUP', path: null }))).toBeNull();
    expect(validateMenuOptionShape(withParent, null)?.code).toBe('UNKNOWN_REFERENCE');
  });
});

describe('MenuOptionsService · D7 opciones de sistema', () => {
  const systemOption = option({ isSystem: true });

  it('no se eliminan', async () => {
    const { service, repository } = setup([systemOption]);

    await expect(service.delete('opt-1', ACTOR)).rejects.toMatchObject({ code: 'SYSTEM_RESOURCE_READ_ONLY' });
    expect(repository.softDeleteMenuOption).not.toHaveBeenCalled();
  });

  it('no cambian de ruta', async () => {
    const { service } = setup([systemOption]);

    await expect(service.update('opt-1', { path: '/administracion/roles' }, ACTOR)).rejects.toMatchObject({
      code: 'SYSTEM_RESOURCE_READ_ONLY',
    });
  });

  it('sí cambian de etiqueta y de estado', async () => {
    const { service, repository } = setup([systemOption]);

    await service.update('opt-1', { label: 'Personas', isActive: false }, ACTOR);
    expect(repository.updateMenuOption).toHaveBeenCalledWith(
      'opt-1',
      expect.objectContaining({ label: 'Personas', isActive: false }),
    );
  });
});

describe('MenuOptionsService · borrado y ciclos', () => {
  it('no elimina una opción con hijas', async () => {
    const { service, repository } = setup([option()]);
    repository.countMenuOptionChildren.mockResolvedValueOnce(2);

    await expect(service.delete('opt-1', ACTOR)).rejects.toMatchObject({ code: 'HAS_CHILDREN' });
  });

  it('elimina con borrado lógico y audita', async () => {
    const { service, repository, audit } = setup([option()]);

    await service.delete('opt-1', ACTOR);
    expect(repository.softDeleteMenuOption).toHaveBeenCalledWith('opt-1');
    expect(audit.record).toHaveBeenCalledWith('menu_option.deleted', expect.anything(), expect.anything());
  });

  it('el reordenado rechaza un ciclo entre grupos', async () => {
    const groupA = option({ id: 'a', key: 'a', kind: 'GROUP', path: null });
    const groupB = option({ id: 'b', key: 'b', kind: 'GROUP', path: null, parentId: 'a' });
    const { service, repository } = setup([groupA, groupB]);

    await expect(
      service.reorder({ items: [{ id: 'a', parentId: 'b', sortOrder: 10 }] }, ACTOR),
    ).rejects.toMatchObject({ code: 'MENU_CYCLE' });
    expect(repository.reorderMenuOptions).not.toHaveBeenCalled();
  });

  it('editar el padre rechaza meter un grupo dentro de su hija', async () => {
    const groupA = option({ id: 'a', key: 'a', kind: 'GROUP', path: null });
    const groupB = option({ id: 'b', key: 'b', kind: 'GROUP', path: null, parentId: 'a' });
    const { service } = setup([groupA, groupB]);

    await expect(service.update('a', { parentId: 'b' }, ACTOR)).rejects.toMatchObject({ code: 'MENU_CYCLE' });
  });

  it('el reordenado válido escribe en bloque y audita cada opción', async () => {
    const group = option({ id: 'g', key: 'g', kind: 'GROUP', path: null });
    const link = option({ id: 'l', key: 'l' });
    const { service, repository, audit } = setup([group, link]);

    await service.reorder({ items: [{ id: 'l', parentId: 'g', sortOrder: 5 }] }, ACTOR);

    expect(repository.reorderMenuOptions).toHaveBeenCalledWith([{ id: 'l', parentId: 'g', sortOrder: 5 }]);
    expect(audit.record).toHaveBeenCalledWith(
      'menu_option.reordered',
      expect.anything(),
      expect.objectContaining({ after: { parentId: 'g', sortOrder: 5 } }),
    );
  });

  it('rechaza una clave repetida al crear', async () => {
    const { service, repository } = setup([]);
    repository.menuOptionKeyExists.mockResolvedValueOnce(true);

    await expect(
      service.create({ moduleId: 'mod-1', key: 'repetida', label: 'X', kind: 'GROUP' }, ACTOR),
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  });
});
