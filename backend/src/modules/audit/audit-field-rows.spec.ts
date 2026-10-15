import { formatAuditValue, toAuditFieldRows } from './audit-field-rows';
import type { AuditLogRecord } from './ports/audit-query.repository.port';

function record(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: 'id-1',
    occurredAt: new Date('2026-10-08T10:00:00.000Z'),
    event: 'crm.project.phase_changed',
    correlationId: 'c',
    subjectId: 'u-1',
    subjectEmail: 'ana@example.com',
    resourceType: 'crm.project',
    resourceId: 'p-1',
    ipAddress: null,
    changes: null,
    metadata: null,
    ...overrides,
  };
}

const BASE = {
  occurredAt: new Date('2026-10-08T10:00:00.000Z'),
  user: 'ana@example.com',
  resourceType: 'crm.project',
  resourceId: 'p-1',
  event: 'crm.project.phase_changed',
};

describe('formatAuditValue', () => {
  it('texto tal cual, nulo vacío, el resto como JSON', () => {
    expect(formatAuditValue('Diseño')).toBe('Diseño');
    expect(formatAuditValue(null)).toBeNull();
    expect(formatAuditValue(undefined)).toBeNull();
    expect(formatAuditValue(42)).toBe('42');
    expect(formatAuditValue(false)).toBe('false');
    expect(formatAuditValue(['a', 'b'])).toBe('["a","b"]');
    expect(formatAuditValue({ x: 1 })).toBe('{"x":1}');
  });
});

describe('toAuditFieldRows (AC-07.35, RN-07.42)', () => {
  it('una fila por campo { before, after }, en el orden guardado', () => {
    const rows = toAuditFieldRows(
      record({ changes: { phaseId: { before: 'f-1', after: 'f-2' }, phaseProgress: { before: 10, after: null } } }),
    );
    expect(rows).toEqual([
      { ...BASE, field: 'phaseId', before: 'f-1', after: 'f-2' },
      { ...BASE, field: 'phaseProgress', before: '10', after: null },
    ]);
  });

  it('con `onlyField`, solo ese campo', () => {
    const rows = toAuditFieldRows(
      record({ changes: { phaseId: { before: 'f-1', after: 'f-2' }, name: { before: 'A', after: 'B' } } }),
      'name',
    );
    expect(rows).toEqual([{ ...BASE, field: 'name', before: 'A', after: 'B' }]);
  });

  it('un valor sin la forma { before, after } (registro antiguo) va como JSON en Valor nuevo', () => {
    const rows = toAuditFieldRows(record({ changes: { roles: ['a', 'b'], name: { antes: 'A', despues: 'B' }, note: 'texto' } }));
    expect(rows).toEqual([
      { ...BASE, field: 'roles', before: null, after: '["a","b"]' },
      { ...BASE, field: 'name', before: null, after: '{"antes":"A","despues":"B"}' },
      { ...BASE, field: 'note', before: null, after: 'texto' },
    ]);
  });

  it('un evento sin cambios queda como una fila sin campo', () => {
    expect(toAuditFieldRows(record({ changes: null }))).toEqual([{ ...BASE, field: null, before: null, after: null }]);
    expect(toAuditFieldRows(record({ changes: {} }))).toEqual([{ ...BASE, field: null, before: null, after: null }]);
  });

  it('`changes` que no es un objeto se conserva como JSON', () => {
    expect(toAuditFieldRows(record({ changes: ['x'] }))).toEqual([{ ...BASE, field: null, before: null, after: '["x"]' }]);
  });

  it('sin correo, el usuario es el identificador del actor', () => {
    const [row] = toAuditFieldRows(record({ subjectEmail: null, changes: { a: { before: 1, after: 2 } } }));
    expect(row?.user).toBe('u-1');
  });
});
