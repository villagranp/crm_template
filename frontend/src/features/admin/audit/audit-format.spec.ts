import { describe, expect, it } from 'vitest';

import { describeActor, toChangeRows, toMetadataRows } from './audit-format';

describe('toChangeRows', () => {
  it('convierte la diferencia en filas legibles', () => {
    expect(
      toChangeRows({ name: { before: null, after: 'A' }, roles: { before: [], after: ['x', 'y'] }, active: { before: true, after: false } }),
    ).toEqual([
      { field: 'name', before: '—', after: 'A' },
      { field: 'roles', before: '—', after: 'x, y' },
      { field: 'active', before: 'true', after: 'false' },
    ]);
  });

  it('devuelve null si no tiene la forma de diferencia', () => {
    expect(toChangeRows(null)).toBeNull();
    expect(toChangeRows({ name: 'A' })).toBeNull();
    expect(toChangeRows([1])).toBeNull();
  });
});

describe('toMetadataRows', () => {
  it('aplana los metadatos', () => {
    expect(toMetadataRows({ rows: 3, truncated: false })).toEqual([
      { key: 'rows', value: '3' },
      { key: 'truncated', value: 'false' },
    ]);
    expect(toMetadataRows(null)).toBeNull();
  });
});

describe('describeActor', () => {
  it('prefiere el correo, luego el id y si no, Sistema', () => {
    expect(describeActor({ subjectEmail: 'a@b.c', subjectId: '1' })).toBe('a@b.c');
    expect(describeActor({ subjectEmail: null, subjectId: '1' })).toBe('1');
    expect(describeActor({ subjectEmail: null, subjectId: null })).toBe('Sistema');
  });
});
