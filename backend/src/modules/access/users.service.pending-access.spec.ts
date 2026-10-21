import type { AuditService } from '@/modules/audit/audit.service';
import type { InitialCredentialService } from '@/modules/auth/initial-credential.service';

import type { AccessService } from './access.service';
import type { ListUsersQueryDto } from './dto/user.dto';
import type { AccessRepository } from './ports/access.repository.port';
import { UsersService } from './users.service';

/** ADR-027: `pendingAccess` llega del filtro HTTP al puerto, y la exportación lo respeta y lo audita. */
function build() {
  const repository = { listUsers: jest.fn(async () => ({ items: [], totalItems: 0 })) };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new UsersService(
    repository as unknown as AccessRepository,
    {} as never,
    {} as unknown as InitialCredentialService,
    audit as unknown as AuditService,
    {} as unknown as AccessService,
  );
  return { service, repository, audit };
}

const query = (overrides: Partial<ListUsersQueryDto>): ListUsersQueryDto => ({ page: 1, pageSize: 20, ...overrides }) as ListUsersQueryDto;

describe('UsersService · pendingAccess (ADR-027)', () => {
  it.each([true, false, undefined])('la lista pasa pendingAccess=%p al puerto', async (pendingAccess) => {
    const { service, repository } = build();
    await service.list(query({ pendingAccess }));
    expect(repository.listUsers).toHaveBeenCalledWith(expect.objectContaining({ pendingAccess }));
  });

  it('la exportación aplica el mismo filtro y lo deja en la auditoría', async () => {
    const { service, repository, audit } = build();
    await service.export({ pendingAccess: true } as never, { userId: 'admin', audit: { correlationId: 'c', actorId: 'admin', actorEmail: null, ipAddress: null } });
    expect(repository.listUsers).toHaveBeenCalledWith(expect.objectContaining({ pendingAccess: true }));
    expect(audit.record).toHaveBeenCalledWith('user.exported', expect.anything(), expect.objectContaining({ metadata: expect.objectContaining({ pendingAccess: true }) }));
  });
});
