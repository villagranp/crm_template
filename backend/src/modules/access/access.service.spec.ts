import {
  buildMenu,
  resolveMenuOptionIds,
  resolvePermissionOrigins,
  resolvePermissions,
  widestScope,
} from './access.service';
import type { MenuOptionRecord, UserAccessSnapshot } from './ports/access.repository.port';

const REASON = 'Excepción justificada de prueba';

function snapshot(overrides: Partial<UserAccessSnapshot> = {}): UserAccessSnapshot {
  return {
    user: {
      id: 'user-1',
      email: 'persona@example.com',
      displayName: 'Persona de prueba',
      status: 'ACTIVE',
      jobTitle: null,
      teams: [],
    },
    roles: [{ id: 'role-1', code: 'usuario', name: 'Usuario', dataScope: 'OWN', permissionCodes: [] }],
    rolePermissionCodes: [],
    directPermissions: [],
    roleMenuOptionIds: [],
    directMenuOptions: [],
    ...overrides,
  };
}

function option(overrides: Partial<MenuOptionRecord> = {}): MenuOptionRecord {
  return {
    id: 'opt-1',
    key: 'opt-1',
    parentId: null,
    label: 'Opción',
    description: null,
    icon: null,
    path: '/opcion',
    kind: 'LINK',
    sortOrder: 10,
    requiredPermissionId: null,
    requiredPermissionCode: null,
    isPublic: false,
    isSystem: false,
    isActive: true,
    module: { id: 'mod-1', key: 'administracion', name: 'Administración', icon: 'settings', sortOrder: 90, isSystem: true },
    ...overrides,
  };
}

describe('resolvePermissions', () => {
  it('une los permisos de los roles del usuario', () => {
    const result = resolvePermissions(snapshot({ rolePermissionCodes: ['usuarios.ver', 'roles.ver'] }));

    expect([...result].sort()).toEqual(['roles.ver', 'usuarios.ver']);
  });

  it('añade las concesiones directas', () => {
    const result = resolvePermissions(
      snapshot({
        rolePermissionCodes: ['usuarios.ver'],
        directPermissions: [{ code: 'usuarios.exportar', effect: 'GRANT', reason: REASON, expiresAt: null }],
      }),
    );

    expect(result.has('usuarios.exportar')).toBe(true);
  });

  it('una denegación directa gana sobre el permiso heredado del rol', () => {
    const result = resolvePermissions(
      snapshot({
        rolePermissionCodes: ['usuarios.ver', 'usuarios.eliminar'],
        directPermissions: [{ code: 'usuarios.eliminar', effect: 'DENY', reason: REASON, expiresAt: null }],
      }),
    );

    expect(result.has('usuarios.ver')).toBe(true);
    expect(result.has('usuarios.eliminar')).toBe(false);
  });

  it('la denegación gana aunque también exista una concesión directa del mismo permiso', () => {
    const result = resolvePermissions(
      snapshot({
        directPermissions: [
          { code: 'usuarios.editar', effect: 'GRANT', reason: REASON, expiresAt: null },
          { code: 'usuarios.editar', effect: 'DENY', reason: REASON, expiresAt: null },
        ],
      }),
    );

    expect(result.has('usuarios.editar')).toBe(false);
  });
});

describe('resolveMenuOptionIds', () => {
  it('aplica la misma precedencia que los permisos', () => {
    const result = resolveMenuOptionIds(
      snapshot({
        roleMenuOptionIds: ['a', 'b'],
        directMenuOptions: [
          { menuOptionId: 'c', effect: 'GRANT' },
          { menuOptionId: 'b', effect: 'DENY' },
        ],
      }),
    );

    expect([...result].sort()).toEqual(['a', 'c']);
  });
});

describe('buildMenu', () => {
  it('incluye las opciones públicas aunque no estén asignadas', () => {
    const menu = buildMenu([option({ id: 'inicio', isPublic: true })], new Set(), new Set());

    expect(menu).toHaveLength(1);
    expect(menu[0]?.options[0]?.id).toBe('inicio');
  });

  it('indica si el módulo es de sistema, para agruparlo en "Sistema"', () => {
    const menu = buildMenu([option({ id: 'inicio', isPublic: true })], new Set(), new Set());

    expect(menu[0]?.isSystem).toBe(true);
  });

  it('oculta una opción asignada cuyo permiso requerido no tiene el usuario', () => {
    const menu = buildMenu(
      [option({ id: 'usuarios', requiredPermissionCode: 'usuarios.ver' })],
      new Set(['usuarios']),
      new Set(),
    );

    expect(menu).toHaveLength(0);
  });

  it('muestra la opción cuando el usuario sí tiene el permiso requerido', () => {
    const menu = buildMenu(
      [option({ id: 'usuarios', requiredPermissionCode: 'usuarios.ver' })],
      new Set(['usuarios']),
      new Set(['usuarios.ver']),
    );

    expect(menu[0]?.options).toHaveLength(1);
  });

  it('descarta un grupo que se queda sin hijos visibles', () => {
    const menu = buildMenu(
      [
        option({ id: 'grupo', kind: 'GROUP', path: null }),
        option({ id: 'hijo', parentId: 'grupo', requiredPermissionCode: 'usuarios.ver' }),
      ],
      new Set(['grupo', 'hijo']),
      new Set(),
    );

    expect(menu).toHaveLength(0);
  });

  it('anida los hijos bajo su padre y respeta el orden declarado', () => {
    const menu = buildMenu(
      [
        option({ id: 'grupo', kind: 'GROUP', path: null, sortOrder: 10 }),
        option({ id: 'hijo-b', parentId: 'grupo', sortOrder: 20, label: 'B' }),
        option({ id: 'hijo-a', parentId: 'grupo', sortOrder: 10, label: 'A' }),
      ],
      new Set(['grupo', 'hijo-a', 'hijo-b']),
      new Set(),
    );

    expect(menu[0]?.options[0]?.children.map((child) => child.label)).toEqual(['A', 'B']);
  });

  it('ignora las opciones desactivadas', () => {
    const menu = buildMenu([option({ id: 'x', isActive: false, isPublic: true })], new Set(['x']), new Set());

    expect(menu).toHaveLength(0);
  });
});

describe('widestScope', () => {
  it('devuelve el alcance más amplio entre los roles', () => {
    expect(widestScope(['OWN', 'ORGANIZATION', 'TEAM'])).toBe('ORGANIZATION');
  });

  it('devuelve OWN cuando el usuario no tiene roles', () => {
    expect(widestScope([])).toBe('OWN');
  });

  it('COUNTRY (antes TERRITORY) queda entre TEAM y ORGANIZATION', () => {
    expect(widestScope(['OWN', 'COUNTRY', 'TEAM'])).toBe('COUNTRY');
    expect(widestScope(['COUNTRY', 'ORGANIZATION'])).toBe('ORGANIZATION');
  });
});

describe('resolvePermissionOrigins (D5)', () => {
  it('indica los roles que conceden cada permiso', () => {
    const origins = resolvePermissionOrigins(
      snapshot({
        roles: [
          { id: 'r1', code: 'auditor', name: 'Auditor', dataScope: 'OWN', permissionCodes: ['usuarios.ver'] },
          { id: 'r2', code: 'gestor', name: 'Gestor', dataScope: 'OWN', permissionCodes: ['usuarios.ver', 'roles.ver'] },
        ],
        rolePermissionCodes: ['usuarios.ver', 'roles.ver'],
      }),
    );

    expect(origins).toEqual([
      { code: 'roles.ver', effective: true, roles: ['gestor'], grant: null, deny: null },
      { code: 'usuarios.ver', effective: true, roles: ['auditor', 'gestor'], grant: null, deny: null },
    ]);
  });

  it('marca la concesión directa y la denegación que anula a un rol', () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const origins = resolvePermissionOrigins(
      snapshot({
        roles: [{ id: 'r1', code: 'gestor', name: 'Gestor', dataScope: 'OWN', permissionCodes: ['usuarios.editar'] }],
        rolePermissionCodes: ['usuarios.editar'],
        directPermissions: [
          { code: 'usuarios.exportar', effect: 'GRANT', reason: REASON, expiresAt },
          { code: 'usuarios.editar', effect: 'DENY', reason: REASON, expiresAt: null },
        ],
      }),
    );

    expect(origins).toEqual([
      { code: 'usuarios.editar', effective: false, roles: ['gestor'], grant: null, deny: { reason: REASON, expiresAt: null } },
      { code: 'usuarios.exportar', effective: true, roles: [], grant: { reason: REASON, expiresAt }, deny: null },
    ]);
  });
});
