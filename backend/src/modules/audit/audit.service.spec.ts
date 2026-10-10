import { type AuditContext, AuditService } from './audit.service';
import type { AuditRepository } from './ports/audit.repository.port';

const CONTEXT: AuditContext = {
  correlationId: 'corr-1',
  actorId: 'admin-1',
  actorEmail: 'a@example.com',
  ipAddress: '10.0.0.1',
};

describe('AuditService', () => {
  function setup() {
    const repository = { record: jest.fn(async () => undefined) };
    return { repository, service: new AuditService(repository as AuditRepository) };
  }

  it('guarda el evento con el actor y solo la diferencia', async () => {
    const { service, repository } = setup();

    await service.record('role.updated', CONTEXT, {
      resourceType: 'role',
      resourceId: 'role-1',
      before: { name: 'A', description: 'x' },
      after: { name: 'B', description: 'x' },
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'role.updated',
        subjectId: 'admin-1',
        resourceType: 'role',
        resourceId: 'role-1',
        changes: { name: { before: 'A', after: 'B' } },
      }),
    );
  });

  it('una actualización sin cambios no deja registro', async () => {
    const { service, repository } = setup();

    await service.record('role.updated', CONTEXT, {
      resourceType: 'role',
      resourceId: 'role-1',
      before: { name: 'A' },
      after: { name: 'A' },
    });

    expect(repository.record).not.toHaveBeenCalled();
  });

  it('un evento sin antes/después se registra sin cambios', async () => {
    const { service, repository } = setup();

    await service.record('user.exported', CONTEXT, { resourceType: 'user', resourceId: '*', metadata: { rows: 3 } });

    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({ changes: null, metadata: { rows: 3 } }));
  });
});
