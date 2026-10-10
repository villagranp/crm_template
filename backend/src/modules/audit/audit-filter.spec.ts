import { BadRequestException } from '@nestjs/common';

import { buildAuditFilter, describeAuditFilter } from './audit-filter';

describe('buildAuditFilter', () => {
  it('sin filtros no restringe nada', () => {
    expect(buildAuditFilter({})).toEqual({});
  });

  it('un evento sin comodín es exacto', () => {
    expect(buildAuditFilter({ event: 'role.updated' })).toEqual({ event: 'role.updated' });
  });

  it('un evento terminado en punto o asterisco es un prefijo', () => {
    expect(buildAuditFilter({ event: 'auth.' })).toEqual({ eventPrefix: 'auth.' });
    expect(buildAuditFilter({ event: 'user.*' })).toEqual({ eventPrefix: 'user.' });
    expect(buildAuditFilter({ event: '*' })).toEqual({});
  });

  it('ignora textos vacíos y recorta espacios', () => {
    expect(
      buildAuditFilter({ search: '  ana@  ', subjectId: ' ', resourceType: 'role', resourceId: 'r-1', correlationId: 'c-1' }),
    ).toEqual({ subjectSearch: 'ana@', resourceType: 'role', resourceId: 'r-1', correlationId: 'c-1' });
  });

  it('una fecha sin hora en `to` incluye el día entero (UTC)', () => {
    const filter = buildAuditFilter({ from: '2026-10-01', to: '2026-10-08' });
    expect(filter.occurredFrom?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(filter.occurredBefore?.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('un `to` con hora es inclusivo hasta ese instante', () => {
    const filter = buildAuditFilter({ to: '2026-10-08T10:00:00.000Z' });
    expect(filter.occurredBefore?.toISOString()).toBe('2026-10-08T10:00:00.001Z');
  });

  it('el mismo día en `from` y `to` es válido', () => {
    expect(() => buildAuditFilter({ from: '2026-10-08', to: '2026-10-08' })).not.toThrow();
  });

  it('`from` posterior a `to` es un 400', () => {
    expect(() => buildAuditFilter({ from: '2026-10-09', to: '2026-10-08' })).toThrow(BadRequestException);
  });
});

describe('describeAuditFilter', () => {
  it('aplana sólo los filtros activos para los metadatos de la exportación', () => {
    expect(describeAuditFilter({ event: 'auth.', search: ' ', from: '2026-10-01' })).toEqual({
      'filter.event': 'auth.',
      'filter.from': '2026-10-01',
    });
  });
});
