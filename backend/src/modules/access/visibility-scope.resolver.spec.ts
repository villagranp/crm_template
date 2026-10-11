import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import type { AccessRepository, DataScope, UserAccessSnapshot } from './ports/access.repository.port';
import type { VisibilityScopeReader } from './ports/visibility-scope.port';
import { isWithinScope, noVisibility } from './visibility-scope';
import { dataScopeForPermission, VisibilityScopeResolver } from './visibility-scope.resolver';

const USER = 'user-1';

function snapshot(
  roles: { code: string; dataScope: DataScope; permissionCodes: string[] }[],
  directPermissions: { code: string; effect: 'GRANT' | 'DENY' }[] = [],
): UserAccessSnapshot {
  return {
    user: { id: USER, email: 'u@example.com', displayName: 'U', status: 'ACTIVE', jobTitle: null, teams: [] },
    roles: roles.map((role) => ({ id: `r-${role.code}`, name: role.code, ...role })),
    rolePermissionCodes: [...new Set(roles.flatMap((role) => role.permissionCodes))],
    directPermissions: directPermissions.map((item) => ({ ...item, reason: 'r', expiresAt: null })),
    roleMenuOptionIds: [],
    directMenuOptions: [],
  };
}

function setup(access: UserAccessSnapshot | null, reader: Partial<VisibilityScopeReader> = {}) {
  const accessRepository = { getUserAccessSnapshot: jest.fn(async () => access) } as unknown as AccessRepository;
  const fullReader: VisibilityScopeReader = {
    findUserCountryId: jest.fn(async () => null),
    findTeamScope: jest.fn(async () => ({ teamIds: [], userIds: [] })),
    ...reader,
  };
  const logger = { warn: jest.fn() } as unknown as AppLogger;
  return { logger, reader: fullReader, resolver: new VisibilityScopeResolver(accessRepository, fullReader, logger) };
}

describe('dataScopeForPermission', () => {
  it('toma el alcance más amplio entre los roles que conceden ESE permiso', () => {
    const access = snapshot([
      { code: 'asesor', dataScope: 'OWN', permissionCodes: ['clientes.ver'] },
      { code: 'auditor', dataScope: 'ORGANIZATION', permissionCodes: ['auditoria.ver'] },
      { code: 'manager', dataScope: 'TEAM', permissionCodes: ['clientes.ver'] },
    ]);
    // ORGANIZATION del auditor no se aplica a clientes.ver.
    expect(dataScopeForPermission(access, 'clientes.ver')).toBe('TEAM');
  });

  it('una concesión directa sin rol da alcance OWN', () => {
    const access = snapshot([], [{ code: 'clientes.ver', effect: 'GRANT' }]);
    expect(dataScopeForPermission(access, 'clientes.ver')).toBe('OWN');
  });

  it('sin el permiso, o con denegación directa, no hay alcance', () => {
    const access = snapshot(
      [{ code: 'manager', dataScope: 'TEAM', permissionCodes: ['clientes.ver'] }],
      [{ code: 'clientes.ver', effect: 'DENY' }],
    );
    expect(dataScopeForPermission(access, 'clientes.ver')).toBeNull();
    expect(dataScopeForPermission(snapshot([]), 'clientes.ver')).toBeNull();
  });
});

describe('VisibilityScopeResolver', () => {
  it('OWN: solo los registros propios', async () => {
    const { resolver } = setup(snapshot([{ code: 'asesor', dataScope: 'OWN', permissionCodes: ['clientes.ver'] }]));

    await expect(resolver.resolve(USER, 'clientes.ver')).resolves.toEqual({
      kind: 'FILTERED',
      userId: USER,
      dataScope: 'OWN',
      ownerIds: [USER],
      teamIds: [],
      countryIds: [],
    });
  });

  it('TEAM: el propio usuario más miembros y responsables de sus equipos y subequipos, sin repetir', async () => {
    const { resolver } = setup(snapshot([{ code: 'manager', dataScope: 'TEAM', permissionCodes: ['clientes.ver'] }]), {
      findTeamScope: jest.fn(async () => ({ teamIds: ['t-1', 't-1a'], userIds: [USER, 'user-2', 'user-3'] })),
    });

    await expect(resolver.resolve(USER, 'clientes.ver')).resolves.toEqual({
      kind: 'FILTERED',
      userId: USER,
      dataScope: 'TEAM',
      ownerIds: [USER, 'user-2', 'user-3'],
      teamIds: ['t-1', 't-1a'],
      countryIds: [],
    });
  });

  it('COUNTRY: el país del usuario más sus propios registros', async () => {
    const { resolver } = setup(
      snapshot([{ code: 'responsable-pais', dataScope: 'COUNTRY', permissionCodes: ['clientes.ver'] }]),
      { findUserCountryId: jest.fn(async () => 'country-gt') },
    );

    await expect(resolver.resolve(USER, 'clientes.ver')).resolves.toMatchObject({
      kind: 'FILTERED',
      dataScope: 'COUNTRY',
      ownerIds: [USER],
      countryIds: ['country-gt'],
    });
  });

  it('COUNTRY sin país se degrada a OWN con advertencia en el log (D-02.8)', async () => {
    const { resolver, logger } = setup(
      snapshot([{ code: 'responsable-pais', dataScope: 'COUNTRY', permissionCodes: ['clientes.ver'] }]),
    );

    await expect(resolver.resolve(USER, 'clientes.ver')).resolves.toMatchObject({ dataScope: 'OWN', ownerIds: [USER] });
    expect(logger.warn).toHaveBeenCalledWith(
      'visibility_scope_country_missing',
      expect.objectContaining({ userId: USER, degradedTo: 'OWN' }),
    );
  });

  it('ORGANIZATION: sin filtro', async () => {
    const { resolver, reader } = setup(
      snapshot([{ code: 'administrador', dataScope: 'ORGANIZATION', permissionCodes: ['clientes.ver'] }]),
    );

    await expect(resolver.resolve(USER, 'clientes.ver')).resolves.toEqual({
      kind: 'ALL',
      userId: USER,
      dataScope: 'ORGANIZATION',
    });
    expect(reader.findTeamScope).not.toHaveBeenCalled();
  });

  it('sin el permiso, sin cuenta local o con usuario inexistente no ve nada', async () => {
    const withoutPermission = setup(snapshot([{ code: 'usuario', dataScope: 'ORGANIZATION', permissionCodes: [] }]));
    await expect(withoutPermission.resolver.resolve(USER, 'clientes.ver')).resolves.toEqual(noVisibility(USER));

    await expect(setup(null).resolver.resolve(USER, 'clientes.ver')).resolves.toEqual(noVisibility(USER));
    await expect(setup(null).resolver.resolve(null, 'clientes.ver')).resolves.toEqual(noVisibility(null));
  });
});

describe('VisibilityScopeResolver.resolveMany', () => {
  it('resuelve cada permiso con su alcance leyendo una vez el perfil y una vez los equipos', async () => {
    const access = snapshot([
      { code: 'manager', dataScope: 'TEAM', permissionCodes: ['clientes.ver', 'clientes.administrar'] },
      { code: 'lector', dataScope: 'ORGANIZATION', permissionCodes: ['clientes.ver'] },
    ]);
    const findTeamScope = jest.fn(async () => ({ teamIds: ['t-1'], userIds: ['user-2'] }));
    const { resolver } = setup(access, { findTeamScope });
    const getSnapshot = (resolver as unknown as { accessRepository: { getUserAccessSnapshot: jest.Mock } }).accessRepository
      .getUserAccessSnapshot;

    const scopes = await resolver.resolveMany(USER, ['clientes.ver', 'clientes.administrar', 'clientes.eliminar']);

    expect(scopes.get('clientes.ver')).toEqual({ kind: 'ALL', userId: USER, dataScope: 'ORGANIZATION' });
    expect(scopes.get('clientes.administrar')).toMatchObject({ kind: 'FILTERED', dataScope: 'TEAM', ownerIds: [USER, 'user-2'] });
    expect(scopes.get('clientes.eliminar')).toEqual(noVisibility(USER));
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(findTeamScope).toHaveBeenCalledTimes(1);
  });

  it('sin cuenta local, ningún permiso ve nada', async () => {
    const scopes = await setup(null).resolver.resolveMany(null, ['clientes.ver']);
    expect(scopes.get('clientes.ver')).toEqual(noVisibility(null));
  });
});

describe('isWithinScope', () => {
  it('evalúa dueño y país igual que el predicado de los adaptadores', () => {
    const team = {
      kind: 'FILTERED' as const,
      userId: USER,
      dataScope: 'TEAM' as const,
      ownerIds: [USER, 'user-2'],
      teamIds: ['t-1'],
      countryIds: [],
    };
    expect(isWithinScope(team, { ownerId: 'user-2', countryId: 'gt' })).toBe(true);
    expect(isWithinScope(team, { ownerId: 'user-9', countryId: 'gt' })).toBe(false);

    const country = { ...team, dataScope: 'COUNTRY' as const, ownerIds: [USER], countryIds: ['gt'] };
    expect(isWithinScope(country, { ownerId: 'user-9', countryId: 'gt' })).toBe(true);
    expect(isWithinScope(country, { ownerId: 'user-9', countryId: null })).toBe(false);

    expect(isWithinScope({ kind: 'ALL', userId: USER, dataScope: 'ORGANIZATION' }, { ownerId: null, countryId: null })).toBe(
      true,
    );
    expect(isWithinScope(noVisibility(USER), { ownerId: USER, countryId: 'gt' })).toBe(false);
  });
});
