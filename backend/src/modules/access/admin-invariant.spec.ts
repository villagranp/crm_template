import {
  ADMIN_CRITICAL_PERMISSIONS,
  canAdministerUsers,
  isAdminGuardian,
  isSelfLockout,
  losesAdminGuardian,
} from './admin-invariant';
import type { UserAccessSnapshot, UserStatus } from './ports/access.repository.port';

const REASON = 'Motivo suficientemente largo';

function snapshot(options: {
  status?: UserStatus;
  roleCode?: string;
  rolePermissions?: string[];
  deny?: string[];
  grant?: string[];
}): UserAccessSnapshot {
  const rolePermissions = options.rolePermissions ?? [...ADMIN_CRITICAL_PERMISSIONS];
  return {
    user: { id: 'u1', email: 'u1@example.test', displayName: 'U1', status: options.status ?? 'ACTIVE', jobTitle: null, teams: [] },
    roles: [{ id: 'r1', code: options.roleCode ?? 'administrador', name: 'R', dataScope: 'ORGANIZATION', permissionCodes: rolePermissions }],
    rolePermissionCodes: rolePermissions,
    directPermissions: [
      ...(options.grant ?? []).map((code) => ({ code, effect: 'GRANT' as const, reason: REASON, expiresAt: null })),
      ...(options.deny ?? []).map((code) => ({ code, effect: 'DENY' as const, reason: REASON, expiresAt: null })),
    ],
    roleMenuOptionIds: [],
    directMenuOptions: [],
  };
}

describe('Invariante de administración (D3)', () => {
  it('los permisos críticos son usuarios.editar y roles.editar', () => {
    expect([...ADMIN_CRITICAL_PERMISSIONS].sort()).toEqual(['roles.editar', 'usuarios.editar']);
  });

  it('un administrador activo con los permisos críticos sostiene el invariante', () => {
    expect(isAdminGuardian(snapshot({}))).toBe(true);
  });

  it('DENY gana: un DENY de cualquier permiso crítico lo descalifica aunque conserve el rol', () => {
    expect(isAdminGuardian(snapshot({ deny: ['roles.editar'] }))).toBe(false);
    expect(isAdminGuardian(snapshot({ deny: ['usuarios.editar'], grant: ['usuarios.editar'] }))).toBe(false);
  });

  it('sin el rol administrador, o sin estar ACTIVE, no lo sostiene', () => {
    expect(isAdminGuardian(snapshot({ roleCode: 'gestor-accesos' }))).toBe(false);
    expect(isAdminGuardian(snapshot({ status: 'SUSPENDED' }))).toBe(false);
    expect(isAdminGuardian(null)).toBe(false);
  });

  it('losesAdminGuardian sólo es cierto si antes lo sostenía y después no', () => {
    expect(losesAdminGuardian(snapshot({}), snapshot({ deny: ['roles.editar'] }))).toBe(true);
    expect(losesAdminGuardian(snapshot({ deny: ['roles.editar'] }), snapshot({ status: 'SUSPENDED' }))).toBe(false);
    expect(losesAdminGuardian(snapshot({}), snapshot({}))).toBe(false);
  });

  it('autobloqueo: el actor sobre sí mismo pierde usuarios.editar efectivo', () => {
    expect(isSelfLockout(true, snapshot({}), snapshot({ deny: ['usuarios.editar'] }))).toBe(true);
    expect(isSelfLockout(false, snapshot({}), snapshot({ deny: ['usuarios.editar'] }))).toBe(false);
    expect(isSelfLockout(true, snapshot({}), snapshot({ deny: ['roles.editar'] }))).toBe(false);
  });

  it('canAdministerUsers admite INVITED pero no SUSPENDED', () => {
    expect(canAdministerUsers(snapshot({ status: 'INVITED' }))).toBe(true);
    expect(canAdministerUsers(snapshot({ status: 'SUSPENDED' }))).toBe(false);
  });
});
