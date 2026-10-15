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

  it('`field` filtra por clave de `changes` (D-07.10), recortado', () => {
    expect(buildAuditFilter({ field: ' phaseId ' })).toEqual({ changedField: 'phaseId' });
    expect(buildAuditFilter({ field: 'address.city_2' })).toEqual({ changedField: 'address.city_2' });
    expect(buildAuditFilter({ field: '   ' })).toEqual({});
  });

  it.each([["name'; DROP TABLE audit_logs; --"], ['a b'], ['campo?'], ['x'.repeat(101)], ['ñandú']])(
    '`field` fuera de [A-Za-z0-9_.]{1,100} es un 400: %s',
    (field) => {
      expect(() => buildAuditFilter({ field })).toThrow(BadRequestException);
    },
  );

  it('combina todos los filtros (AC-07.34)', () => {
    expect(
      buildAuditFilter({
        event: 'crm.project.',
        search: 'ana',
        subjectId: 'u-1',
        resourceType: 'crm.project',
        resourceId: 'p-1',
        correlationId: 'c-1',
        field: 'phaseId',
        from: '2026-10-01',
        to: '2026-10-08',
      }),
    ).toEqual({
      eventPrefix: 'crm.project.',
      subjectSearch: 'ana',
      subjectId: 'u-1',
      resourceType: 'crm.project',
      resourceId: 'p-1',
      correlationId: 'c-1',
      changedField: 'phaseId',
      occurredFrom: new Date('2026-10-01T00:00:00.000Z'),
      occurredBefore: new Date('2026-10-09T00:00:00.000Z'),
    });
  });

  it('`from` posterior a `to` es un 400', () => {
    expect(() => buildAuditFilter({ from: '2026-10-09', to: '2026-10-08' })).toThrow(BadRequestException);
  });
});

describe('describeAuditFilter', () => {
  it('aplana sólo los filtros activos para los metadatos de la exportación', () => {
    expect(describeAuditFilter({ event: 'auth.', search: ' ', from: '2026-10-01', field: 'phaseId' })).toEqual({
      'filter.event': 'auth.',
      'filter.from': '2026-10-01',
      'filter.field': 'phaseId',
    });
  });
});
