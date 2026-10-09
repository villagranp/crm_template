import { auditDiff } from './audit-diff';

describe('auditDiff', () => {
  it('devuelve solo los campos que cambiaron', () => {
    expect(auditDiff({ name: 'A', description: 'x' }, { name: 'B', description: 'x' })).toEqual({
      name: { before: 'A', after: 'B' },
    });
  });

  it('un alta tiene before nulo y una baja after nulo', () => {
    expect(auditDiff(null, { name: 'A' })).toEqual({ name: { before: null, after: 'A' } });
    expect(auditDiff({ name: 'A' }, null)).toEqual({ name: { before: 'A', after: null } });
  });

  it('compara listas como conjuntos: reordenar no es un cambio', () => {
    expect(auditDiff({ roles: ['b', 'a'] }, { roles: ['a', 'b'] })).toEqual({});
    expect(auditDiff({ roles: ['a'] }, { roles: ['a', 'b'] })).toEqual({
      roles: { before: ['a'], after: ['a', 'b'] },
    });
  });

  it('serializa fechas y trata undefined como null', () => {
    const date = new Date('2026-10-08T10:00:00.000Z');
    expect(auditDiff({ expiresAt: undefined }, { expiresAt: date })).toEqual({
      expiresAt: { before: null, after: '2026-10-08T10:00:00.000Z' },
    });
  });

  it('nunca incluye campos sensibles', () => {
    const changes = auditDiff(
      { passwordHash: 'a', refreshToken: 'b', clientSecret: 'c', name: 'A' },
      { passwordHash: 'z', refreshToken: 'y', clientSecret: 'x', name: 'B' },
    );
    expect(Object.keys(changes)).toEqual(['name']);
  });
});
