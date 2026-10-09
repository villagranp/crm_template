import { BadRequestException } from '@nestjs/common';

import { ResourceConflictError } from '@/common/errors/application-error';
import type { AuditService } from '@/modules/audit/audit.service';
import type { InitialCredentialService } from '@/modules/auth/initial-credential.service';

import type { ActorContext } from './access-rules';
import type { AccessRepository, UserDetailRecord } from './ports/access.repository.port';
import { UsersService } from './users.service';

const ADMIN_ROLE = { id: 'role-admin', code: 'administrador', name: 'Administrador', isSystem: true, expiresAt: null };
const USER_ROLE = { id: 'role-user', code: 'usuario', name: 'Usuario', isSystem: true, expiresAt: null };

function detail(overrides: Partial<UserDetailRecord> = {}): UserDetailRecord {
  return {
    id: 'target',
    email: 'persona@example.test',
    firstName: 'Persona',
    lastName: 'Prueba',
    displayName: 'Persona Prueba',
    jobTitle: null,
    phone: null,
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

function setup(user: UserDetailRecord, otherActiveAdmins = 1) {
  let current = user;
  const repository = {
    findUserDetail: jest.fn(async () => current),
    countActiveUsersWithRole: jest.fn(async () => otherActiveAdmins),
    setUserStatus: jest.fn(async (_id: string, status: UserDetailRecord['status']) => {
      current = { ...current, status };
    }),
    replaceUserRoles: jest.fn(async () => undefined),
    existingRoleIds: jest.fn(async (ids: string[]) => ids),
    replaceUserPermissions: jest.fn(async () => undefined),
    existingPermissionIds: jest.fn(async (ids: string[]) => ids),
  };
  const authRepository = { revokeAllUserSessions: jest.fn(async () => 2) };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new UsersService(
    repository as unknown as AccessRepository,
    authRepository,
    {} as InitialCredentialService,
    audit as unknown as AuditService,
  );
  return { service, repository, authRepository, audit };
}

function actor(userId: string): ActorContext {
  return { userId, audit: { correlationId: 'corr', actorId: userId, actorEmail: null, ipAddress: null } };
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

  it('no suspende al último administrador activo', async () => {
    const { service, repository } = setup(detail(), 0);

    expect(await conflictCode(service.suspend('target', undefined, actor('otro')))).toBe('LAST_ADMIN');
    expect(repository.countActiveUsersWithRole).toHaveBeenCalledWith('administrador', 'target');
  });

  it('un administrador que no está activo no cuenta como último', async () => {
    const { service, repository } = setup(detail({ status: 'INVITED' }), 0);

    await service.suspend('target', undefined, actor('otro'));
    expect(repository.countActiveUsersWithRole).not.toHaveBeenCalled();
  });

  it('suspende, revoca todas las sesiones y audita', async () => {
    const { service, repository, authRepository, audit } = setup(detail({ roles: [USER_ROLE] }));

    const result = await service.suspend('target', 'Revisión de un incidente', actor('otro'));

    expect(result.status).toBe('SUSPENDED');
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
    const { service } = setup(detail({ status: 'SUSPENDED' }));
    expect((await service.reactivate('target', undefined, actor('otro'))).status).toBe('ACTIVE');
  });

  it('vuelve a INVITED si nunca fijó su contraseña', async () => {
    const { service } = setup(detail({ status: 'SUSPENDED', hasCompletedActivation: false }));
    expect((await service.reactivate('target', undefined, actor('otro'))).status).toBe('INVITED');
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

  it('no quita el rol al último administrador activo', async () => {
    const { service } = setup(detail(), 0);
    expect(await conflictCode(service.replaceRoles('target', ['role-user'], actor('otro')))).toBe('LAST_ADMIN');
  });

  it('quita el rol si queda otro administrador activo, y audita la diferencia', async () => {
    const { service, audit } = setup(detail(), 1);

    await service.replaceRoles('target', ['role-user'], actor('otro'));
    expect(audit.record).toHaveBeenCalledWith('user.roles_replaced', expect.anything(), expect.anything());
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

describe('UsersService · excepciones directas (D5)', () => {
  it('rechaza una caducidad ya vencida', async () => {
    const { service, repository } = setup(detail({ roles: [USER_ROLE] }));

    await expect(
      service.replacePermissions(
        'target',
        [{ targetId: 'p1', effect: 'GRANT', reason: 'Motivo suficientemente largo', expiresAt: new Date(Date.now() - 1000) }],
        actor('otro'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceUserPermissions).not.toHaveBeenCalled();
  });
});
