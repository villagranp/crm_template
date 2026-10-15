import { MAX_EXPORT_ROWS } from '@/common/csv';

import { AuditQueryService } from './audit-query.service';
import type { AuditContext, AuditService } from './audit.service';
import type { AuditLogFilter, AuditLogRecord, AuditQueryRepository } from './ports/audit-query.repository.port';

const CONTEXT: AuditContext = { correlationId: 'corr-1', actorId: 'auditor-1', actorEmail: 'a@example.com', ipAddress: null };

function row(index: number): AuditLogRecord {
  return {
    id: `id-${index}`,
    occurredAt: new Date('2026-10-08T10:00:00.000Z'),
    event: 'role.updated',
    correlationId: 'c',
    subjectId: 's',
    subjectEmail: '=HYPERLINK("x")',
    resourceType: 'role',
    resourceId: 'r',
    ipAddress: null,
    changes: { name: { before: 'A', after: 'B' } },
    metadata: null,
  };
}

function setup(rows: AuditLogRecord[]) {
  const repository: jest.Mocked<AuditQueryRepository> = {
    search: jest.fn(),
    findForExport: jest.fn<Promise<AuditLogRecord[]>, [AuditLogFilter, number]>(async () => rows),
    listEventNames: jest.fn(),
  };
  const auditService = { record: jest.fn(async () => undefined) };
  const service = new AuditQueryService(repository, auditService as unknown as AuditService);
  return { service, repository, auditService };
}

describe('AuditQueryService.export', () => {
  it('genera el CSV, neutraliza fórmulas y deja registro de la exportación con los filtros', async () => {
    const { service, repository, auditService } = setup([row(1)]);

    const result = await service.export({ event: 'role.', search: 'ana' }, CONTEXT);

    expect(repository.findForExport).toHaveBeenCalledWith({ eventPrefix: 'role.', subjectSearch: 'ana' }, MAX_EXPORT_ROWS + 1);
    expect(result).toMatchObject({ rows: 1, truncated: false });
    expect(result.csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(result.csv).toContain('"{""name"":{""before"":""A"",""after"":""B""}}"');
    expect(auditService.record).toHaveBeenCalledWith('audit_log.exported', CONTEXT, {
      resourceType: 'audit_log',
      resourceId: '*',
      metadata: { 'filter.event': 'role.', 'filter.search': 'ana', layout: 'events', rows: 1, truncated: false },
    });
  });

  it('corta en MAX_EXPORT_ROWS y lo indica', async () => {
    const { service, auditService } = setup(Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, index) => row(index)));

    const result = await service.export({}, CONTEXT);

    expect(result).toMatchObject({ rows: MAX_EXPORT_ROWS, truncated: true });
    expect(auditService.record).toHaveBeenCalledWith(
      'audit_log.exported',
      CONTEXT,
      expect.objectContaining({ metadata: { layout: 'events', rows: MAX_EXPORT_ROWS, truncated: true } }),
    );
  });

  it('layout=fields: una fila por campo con sus columnas; el tope sigue contando eventos', async () => {
    const event: AuditLogRecord = {
      ...row(1),
      subjectEmail: 'ana@example.com',
      changes: { name: { before: 'A', after: 'B' }, isActive: { before: true, after: false } },
    };
    const { service, auditService } = setup([event]);

    const result = await service.export({ field: 'name' }, CONTEXT, 'fields');

    const lines = result.csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Fecha (UTC),Usuario,Entidad,Registro,Acción,Campo,Valor anterior,Valor nuevo');
    // Con `field`, solo la fila de ese campo.
    expect(lines.slice(1)).toEqual(['2026-10-08T10:00:00.000Z,ana@example.com,role,r,role.updated,name,A,B']);
    expect(result).toMatchObject({ rows: 1, truncated: false });
    expect(auditService.record).toHaveBeenCalledWith(
      'audit_log.exported',
      CONTEXT,
      expect.objectContaining({ metadata: { 'filter.field': 'name', layout: 'fields', rows: 1, truncated: false } }),
    );
  });

  it('layout=fields sin `field`: todos los campos del evento', async () => {
    const event: AuditLogRecord = { ...row(1), changes: { name: { before: 'A', after: 'B' }, isActive: { before: true, after: false } } };
    const { service } = setup([event]);

    const result = await service.export({}, CONTEXT, 'fields');

    const lines = result.csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(',name,A,B');
    expect(lines[2]).toContain(',isActive,true,false');
  });
});
