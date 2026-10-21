import type { AppConfigService } from '@/config/app-config.service';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import { EntraIdentityLinkService, USER_IDENTITY_LINKED_EVENT } from './entra-identity-link.service';
import type { AccessRepository, LinkIdentityOutcome } from './ports/access.repository.port';

const CONTEXT: AuditContext = { correlationId: 'corr-1', actorId: 'admin-1', actorEmail: 'admin@example.invalid', ipAddress: null };
const OID = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';

function build(outcome: LinkIdentityOutcome, tenant: string | null = 'tenant-1') {
  const repository = { linkIdentity: jest.fn(async () => outcome) };
  const audit = { record: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => tenant) };
  const service = new EntraIdentityLinkService(repository as unknown as AccessRepository, audit as unknown as AuditService, config as unknown as AppConfigService);
  return { service, repository, audit };
}

describe('EntraIdentityLinkService', () => {
  it('vincula con el oid en minúsculas y el tenant configurado, y audita user.identity_linked', async () => {
    const { service, repository, audit } = build({ kind: 'linked' });
    await expect(service.link('user-1', OID, CONTEXT)).resolves.toEqual({ kind: 'linked' });
    expect(repository.linkIdentity).toHaveBeenCalledWith({ userId: 'user-1', provider: 'ENTRA_ID', subject: OID.toLowerCase(), tenantId: 'tenant-1' });
    expect(audit.record).toHaveBeenCalledWith(
      USER_IDENTITY_LINKED_EVENT,
      CONTEXT,
      expect.objectContaining({
        resourceType: 'user',
        resourceId: 'user-1',
        after: { identityProvider: 'ENTRA_ID', identitySubject: OID.toLowerCase() },
        metadata: { source: 'LOAD_SCRIPT' },
      }),
    );
  });

  it('sin ENTRA_TENANT_ID guarda tenant nulo', async () => {
    const { service, repository } = build({ kind: 'linked' }, null);
    await service.link('user-1', OID, CONTEXT);
    expect(repository.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
  });

  it.each<LinkIdentityOutcome>([{ kind: 'already_linked' }, { kind: 'identity_taken' }])('con resultado %j no audita (no cambió nada)', async (outcome) => {
    const { service, audit } = build(outcome);
    await expect(service.link('user-1', OID, CONTEXT)).resolves.toEqual(outcome);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
