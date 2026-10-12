import { auditDiff, maskAuditValue } from './audit-diff';

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

  describe('campos enmascarados (DM-29)', () => {
    it('registra que el campo cambió con ambos valores enmascarados', () => {
      const changes = auditDiff(
        { email: 'ana.lopez@dominio.com', firstName: 'Ana', jobTitle: 'Compras' },
        { email: 'beto@otra.com.gt', firstName: 'Beto', jobTitle: 'Gerencia' },
        { maskedFields: ['email', 'firstName'] },
      );

      expect(changes).toEqual({
        email: { before: 'a***@d***.com', after: 'b***@o***.gt' },
        firstName: { before: 'A***', after: 'B***' },
        jobTitle: { before: 'Compras', after: 'Gerencia' },
      });
      expect(JSON.stringify(changes)).not.toContain('lopez');
    });

    it('detecta el cambio sobre el valor real aunque la máscara coincida', () => {
      const changes = auditDiff({ phone: '5555-1234' }, { phone: '5555-9999' }, { maskedFields: ['phone'] });
      expect(changes).toEqual({ phone: { before: '5***', after: '5***' } });
    });

    it('un campo enmascarado sin cambios no aparece', () => {
      expect(auditDiff({ email: 'a@b.com' }, { email: 'a@b.com' }, { maskedFields: ['email'] })).toEqual({});
    });

    it('conserva nulos y vacíos, enmascara números, booleanos y listas', () => {
      expect(maskAuditValue(null)).toBeNull();
      expect(maskAuditValue('')).toBe('');
      expect(maskAuditValue(42)).toBe('***');
      expect(maskAuditValue(true)).toBe('***');
      expect(maskAuditValue(['Ana', 'x@y'])).toEqual(['A***', 'x***@y***']);
    });
  });
});
