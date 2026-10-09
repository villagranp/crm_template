import { AccessDeniedError } from '@/common/errors/application-error';

import { AccessService } from './access.service';
import {
  ADMINISTRATOR_ROLE_CODE,
  assertAssignableByNonAdministrador,
  holdsAdministradorRole,
  isActingAdministrador,
} from './admin-only';
import type { AccessRepository, UserAccessSnapshot, UserStatus } from './ports/access.repository.port';

function snapshot(id: string, roleCode: string, status: UserStatus = 'ACTIVE'): UserAccessSnapshot {
  return {
    user: { id, email: `${id}@example.test`, displayName: id, status, jobTitle: null, teams: [] },
    roles: [{ id: `r-${roleCode}`, code: roleCode, name: roleCode, dataScope: 'OWN', permissionCodes: [] }],
    rolePermissionCodes: [],
    directPermissions: [],
    roleMenuOptionIds: [],
    directMenuOptions: [],
  };
}

describe('ADR-020 · reglas puras', () => {
  it('el rol que habilita es administrador', () => {
    expect(ADMINISTRATOR_ROLE_CODE).toBe('administrador');
  });

  it('ejerce como administrador sólo con la cuenta ACTIVE y el rol vigente', () => {
    expect(isActingAdministrador(snapshot('a', 'administrador'))).toBe(true);
    expect(isActingAdministrador(snapshot('a', 'administrador', 'SUSPENDED'))).toBe(false);
    expect(isActingAdministrador(snapshot('a', 'gestor-accesos'))).toBe(false);
    expect(isActingAdministrador(null)).toBe(false);
  });

  it('un administrador suspendido sigue siendo administrador como objetivo', () => {
    expect(holdsAdministradorRole(snapshot('a', 'administrador', 'SUSPENDED'))).toBe(true);
  });

  it('alta por un no administrador: sólo roles sin permisos', () => {
    expect(() => assertAssignableByNonAdministrador([])).not.toThrow();
    expect(() => assertAssignableByNonAdministrador(['role-admin'])).toThrow(
      expect.objectContaining({ code: 'ADMIN_ONLY' }),
    );
  });
});

describe('ADR-020 · AccessService', () => {
  const snapshots: Record<string, UserAccessSnapshot> = {
    admin: snapshot('admin', 'administrador'),
    gestor: snapshot('gestor', 'gestor-accesos'),
    'otro-admin': snapshot('otro-admin', 'administrador', 'SUSPENDED'),
    usuario: snapshot('usuario', 'usuario'),
  };
  const repository = {
    getUserAccessSnapshot: jest.fn(async (id: string) => snapshots[id] ?? null),
  } as unknown as AccessRepository;
  const service = new AccessService(repository);

  it('assertActorIsAdministrador: 403 ADMIN_ONLY para quien no lo es, o sin actor local', async () => {
    await expect(service.assertActorIsAdministrador('admin')).resolves.toBeUndefined();
    await expect(service.assertActorIsAdministrador('gestor')).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(service.assertActorIsAdministrador(null)).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
  });

  it('assertActorMayActOn: sobre un administrador (aunque esté suspendido) exige serlo', async () => {
    await expect(service.assertActorMayActOn('gestor', 'otro-admin')).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    await expect(service.assertActorMayActOn('admin', 'otro-admin')).resolves.toBeUndefined();
  });

  it('assertActorMayActOn: sobre un no administrador o uno inexistente no exige nada', async () => {
    await expect(service.assertActorMayActOn('gestor', 'usuario')).resolves.toBeUndefined();
    await expect(service.assertActorMayActOn('gestor', 'no-existe')).resolves.toBeUndefined();
  });
});
