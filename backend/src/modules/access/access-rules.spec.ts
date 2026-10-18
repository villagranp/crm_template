import { findCycle, isPendingAccess, missingIds } from './access-rules';

describe('findCycle', () => {
  it('acepta un árbol válido', () => {
    expect(
      findCycle([
        { id: 'a', parentId: null },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
      ]),
    ).toBeNull();
  });

  it('detecta un nodo que es su propio padre', () => {
    expect(findCycle([{ id: 'a', parentId: 'a' }])).toBe('a');
  });

  it('detecta un ciclo indirecto', () => {
    expect(
      findCycle([
        { id: 'a', parentId: 'c' },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
      ]),
    ).not.toBeNull();
  });

  it('trata un padre ausente como raíz externa', () => {
    expect(findCycle([{ id: 'a', parentId: 'fuera' }])).toBeNull();
  });
});

describe('missingIds', () => {
  it('devuelve los pedidos que no existen, sin repetir', () => {
    expect(missingIds(['a', 'b', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
});

describe('isPendingAccess (definición única de «pendiente de acceso», ADR-027)', () => {
  const NOW = new Date('2026-10-15T12:00:00.000Z');
  const past = new Date('2026-10-15T11:00:00.000Z');
  const future = new Date('2026-10-15T13:00:00.000Z');
  const none = { status: 'ACTIVE', roles: [], grantedPermissionExpiries: [] };

  it('ACTIVE sin roles ni permisos directos: pendiente', () => {
    expect(isPendingAccess(none, NOW)).toBe(true);
  });

  it.each(['INVITED', 'SUSPENDED', 'LOCKED'])('un usuario %s nunca es pendiente', (status) => {
    expect(isPendingAccess({ ...none, status }, NOW)).toBe(false);
  });

  it('un rol activo sin caducidad o con caducidad futura lo saca de pendiente', () => {
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: null, isActive: true }] }, NOW)).toBe(false);
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: future, isActive: true }] }, NOW)).toBe(false);
  });

  it('un rol caducado, o de un rol desactivado, no cuenta', () => {
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: past, isActive: true }] }, NOW)).toBe(true);
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: null, isActive: false }] }, NOW)).toBe(true);
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: past, isActive: true }, { expiresAt: null, isActive: false }] }, NOW)).toBe(true);
  });

  it('una concesión directa vigente (sin caducidad o futura) lo saca de pendiente; una caducada no', () => {
    expect(isPendingAccess({ ...none, grantedPermissionExpiries: [null] }, NOW)).toBe(false);
    expect(isPendingAccess({ ...none, grantedPermissionExpiries: [future] }, NOW)).toBe(false);
    expect(isPendingAccess({ ...none, grantedPermissionExpiries: [past] }, NOW)).toBe(true);
  });

  it('una caducidad exactamente en este instante ya no es vigente', () => {
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: NOW, isActive: true }], grantedPermissionExpiries: [NOW] }, NOW)).toBe(true);
  });

  it('basta una fuente vigente entre varias caducadas', () => {
    expect(isPendingAccess({ ...none, roles: [{ expiresAt: past, isActive: true }], grantedPermissionExpiries: [past, future] }, NOW)).toBe(false);
  });
});
