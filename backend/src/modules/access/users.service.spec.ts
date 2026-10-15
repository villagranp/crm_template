import { BadRequestException } from '@nestjs/common';

import { PermissionDeniedError, ResourceConflictError } from '@/common/errors/application-error';
import type { AuditService } from '@/modules/audit/audit.service';
import type { InitialCredentialService } from '@/modules/auth/initial-credential.service';

import type { ActorContext } from './access-rules';
import type { AccessService } from './access.service';
import { adminOnlyError } from './admin-only';
import type {
  AccessRepository,
  DirectAssignmentInput,
  UpdateUserInput,
  UserAccessSnapshot,
  UserDetailRecord,
} from './ports/access.repository.port';
import { UsersService } from './users.service';

const ADMIN_ROLE = { id: 'role-admin', code: 'administrador', name: 'Administrador', isSystem: true, expiresAt: null };
const USER_ROLE = { id: 'role-user', code: 'usuario', name: 'Usuario', isSystem: true, expiresAt: null };
const ACCESS_MANAGER_ROLE = { id: 'role-gestor', code: 'gestor-accesos', name: 'Gestor', isSystem: true, expiresAt: null };
const ADVISOR_ROLE = { id: 'role-asesor', code: 'asesor', name: 'Asesor', isSystem: true, expiresAt: null };
const ROLES_BY_ID = new Map([ADMIN_ROLE, USER_ROLE, ACCESS_MANAGER_ROLE, ADVISOR_ROLE].map((role) => [role.id, role]));

const GT = { id: 'country-gt', isoCode: 'GT', name: 'Guatemala' };
const SV = { id: 'country-sv', isoCode: 'SV', name: 'El Salvador' };
/** Países del doble: `country-off` existe pero está inactivo. */
const COUNTRIES = new Map([
  [GT.id, { ...GT, isActive: true }],
  [SV.id, { ...SV, isActive: true }],
  ['country-off', { id: 'country-off', isoCode: 'NI', name: 'Nicaragua', isActive: false }],
]);

/** Permisos que trae cada rol en este doble de pruebas. */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrador: ['usuarios.editar', 'roles.editar', 'equipos.editar'],
  'gestor-accesos': ['usuarios.editar', 'roles.editar'],
  asesor: ['clientes.ver', 'visitas.crear'],
  usuario: [],
};

/** Ids de permiso → código. */
const PERMISSION_CODES: Record<string, string> = {
  'perm-usuarios-editar': 'usuarios.editar',
  'perm-roles-editar': 'roles.editar',
  'perm-usuarios-exportar': 'usuarios.exportar',
};

const REASON = 'Motivo suficientemente largo';

function detail(overrides: Partial<UserDetailRecord> = {}): UserDetailRecord {
  return {
    id: 'target',
    email: 'persona@example.test',
    firstName: 'Persona',
    lastName: 'Prueba',
    displayName: 'Persona Prueba',
    jobTitle: null,
    phone: null,
    employeeCode: null,
    country: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    teams: [],
    roles: [ADMIN_ROLE],
    directPermissions: [],
    directMenuOptions: [],
    hasCompletedActivation: true,
    ...overrides,
  };
}

/** Misma forma que la instantánea real: roles vigentes con sus permisos y excepciones directas. */
function snapshotOf(user: UserDetailRecord): UserAccessSnapshot {
  const roles = user.roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    dataScope: 'OWN' as const,
    permissionCodes: ROLE_PERMISSIONS[role.code] ?? [],
  }));
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      jobTitle: user.jobTitle,
      teams: user.teams,
    },
    roles,
    rolePermissionCodes: [...new Set(roles.flatMap((role) => role.permissionCodes))],
    directPermissions: user.directPermissions.map((item) => ({
      code: item.code,
      effect: item.effect,
      reason: item.reason,
      expiresAt: item.expiresAt,
    })),
    roleMenuOptionIds: [],
    directMenuOptions: [],
  };
}

/**
 * Repositorio en memoria. `withAdminInvariantLock` simula la transacción: si
 * el trabajo lanza, restaura el estado previo (como el ROLLBACK real).
 */
function setup(user: UserDetailRecord, others: UserDetailRecord[] = [detail({ id: 'otro-admin' })]) {
  const users = new Map<string, UserDetailRecord>([user, ...others].map((item) => [item.id, item]));
  const patch = (id: string, changes: Partial<UserDetailRecord>) => {
    users.set(id, { ...users.get(id)!, ...changes });
  };

  const repository = {
    findUserDetail: jest.fn(async (id: string) => users.get(id) ?? null),
    getUserAccessSnapshot: jest.fn(async (id: string) => {
      const found = users.get(id);
      return found ? snapshotOf(found) : null;
    }),
    listActiveUserIdsWithRole: jest.fn(async (code: string, excluding: string | null) =>
      [...users.values()]
        .filter((item) => item.id !== excluding && item.status === 'ACTIVE' && item.roles.some((r) => r.code === code))
        .map((item) => item.id),
    ),
    setUserStatus: jest.fn(async (id: string, status: UserDetailRecord['status']) => patch(id, { status })),
    replaceUserRoles: jest.fn(async (id: string, roleIds: string[]) =>
      patch(id, { roles: roleIds.map((roleId) => ROLES_BY_ID.get(roleId)!) }),
    ),
    replaceUserPermissions: jest.fn(async (id: string, assignments: DirectAssignmentInput[]) =>
      patch(id, {
        directPermissions: assignments.map((assignment) => ({
          targetId: assignment.targetId,
          code: PERMISSION_CODES[assignment.targetId] ?? assignment.targetId,
          name: '',
          effect: assignment.effect,
          reason: assignment.reason,
          expiresAt: assignment.expiresAt ?? null,
          createdAt: new Date(),
        })),
      }),
    ),
    replaceUserMenuOptions: jest.fn(async () => undefined),
    existingRoleIds: jest.fn(async (ids: string[]) => ids),
    existingPermissionIds: jest.fn(async (ids: string[]) => ids),
    existingMenuOptionIds: jest.fn(async (ids: string[]) => ids),
    existingTeamIds: jest.fn(async (ids: string[]) => ids),
    findRoleIdsGrantingPermissions: jest.fn(async (ids: string[]) =>
      ids.filter((id) => (ROLE_PERMISSIONS[ROLES_BY_ID.get(id)?.code ?? ''] ?? []).length > 0),
    ),
    findUserByEmail: jest.fn(async () => null),
    findUserIdByEmployeeCode: jest.fn(
      async (code: string) => [...users.values()].find((item) => item.employeeCode === code)?.id ?? null,
    ),
    findCountry: jest.fn(async (id: string) => COUNTRIES.get(id) ?? null),
    findRoleGrants: jest.fn(async (ids: string[]) =>
      ids
        .map((id) => ROLES_BY_ID.get(id))
        .filter((role) => role !== undefined)
        .map((role) => ({ id: role.id, code: role.code, permissionCodes: ROLE_PERMISSIONS[role.code] ?? [] })),
    ),
    updateUser: jest.fn(async (id: string, input: UpdateUserInput) => {
      const changes: Partial<UserDetailRecord> = {};
      if (input.jobTitle !== undefined) changes.jobTitle = input.jobTitle;
      if (input.phone !== undefined) changes.phone = input.phone;
      if (input.employeeCode !== undefined) changes.employeeCode = input.employeeCode;
      if (input.countryId !== undefined) {
        const country = input.countryId ? COUNTRIES.get(input.countryId) : undefined;
        changes.country = country ? { id: country.id, isoCode: country.isoCode, name: country.name } : null;
      }
      patch(id, changes);
      return snapshotOf(users.get(id)!).user;
    }),
    createUser: jest.fn(async () => ({
      id: 'nuevo',
      email: 'nuevo@example.test',
      displayName: 'Nuevo',
      status: 'INVITED' as const,
      jobTitle: null,
      teams: [],
    })),
    withAdminInvariantLock: jest.fn(async <T>(work: (repo: AccessRepository) => Promise<T>): Promise<T> => {
      const backup = new Map(users);
      try {
        return await work(repository as unknown as AccessRepository);
      } catch (error) {
        users.clear();
        backup.forEach((value, key) => users.set(key, value));
        throw error;
      }
    }),
  };
  const authRepository = {
    revokeAllUserSessions: jest.fn(async () => 2),
    findAccountByUserId: jest.fn(async () => ({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      credential: {
        id: 'cred-1',
        passwordHash: 'hash',
        mustChangePassword: false,
        expiresAt: null,
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    })),
    clearFailedAttempts: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const actorPermissions = new Set<string>(['usuarios.crear']);
  // ADR-020 con la regla real: `actorState.isAdministrador` decide; el
  // objetivo es administrador si tiene el rol en el repositorio en memoria.
  const actorState = { isAdministrador: true };
  const accessService = {
    getEffectivePermissions: jest.fn(async () => actorPermissions),
    isAdministrador: jest.fn(async () => actorState.isAdministrador),
    assertActorIsAdministrador: jest.fn(async () => {
      if (!actorState.isAdministrador) {
        throw adminOnlyError();
      }
    }),
    assertActorMayActOn: jest.fn(async (_actorId: string | null, targetId: string) => {
      const target = users.get(targetId);
      if (target?.roles.some((role) => role.code === 'administrador') && !actorState.isAdministrador) {
        throw adminOnlyError();
      }
    }),
  };
  const initialCredentials = { assignDefaultPassword: jest.fn(async () => undefined) };
  const service = new UsersService(
    repository as unknown as AccessRepository,
    authRepository,
    initialCredentials as unknown as InitialCredentialService,
    audit as unknown as AuditService,
    accessService as unknown as AccessService,
  );
  return { service, repository, authRepository, audit, users, actorPermissions, actorState, accessService };
}

function actor(userId: string): ActorContext {
  return { userId, audit: { correlationId: 'corr', actorId: userId, actorEmail: null, ipAddress: null } };
}

function deny(permissionId: string) {
  return { targetId: permissionId, effect: 'DENY' as const, reason: REASON };
}

async function conflictCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ResourceConflictError) {
      return error.code;
    }
    throw error;
  }
  throw new Error('No lanzó');
}

describe('UsersService · suspender (D3, D4)', () => {
  it('nadie se suspende a sí mismo', async () => {
    const { service, repository } = setup(detail({ id: 'yo', roles: [USER_ROLE] }));

    expect(await conflictCode(service.suspend('yo', undefined, actor('yo')))).toBe('SELF_LOCKOUT');
    expect(repository.setUserStatus).not.toHaveBeenCalled();
  });

  it('no suspende al último administrador activo, y no deja nada escrito', async () => {
    const { service, users, authRepository } = setup(detail(), []);

    expect(await conflictCode(service.suspend('target', undefined, actor('otro')))).toBe('LAST_ADMIN');
    expect(users.get('target')?.status).toBe('ACTIVE');
    expect(authRepository.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('otro administrador con DENY de un permiso crítico no cuenta como relevo', async () => {
    const crippled = detail({
      id: 'otro-admin',
      directPermissions: [
        {
          targetId: 'perm-roles-editar',
          code: 'roles.editar',
          name: '',
          effect: 'DENY',
          reason: REASON,
          expiresAt: null,
          createdAt: new Date(),
        },
      ],
    });
    const { service } = setup(detail(), [crippled]);

    expect(await conflictCode(service.suspend('target', undefined, actor('otro')))).toBe('LAST_ADMIN');
  });

  it('un administrador que no está activo no cuenta como último', async () => {
    const { service, repository } = setup(detail({ status: 'INVITED' }), []);

    await service.suspend('target', undefined, actor('otro'));
    expect(repository.setUserStatus).toHaveBeenCalledWith('target', 'SUSPENDED', 'otro');
    expect(repository.listActiveUserIdsWithRole).not.toHaveBeenCalled();
  });

  it('suspende dentro de la sección crítica, revoca todas las sesiones y audita', async () => {
    const { service, repository, authRepository, audit } = setup(detail({ roles: [USER_ROLE] }));

    const result = await service.suspend('target', 'Revisión de un incidente', actor('otro'));

    expect(result.status).toBe('SUSPENDED');
    expect(repository.withAdminInvariantLock).toHaveBeenCalledTimes(1);
    expect(repository.setUserStatus).toHaveBeenCalledWith('target', 'SUSPENDED', 'otro');
    expect(authRepository.revokeAllUserSessions).toHaveBeenCalledWith('target', 'account_disabled', expect.any(Date));
    expect(audit.record).toHaveBeenCalledWith(
      'user.suspended',
      expect.anything(),
      expect.objectContaining({
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
        metadata: { revokedSessions: 2, reason: 'Revisión de un incidente' },
      }),
    );
  });

  it('no suspende dos veces', async () => {
    const { service } = setup(detail({ status: 'SUSPENDED', roles: [USER_ROLE] }));

    expect(await conflictCode(service.suspend('target', undefined, actor('otro')))).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('UsersService · reactivar (D4)', () => {
  it('vuelve a ACTIVE si completó la activación', async () => {
    const { service, authRepository } = setup(detail({ status: 'SUSPENDED' }));
    expect((await service.reactivate('target', undefined, actor('otro'))).status).toBe('ACTIVE');
    expect(authRepository.clearFailedAttempts).not.toHaveBeenCalled();
  });

  it('vuelve a INVITED si nunca fijó su contraseña', async () => {
    const { service } = setup(detail({ status: 'SUSPENDED', hasCompletedActivation: false }));
    expect((await service.reactivate('target', undefined, actor('otro'))).status).toBe('INVITED');
  });

  it('reactivar a un LOCKED limpia el bloqueo de su credencial', async () => {
    const { service, authRepository, audit } = setup(detail({ status: 'LOCKED', roles: [USER_ROLE] }));

    expect((await service.reactivate('target', undefined, actor('otro'))).status).toBe('ACTIVE');
    expect(authRepository.clearFailedAttempts).toHaveBeenCalledWith('cred-1');
    expect(audit.record).toHaveBeenCalledWith(
      'user.reactivated',
      expect.anything(),
      expect.objectContaining({ metadata: { reason: null, clearedLockout: true } }),
    );
  });

  it('rechaza reactivar a alguien activo', async () => {
    const { service } = setup(detail());
    expect(await conflictCode(service.reactivate('target', undefined, actor('otro')))).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('UsersService · reemplazar roles (D3)', () => {
  it('nadie se quita su propio rol de administrador', async () => {
    const { service, repository } = setup(detail({ id: 'yo' }));

    expect(await conflictCode(service.replaceRoles('yo', ['role-user'], actor('yo')))).toBe('SELF_LOCKOUT');
    expect(repository.replaceUserRoles).not.toHaveBeenCalled();
  });

  it('puede cambiar sus otros roles conservando el de administrador', async () => {
    const { service, repository } = setup(detail({ id: 'yo' }));

    await service.replaceRoles('yo', ['role-admin', 'role-user'], actor('yo'));
    expect(repository.replaceUserRoles).toHaveBeenCalled();
  });

  it('no quita el rol al último administrador activo, y deshace el cambio', async () => {
    const { service, users } = setup(detail(), []);

    expect(await conflictCode(service.replaceRoles('target', ['role-user'], actor('otro')))).toBe('LAST_ADMIN');
    expect(users.get('target')?.roles).toEqual([ADMIN_ROLE]);
  });

  it('cambiar al último administrador a otro rol con los mismos permisos también es LAST_ADMIN', async () => {
    const { service } = setup(detail(), []);

    expect(await conflictCode(service.replaceRoles('target', ['role-gestor'], actor('otro')))).toBe('LAST_ADMIN');
  });

  it('quita el rol si queda otro administrador activo, y audita la diferencia', async () => {
    const { service, audit } = setup(detail());

    await service.replaceRoles('target', ['role-user'], actor('otro'));
    expect(audit.record).toHaveBeenCalledWith(
      'user.roles_replaced',
      expect.anything(),
      expect.objectContaining({ before: { roles: ['administrador'] }, after: { roles: ['usuario'] } }),
    );
  });

  it('exige al menos un rol', async () => {
    const { service } = setup(detail({ roles: [USER_ROLE] }));
    await expect(service.replaceRoles('target', [], actor('otro'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza roles inexistentes', async () => {
    const { service, repository } = setup(detail({ roles: [USER_ROLE] }));
    repository.existingRoleIds.mockResolvedValueOnce([]);

    await expect(service.replaceRoles('target', ['no-existe'], actor('otro'))).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
    });
  });
});

describe('UsersService · excepciones directas (D3, D5)', () => {
  it('rechaza una caducidad ya vencida', async () => {
    const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

    await expect(
      service.replacePermissions(
        'target',
        [{ targetId: 'p1', effect: 'GRANT', reason: REASON, expiresAt: new Date(Date.now() - 1000) }],
        actor('otro'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceUserPermissions).not.toHaveBeenCalled();
  });

  it('SELF_LOCKOUT: nadie se deniega a sí mismo usuarios.editar, aunque queden otros administradores', async () => {
    const { service, users } = setup(detail({ id: 'yo' }));

    expect(await conflictCode(service.replacePermissions('yo', [deny('perm-usuarios-editar')], actor('yo')))).toBe(
      'SELF_LOCKOUT',
    );
    expect(users.get('yo')?.directPermissions).toEqual([]);
  });

  it('LAST_ADMIN: un DENY de un permiso crítico al último administrador se rechaza y no queda escrito', async () => {
    const { service, users } = setup(detail(), []);

    expect(
      await conflictCode(service.replacePermissions('target', [deny('perm-roles-editar')], actor('otro'))),
    ).toBe('LAST_ADMIN');
    expect(users.get('target')?.directPermissions).toEqual([]);
  });

  it('LAST_ADMIN también cuando el último administrador se deniega a sí mismo roles.editar', async () => {
    const { service } = setup(detail({ id: 'yo' }), []);

    expect(await conflictCode(service.replacePermissions('yo', [deny('perm-roles-editar')], actor('yo')))).toBe(
      'LAST_ADMIN',
    );
  });

  it('permite el DENY si otro administrador conserva los permisos críticos', async () => {
    const { service, users, audit } = setup(detail());

    await service.replacePermissions('target', [deny('perm-roles-editar')], actor('otro'));
    expect(users.get('target')?.directPermissions.map((item) => item.code)).toEqual(['roles.editar']);
    expect(audit.record).toHaveBeenCalledWith('user.permissions_replaced', expect.anything(), expect.anything());
  });

  it('un DENY sobre un permiso no crítico no activa el invariante', async () => {
    const { service, repository } = setup(detail(), []);

    await service.replacePermissions('target', [deny('perm-usuarios-exportar')], actor('otro'));
    expect(repository.listActiveUserIdsWithRole).not.toHaveBeenCalled();
  });

  it('las opciones de menú directas pasan por la misma sección crítica', async () => {
    const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

    await service.replaceMenuOptions('target', [{ targetId: 'm1', effect: 'DENY', reason: REASON }], actor('otro'));
    expect(repository.withAdminInvariantLock).toHaveBeenCalledTimes(1);
    expect(repository.replaceUserMenuOptions).toHaveBeenCalled();
  });
});

describe('UsersService · alta con equipos', () => {
  const dto = { email: 'nuevo@example.test', firstName: 'Nuevo', lastName: 'Usuario', roleIds: ['role-user'] };

  it('teamIds exige equipos.editar: 403 PERMISSION_DENIED sin escribir nada', async () => {
    const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

    const error: unknown = await service.create({ ...dto, teamIds: ['team-1'] }, actor('actor')).catch((caught) => caught);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).details).toEqual([{ requiredPermission: 'equipos.editar' }]);
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('rechaza equipos inexistentes o eliminados con UNKNOWN_REFERENCE', async () => {
    const { service, repository, actorPermissions } = setup(detail({ roles: [USER_ROLE] }));
    actorPermissions.add('equipos.editar');
    repository.existingTeamIds.mockResolvedValueOnce([]);

    await expect(service.create({ ...dto, teamIds: ['team-x'] }, actor('actor'))).rejects.toMatchObject({
      code: 'UNKNOWN_REFERENCE',
    });
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('sin teamIds no exige el permiso de equipos', async () => {
    const { service, repository } = setup(detail({ id: 'nuevo', roles: [USER_ROLE] }));

    await service.create(dto, actor('actor'));
    expect(repository.createUser).toHaveBeenCalledWith(expect.objectContaining({ teamIds: [] }));
  });

  it('con equipos.editar crea y audita los equipos en user.created', async () => {
    const created = detail({ id: 'nuevo', roles: [USER_ROLE], teams: [{ id: 'team-1', name: 'Equipo', isPrimary: true }] });
    const { service, audit, actorPermissions } = setup(created);
    actorPermissions.add('equipos.editar');

    await service.create({ ...dto, teamIds: ['team-1'] }, actor('actor'));
    expect(audit.record).toHaveBeenCalledWith(
      'user.created',
      expect.anything(),
      expect.objectContaining({ after: expect.objectContaining({ teamIds: ['team-1'], roles: ['usuario'] }) }),
    );
  });
});

describe('UsersService · ADR-020 la asignación de accesos es exclusiva del administrador', () => {
  const assignment = { targetId: 'perm-usuarios-exportar', effect: 'GRANT' as const, reason: REASON };

  it.each([
    ['asignar roles', (service: UsersService) => service.replaceRoles('target', ['role-admin'], actor('gestor'))],
    ['conceder permisos directos', (service: UsersService) => service.replacePermissions('target', [assignment], actor('gestor'))],
    ['asignar opciones directas', (service: UsersService) => service.replaceMenuOptions('target', [assignment], actor('gestor'))],
  ])('un no administrador no puede %s: 403 ADMIN_ONLY sin escribir', async (_, act) => {
    const { service, repository, actorState } = setup(detail({ roles: [USER_ROLE] }));
    actorState.isAdministrador = false;

    await expect(act(service)).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    expect(repository.withAdminInvariantLock).not.toHaveBeenCalled();
  });

  it.each([
    ['editar', (service: UsersService) => service.update('target', { jobTitle: 'X' }, actor('gestor'))],
    ['suspender', (service: UsersService) => service.suspend('target', undefined, actor('gestor'))],
    ['reactivar', (service: UsersService) => service.reactivate('target', undefined, actor('gestor'))],
  ])('un no administrador no puede %s a un administrador', async (_, act) => {
    const { service, repository, actorState } = setup(detail({ status: 'SUSPENDED' }));
    actorState.isAdministrador = false;

    await expect(act(service)).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    expect(repository.setUserStatus).not.toHaveBeenCalled();
  });

  it('un no administrador sí suspende a un usuario que no es administrador', async () => {
    const { service, actorState } = setup(detail({ roles: [USER_ROLE] }));
    actorState.isAdministrador = false;

    expect((await service.suspend('target', undefined, actor('gestor'))).status).toBe('SUSPENDED');
  });

  describe('alta (POST /users)', () => {
    const dto = { email: 'nuevo@example.test', firstName: 'Nuevo', lastName: 'Usuario' };

    it('un no administrador sólo asigna roles sin permisos', async () => {
      const { service, repository, actorState } = setup(detail({ id: 'nuevo', roles: [USER_ROLE] }));
      actorState.isAdministrador = false;

      await service.create({ ...dto, roleIds: ['role-user'] }, actor('gestor'));
      expect(repository.createUser).toHaveBeenCalled();
    });

    it('un no administrador no asigna un rol que concede permisos: 403 ADMIN_ONLY', async () => {
      const { service, repository, actorState } = setup(detail({ roles: [USER_ROLE] }));
      actorState.isAdministrador = false;

      await expect(
        service.create({ ...dto, roleIds: ['role-user', 'role-admin'] }, actor('gestor')),
      ).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('el administrador asigna cualquier rol sin consultar sus permisos', async () => {
      const { service, repository } = setup(detail({ id: 'nuevo', roles: [ADMIN_ROLE] }));

      await service.create({ ...dto, roleIds: ['role-admin'] }, actor('admin'));
      expect(repository.findRoleIdsGrantingPermissions).not.toHaveBeenCalled();
      expect(repository.createUser).toHaveBeenCalled();
    });
  });
});

describe('UsersService · Módulo 7 (código de colaborador, país y perfil comercial)', () => {
  const base = { email: 'nuevo@example.test', firstName: 'Nuevo', lastName: 'Usuario' };

  async function captured(promise: Promise<unknown>): Promise<{ code?: string; details?: unknown }> {
    try {
      await promise;
    } catch (error) {
      return error as { code?: string; details?: unknown };
    }
    throw new Error('No lanzó');
  }

  describe('alta', () => {
    it('el administrador crea con código, país y rol comercial; la auditoría lleva código y país ISO', async () => {
      const created = detail({ id: 'nuevo', roles: [ADVISOR_ROLE], employeeCode: 'E-001', country: GT });
      const { service, repository, audit } = setup(created);
      // El doble ya guarda el usuario "creado"; antes del alta el código está libre.
      repository.findUserIdByEmployeeCode.mockResolvedValueOnce(null);

      await service.create({ ...base, employeeCode: 'E-001', countryId: GT.id, roleIds: ['role-asesor'] }, actor('admin'));

      expect(repository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'E-001', countryId: GT.id }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        'user.created',
        expect.anything(),
        expect.objectContaining({
          after: expect.objectContaining({ employeeCode: 'E-001', countryId: GT.id, countryIsoCode: 'GT' }),
        }),
      );
    });

    it('un no administrador no fija el país: 403 ADMIN_ONLY sin escribir', async () => {
      const { service, repository, actorState } = setup(detail({ roles: [USER_ROLE] }));
      actorState.isAdministrador = false;

      expect(await captured(service.create({ ...base, countryId: GT.id, roleIds: ['role-user'] }, actor('gestor')))).toMatchObject({
        code: 'ADMIN_ONLY',
      });
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('un no administrador con equipos.editar no asigna equipos: 403 ADMIN_ONLY', async () => {
      const { service, repository, actorState, actorPermissions } = setup(detail({ roles: [USER_ROLE] }));
      actorState.isAdministrador = false;
      actorPermissions.add('equipos.editar');

      expect(
        await captured(service.create({ ...base, roleIds: ['role-user'], teamIds: ['team-1'] }, actor('gestor'))),
      ).toMatchObject({ code: 'ADMIN_ONLY' });
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('un no administrador sí da de alta con código de colaborador y sin país', async () => {
      const { service, repository, actorState } = setup(detail({ id: 'nuevo', roles: [USER_ROLE] }));
      actorState.isAdministrador = false;

      await service.create({ ...base, employeeCode: 'G-7', roleIds: ['role-user'] }, actor('gestor'));
      expect(repository.createUser).toHaveBeenCalledWith(expect.objectContaining({ employeeCode: 'G-7', countryId: null }));
    });

    it.each([
      ['inexistente', 'country-x', 'not_found'],
      ['inactivo', 'country-off', 'inactive'],
    ])('país %s: 422 UNKNOWN_REFERENCE', async (_label, countryId, issue) => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

      expect(await captured(service.create({ ...base, countryId, roleIds: ['role-user'] }, actor('admin')))).toMatchObject({
        code: 'UNKNOWN_REFERENCE',
        details: [expect.objectContaining({ field: 'countryId', issue })],
      });
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('rol comercial sin código o sin país: 422 CRM_PROFILE_INCOMPLETE', async () => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

      expect(await captured(service.create({ ...base, countryId: GT.id, roleIds: ['role-asesor'] }, actor('admin')))).toMatchObject({
        code: 'CRM_PROFILE_INCOMPLETE',
        details: [{ field: 'employeeCode', issue: 'required' }],
      });
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('código de colaborador ya usado: 409 RESOURCE_CONFLICT con field employeeCode', async () => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE] }), [detail({ id: 'otro', employeeCode: 'E-001' })]);

      const error = await captured(service.create({ ...base, employeeCode: 'E-001', roleIds: ['role-user'] }, actor('admin')));
      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({ code: 'RESOURCE_CONFLICT', details: [{ field: 'employeeCode', issue: 'duplicated' }] });
      expect(repository.createUser).not.toHaveBeenCalled();
    });
  });

  describe('edición', () => {
    it('un no administrador edita el código de colaborador y el teléfono', async () => {
      const { service, actorState } = setup(detail({ roles: [USER_ROLE] }));
      actorState.isAdministrador = false;

      const after = await service.update('target', { employeeCode: 'E-9', phone: '+502 5555 5555' }, actor('gestor'));
      expect(after).toMatchObject({ employeeCode: 'E-9', phone: '+502 5555 5555' });
    });

    it.each([
      ['fijar', null, GT.id],
      ['cambiar', GT, SV.id],
      ['quitar', GT, null],
    ])('un no administrador no puede %s el país: 403 ADMIN_ONLY', async (_label, country, countryId) => {
      const { service, repository, actorState } = setup(detail({ roles: [USER_ROLE], country }));
      actorState.isAdministrador = false;

      expect(await captured(service.update('target', { countryId }, actor('gestor')))).toMatchObject({ code: 'ADMIN_ONLY' });
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it('reenviar el país actual no es un cambio: un no administrador puede guardar', async () => {
      const { service, repository, actorState } = setup(detail({ roles: [USER_ROLE], country: GT }));
      actorState.isAdministrador = false;

      await service.update('target', { countryId: GT.id, jobTitle: 'Analista' }, actor('gestor'));
      expect(repository.updateUser).toHaveBeenCalledWith('target', expect.objectContaining({ countryId: undefined }));
      expect(repository.findCountry).not.toHaveBeenCalled();
    });

    it('el administrador cambia el país, y la auditoría registra id e ISO', async () => {
      const { service, audit } = setup(detail({ roles: [USER_ROLE], country: GT }));

      await service.update('target', { countryId: SV.id }, actor('admin'));
      expect(audit.record).toHaveBeenCalledWith(
        'user.updated',
        expect.anything(),
        expect.objectContaining({
          before: expect.objectContaining({ countryId: GT.id, countryIsoCode: 'GT' }),
          after: expect.objectContaining({ countryId: SV.id, countryIsoCode: 'SV' }),
        }),
      );
    });

    it('el administrador no asigna un país inactivo; un usuario cuyo país se desactivó lo conserva al editar otros datos', async () => {
      const { service } = setup(detail({ roles: [USER_ROLE], country: GT }));
      expect(await captured(service.update('target', { countryId: 'country-off' }, actor('admin')))).toMatchObject({
        code: 'UNKNOWN_REFERENCE',
      });

      const kept = setup(detail({ roles: [USER_ROLE], country: { id: 'country-off', isoCode: 'NI', name: 'Nicaragua' } }));
      await expect(kept.service.update('target', { countryId: 'country-off', jobTitle: 'X' }, actor('admin'))).resolves.toBeDefined();
    });

    it.each([
      ['el país', { countryId: null }, 'countryId'],
      ['el código', { employeeCode: null }, 'employeeCode'],
    ])('a un asesor no se le vacía %s: 422 CRM_PROFILE_INCOMPLETE', async (_label, dto, field) => {
      const { service, repository } = setup(detail({ roles: [ADVISOR_ROLE], employeeCode: 'E-1', country: GT }));

      expect(await captured(service.update('target', dto, actor('admin')))).toMatchObject({
        code: 'CRM_PROFILE_INCOMPLETE',
        details: [{ field, issue: 'required' }],
      });
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it('a quien no tiene rol comercial sí se le vacía el código', async () => {
      const { service } = setup(detail({ roles: [USER_ROLE], employeeCode: 'E-1' }));
      expect((await service.update('target', { employeeCode: null }, actor('admin'))).employeeCode).toBeNull();
    });

    it('código de otro usuario: 409; el suyo propio no es conflicto', async () => {
      const { service } = setup(detail({ roles: [USER_ROLE], employeeCode: 'MIO' }), [detail({ id: 'otro', employeeCode: 'AJENO' })]);

      expect(await captured(service.update('target', { employeeCode: 'AJENO' }, actor('admin')))).toMatchObject({
        code: 'RESOURCE_CONFLICT',
        details: [{ field: 'employeeCode', issue: 'duplicated' }],
      });
      await expect(service.update('target', { employeeCode: 'MIO' }, actor('admin'))).resolves.toBeDefined();
    });
  });

  describe('asignar roles', () => {
    it('asignar asesor sin código o sin país: 422 CRM_PROFILE_INCOMPLETE, sin escribir', async () => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE], employeeCode: 'E-1' }));

      expect(await captured(service.replaceRoles('target', ['role-asesor'], actor('admin')))).toMatchObject({
        code: 'CRM_PROFILE_INCOMPLETE',
        details: [{ field: 'countryId', issue: 'required' }],
      });
      expect(repository.replaceUserRoles).not.toHaveBeenCalled();
    });

    it('con código y país se asigna', async () => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE], employeeCode: 'E-1', country: GT }));

      await service.replaceRoles('target', ['role-asesor'], actor('admin'));
      expect(repository.replaceUserRoles).toHaveBeenCalledWith('target', ['role-asesor'], 'admin');
    });

    it('roles no comerciales (incluido administrador) no exigen el perfil', async () => {
      const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

      await service.replaceRoles('target', ['role-admin', 'role-gestor'], actor('admin'));
      expect(repository.replaceUserRoles).toHaveBeenCalled();
    });
  });

  it('la exportación incluye las columnas Código de colaborador y País', async () => {
    const { service, repository } = setup(detail());
    (repository as unknown as { listUsers: jest.Mock }).listUsers = jest.fn(async () => ({
      items: [
        {
          id: 'u1',
          email: 'a@example.test',
          displayName: 'A',
          status: 'ACTIVE',
          jobTitle: null,
          teams: [],
          employeeCode: 'E-001',
          country: GT,
          roles: ['asesor'],
          lastLoginAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      totalItems: 1,
    }));

    const result = await service.export({ countryId: GT.id, sortOrder: 'asc' }, actor('admin'));
    const [header, row] = result.csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(header).toContain('Código de colaborador');
    expect(header).toContain('País');
    expect(row).toContain('E-001');
    expect(row).toContain('Guatemala');
  });
});
