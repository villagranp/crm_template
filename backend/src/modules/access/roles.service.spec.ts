import type { AuditService } from '@/modules/audit/audit.service';

import type { ActorContext } from './access-rules';
import type { AccessService } from './access.service';
import { adminOnlyError } from './admin-only';
import type { AccessRepository, RoleRecord } from './ports/access.repository.port';
import { RolesService } from './roles.service';

function role(overrides: Partial<RoleRecord> = {}): RoleRecord {
  return {
    id: 'role-1',
    code: 'propio',
    name: 'Propio',
    description: null,
    dataScope: 'OWN',
    isSystem: false,
    isActive: true,
    permissionCodes: ['usuarios.ver'],
    menuOptionIds: ['opt-1'],
    userCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(current: RoleRecord, actorIsAdministrador = true) {
  const repository = {
    findRoleById: jest.fn(async () => current),
    roleCodeExists: jest.fn(async () => false),
    createRole: jest.fn(async () => role({ id: 'role-2', code: 'copia' })),
    updateRole: jest.fn(async () => undefined),
    softDeleteRole: jest.fn(async () => undefined),
    replaceRolePermissions: jest.fn(async () => undefined),
    replaceRoleMenuOptions: jest.fn(async () => undefined),
    existingPermissionIds: jest.fn(async (ids: string[]) => ids),
    existingMenuOptionIds: jest.fn(async (ids: string[]) => ids),
    listPermissions: jest.fn(async () => [
      { id: 'perm-1', code: 'usuarios.ver', resource: 'usuarios', action: 'ver', name: 'Ver', moduleKey: null },
      { id: 'perm-2', code: 'roles.ver', resource: 'roles', action: 'ver', name: 'Ver', moduleKey: null },
    ]),
  };
  const audit = { record: jest.fn(async () => undefined) };
  // Doble de AccessService con la regla real de ADR-020: no administrador → ADMIN_ONLY.
  const accessService = {
    assertActorIsAdministrador: jest.fn(async () => {
      if (!actorIsAdministrador) {
        throw adminOnlyError();
      }
    }),
  };
  const service = new RolesService(
    repository as unknown as AccessRepository,
    audit as unknown as AuditService,
    accessService as unknown as AccessService,
  );
  return { service, repository, audit, accessService };
}

const ACTOR: ActorContext = { userId: 'admin', audit: { correlationId: 'c', actorId: 'admin', actorEmail: null, ipAddress: null } };

describe('RolesService · D1 roles de sistema', () => {
  const systemRole = role({ isSystem: true, code: 'administrador' });

  it.each([
    ['editar', (service: RolesService) => service.update('role-1', { name: 'Otro' }, ACTOR)],
    ['eliminar', (service: RolesService) => service.delete('role-1', ACTOR)],
    ['reemplazar permisos', (service: RolesService) => service.replacePermissions('role-1', [], ACTOR)],
    ['reemplazar opciones', (service: RolesService) => service.replaceMenuOptions('role-1', [], ACTOR)],
  ])('no se puede %s', async (_, act) => {
    const { service, repository } = setup(systemRole);

    await expect(act(service)).rejects.toMatchObject({ code: 'SYSTEM_RESOURCE_READ_ONLY' });
    expect(repository.updateRole).not.toHaveBeenCalled();
    expect(repository.softDeleteRole).not.toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
    expect(repository.replaceRoleMenuOptions).not.toHaveBeenCalled();
  });

  it('se duplica en un rol propio con sus permisos y opciones', async () => {
    const { service, repository, audit } = setup(systemRole);

    await service.duplicate('role-1', { code: 'copia', name: 'Copia' }, ACTOR);

    expect(repository.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'copia', permissionIds: ['perm-1'], menuOptionIds: ['opt-1'], dataScope: 'OWN' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'role.duplicated',
      expect.anything(),
      expect.objectContaining({ metadata: { sourceRoleId: 'role-1', sourceRoleCode: 'administrador' } }),
    );
  });
});

describe('RolesService · D2 roles propios', () => {
  it('no elimina un rol con usuarios', async () => {
    const { service, repository } = setup(role({ userCount: 3 }));

    await expect(service.delete('role-1', ACTOR)).rejects.toMatchObject({ code: 'ROLE_IN_USE' });
    expect(repository.softDeleteRole).not.toHaveBeenCalled();
  });

  it('elimina con borrado lógico y audita', async () => {
    const { service, repository, audit } = setup(role());

    await service.delete('role-1', ACTOR);
    expect(repository.softDeleteRole).toHaveBeenCalledWith('role-1');
    expect(audit.record).toHaveBeenCalledWith('role.deleted', expect.anything(), expect.objectContaining({ after: null }));
  });

  it('rechaza un código ya usado, incluso por un rol borrado', async () => {
    const { service, repository } = setup(role());
    repository.roleCodeExists.mockResolvedValueOnce(true);

    await expect(service.create({ code: 'propio', name: 'Propio', dataScope: 'OWN' }, ACTOR)).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
    });
  });

  it('rechaza permisos inexistentes', async () => {
    const { service, repository } = setup(role());
    repository.existingPermissionIds.mockResolvedValueOnce([]);

    await expect(service.replacePermissions('role-1', ['nope'], ACTOR)).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
    });
  });
});

describe('RolesService · ADR-020 cambiar lo que concede un rol es exclusivo del administrador', () => {
  it.each([
    ['crear', (service: RolesService) => service.create({ code: 'nuevo', name: 'Nuevo', dataScope: 'OWN' }, ACTOR)],
    ['duplicar', (service: RolesService) => service.duplicate('role-1', { code: 'copia', name: 'Copia' }, ACTOR)],
    ['reemplazar permisos', (service: RolesService) => service.replacePermissions('role-1', ['perm-1'], ACTOR)],
    ['reemplazar opciones', (service: RolesService) => service.replaceMenuOptions('role-1', ['opt-1'], ACTOR)],
    ['cambiar el alcance de datos', (service: RolesService) => service.update('role-1', { dataScope: 'ORGANIZATION' }, ACTOR)],
    ['desactivar', (service: RolesService) => service.update('role-1', { isActive: false }, ACTOR)],
  ])('un no administrador no puede %s: 403 ADMIN_ONLY sin escribir', async (_, act) => {
    const { service, repository } = setup(role(), false);

    await expect(act(service)).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    expect(repository.createRole).not.toHaveBeenCalled();
    expect(repository.updateRole).not.toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
    expect(repository.replaceRoleMenuOptions).not.toHaveBeenCalled();
  });

  it('un no administrador sí renombra un rol propio sin tocar el alcance ni la activación', async () => {
    const { service, repository } = setup(role(), false);

    await service.update('role-1', { name: 'Otro nombre', dataScope: 'OWN', isActive: true }, ACTOR);
    expect(repository.updateRole).toHaveBeenCalled();
  });

  it('el administrador cambia el alcance de datos', async () => {
    const { service, repository, accessService } = setup(role());

    await service.update('role-1', { dataScope: 'ORGANIZATION' }, ACTOR);
    expect(accessService.assertActorIsAdministrador).toHaveBeenCalledWith('admin');
    expect(repository.updateRole).toHaveBeenCalled();
  });
});
