import type { CustomerActor } from '@/modules/customers/customer-actor.resolver';

import { canManageImport, canViewImport, importCapabilities } from './customer-import-access-policy';
import type { CustomerImportDetailRecord } from './ports/customer-imports.repository.port';

function actor(userId: string, permissions: string[]): CustomerActor {
  return { userId, permissions: new Set(permissions), audit: { correlationId: 'c', actorId: userId, actorEmail: null, ipAddress: null } };
}

function record(overrides: Partial<CustomerImportDetailRecord> = {}): CustomerImportDetailRecord {
  return {
    id: 'imp-1', code: 'IMP-2026-0001', format: 'CSV', originalFileName: 'a.csv', status: 'VALIDATED', templateVersion: '1',
    totalRows: 3, validRows: 2, invalidRows: 1, importedRows: 0, failureReason: null,
    startedBy: { id: 'author', displayName: 'Autor' }, validatedAt: null, confirmedBy: null, confirmedAt: null, completedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    stats: { rejectedRows: 0, warningRows: 0, notImportedRows: 1, isPurged: false },
    ...overrides,
  };
}

const ALL = ['importaciones.ver', 'importaciones.crear', 'clientes.crear'];
const OWN = { viewAll: false, manageAll: false };

describe('política de acceso a cargas (06 H.1, H.4, RN-06.19, D-06.10)', () => {
  it('el autor ve y gestiona su carga; otro usuario sin alcance ORGANIZATION no', () => {
    expect(canViewImport(actor('author', ALL), OWN, record())).toBe(true);
    expect(canManageImport(actor('author', ALL), OWN, record())).toBe(true);
    expect(canViewImport(actor('other', ALL), OWN, record())).toBe(false);
    expect(canManageImport(actor('other', ALL), OWN, record())).toBe(false);
  });

  it('cada operación usa el alcance de su propio permiso (roles combinados)', () => {
    expect(canViewImport(actor('other', ALL), { viewAll: true, manageAll: false }, record())).toBe(true);
    expect(canManageImport(actor('other', ALL), { viewAll: true, manageAll: false }, record())).toBe(false);
    expect(canManageImport(actor('other', ALL), { viewAll: false, manageAll: true }, record())).toBe(true);
  });

  it('sin el permiso no hay acceso aunque sea el autor', () => {
    expect(canViewImport(actor('author', ['importaciones.crear']), OWN, record())).toBe(false);
    expect(canManageImport(actor('author', ['importaciones.ver']), OWN, record())).toBe(false);
  });

  it('capabilities: confirmar exige VALIDATED, habilitación, clientes.crear, filas válidas y datos sin purgar', () => {
    const author = actor('author', ALL);
    expect(importCapabilities(author, OWN, record(), true)).toEqual({ canConfirm: true, canCancel: true, hasErrorFile: true });
    expect(importCapabilities(author, OWN, record(), false)).toEqual({ canConfirm: false, canCancel: false, hasErrorFile: true });
    expect(importCapabilities(actor('author', ['importaciones.ver', 'importaciones.crear']), OWN, record(), true).canConfirm).toBe(false);
    expect(importCapabilities(author, OWN, record({ validRows: 0 }), true)).toMatchObject({ canConfirm: false, canCancel: true });
    expect(importCapabilities(author, OWN, record({ status: 'COMPLETED' }), true)).toMatchObject({ canConfirm: false, canCancel: false });
    const purged = record({ stats: { rejectedRows: 0, warningRows: 0, notImportedRows: 1, isPurged: true } });
    expect(importCapabilities(author, OWN, purged, true)).toEqual({ canConfirm: false, canCancel: true, hasErrorFile: false });
  });
});
