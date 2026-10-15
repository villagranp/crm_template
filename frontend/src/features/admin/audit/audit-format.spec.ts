import { describe, expect, it } from 'vitest';

import {
  describeActor,
  fieldLabel,
  KNOWN_RESOURCE_TYPES,
  resourceTypeLabel,
  toChangeRows,
  toFieldRows,
  toMetadataRows,
} from './audit-format';
import type { AuditLogEntry } from './audit.api';

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

function entry(id: string, changes: unknown): AuditLogEntry {
  return {
    id,
    occurredAt: '2026-10-08T10:00:00.000Z',
    event: 'crm.project.phase_changed',
    correlationId: 'c',
    subjectId: 's',
    subjectEmail: 'ana@example.test',
    resourceType: 'crm.project',
    resourceId: 'p-1',
    ipAddress: null,
    changes,
    metadata: null,
  };
}

describe('PF-07.18: vista por campo', () => {
  it('una fila por campo, marcando la primera de cada evento', () => {
    const rows = toFieldRows([
      entry('e-1', { phaseId: { before: 'f-1', after: 'f-2' }, progress: { before: 10, after: 40 } }),
      entry('e-2', { name: { before: null, after: 'Torre' } }),
    ]);
    expect(rows.map(({ entry: e, field, before, after, isFirstOfEvent }) => [e.id, field, before, after, isFirstOfEvent])).toEqual([
      ['e-1', 'phaseId', 'f-1', 'f-2', true],
      ['e-1', 'progress', '10', '40', false],
      ['e-2', 'name', '—', 'Torre', true],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
  });

  it('registros antiguos: valor sin {before, after} como JSON y evento sin cambios en una fila sin campo', () => {
    const rows = toFieldRows([entry('e-1', { tags: ['a'] }), entry('e-2', null), entry('e-3', 'texto')]);
    expect(rows.map(({ field, before, after }) => [field, before, after])).toEqual([
      ['tags', '—', '["a"]'],
      [null, '—', '—'],
      [null, '—', '"texto"'],
    ]);
  });

  it('con filtro de campo deja sólo ese campo', () => {
    const rows = toFieldRows(
      [entry('e-1', { phaseId: { before: 'f-1', after: 'f-2' }, progress: { before: 10, after: 40 } })],
      'progress',
    );
    expect(rows.map((row) => [row.field, row.isFirstOfEvent])).toEqual([['progress', true]]);
  });
});

describe('etiquetas de entidad y campo', () => {
  it('traduce los tipos conocidos y deja los demás tal cual', () => {
    expect(resourceTypeLabel('crm.customer')).toBe('Cliente');
    expect(resourceTypeLabel('crm.exchange_rate')).toBe('Tipo de cambio');
    expect(resourceTypeLabel('user')).toBe('Usuario');
    expect(resourceTypeLabel('otro.tipo')).toBe('otro.tipo');
    expect(resourceTypeLabel(null)).toBe('—');
    expect(KNOWN_RESOURCE_TYPES).toContain('crm.opportunity');
  });

  it('traduce los campos comunes', () => {
    expect(fieldLabel('employeeCode')).toBe('Código de colaborador');
    expect(fieldLabel('phaseId')).toBe('Fase');
    expect(fieldLabel('campoRaro')).toBe('campoRaro');
  });
});
