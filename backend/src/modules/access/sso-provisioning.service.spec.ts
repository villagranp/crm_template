import type { AppConfigService } from '@/config/app-config.service';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { AccessRepository, AccessUserRecord, ProvisionExternalUserOutcome } from './ports/access.repository.port';
import { SSO_SOURCE, SsoProvisioningService, USER_PROVISIONED_EVENT } from './sso-provisioning.service';

const OID = '00000000-0000-4000-8000-0000000000aa';
const TENANT = '11111111-1111-4111-8111-111111111111';
const CONTEXT = { correlationId: 'corr-1', ipAddress: '203.0.113.9' };

function principal(overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return {
    subjectId: OID,
    type: 'user',
    tenantId: TENANT,
    email: 'Ana.Beltran@Example.invalid',
    displayName: 'Ana Beltrán',
    providerRoles: [],
    issuedBy: 'entra',
    ...overrides,
  };
}

const existingUser = (): AccessUserRecord => ({ id: 'user-existing', email: 'ana.beltran@example.invalid', displayName: 'Ana', status: 'ACTIVE', jobTitle: null, teams: [] });

function build(options: { owner?: { userId: string } | null; byEmail?: AccessUserRecord | null; enabled?: boolean; domains?: string; outcome?: ProvisionExternalUserOutcome } = {}) {
  const repository = {
    findIdentityOwner: jest.fn(async () => (options.owner === undefined ? null : options.owner && { ...options.owner, status: 'ACTIVE', userDeleted: false })),
    findUserByEmail: jest.fn(async () => options.byEmail ?? null),
    provisionExternalUser: jest.fn(async (): Promise<ProvisionExternalUserOutcome> => options.outcome ?? { kind: 'created', userId: 'user-new' }),
  };
  const parameters = {
    get: jest.fn(async (key: string) => (key === 'seguridad.sso_dominios_permitidos' ? (options.domains ?? 'example.invalid') : (options.enabled ?? true))),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => TENANT) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new SsoProvisioningService(
    repository as unknown as AccessRepository,
    parameters as unknown as ParameterReader,
    audit as unknown as AuditService,
    config as unknown as AppConfigService,
    logger as unknown as AppLogger,
  );
  return { service, repository, parameters, audit, logger };
}

describe('SsoProvisioningService · admisión', () => {
  it('con identidad ya vinculada no hace nada más que una consulta por el índice de la identidad', async () => {
    const { service, repository, parameters, audit } = build({ owner: { userId: 'user-1' } });
    await service.admit(principal(), CONTEXT);
    expect(repository.findIdentityOwner).toHaveBeenCalledWith('ENTRA_ID', OID, TENANT);
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
    expect(parameters.get).not.toHaveBeenCalled();
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['suspendido', 'SUSPENDED', false],
    ['bloqueado', 'LOCKED', false],
    ['eliminado', 'ACTIVE', true],
  ])('identidad vinculada a un usuario %s: no se crea nada ni se rechaza (autentica sin permisos)', async (_name, status, userDeleted) => {
    const { service, repository } = build();
    repository.findIdentityOwner.mockResolvedValue({ userId: 'user-1', status, userDeleted } as never);
    await expect(service.admit(principal(), CONTEXT)).resolves.toBeUndefined();
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
  });

  it('primer ingreso: crea el usuario con correo en minúsculas, nombres derivados y tenant, y audita user.provisioned con actor sistema', async () => {
    const { service, repository, audit, logger } = build();
    await service.admit(principal(), CONTEXT);

    expect(repository.provisionExternalUser).toHaveBeenCalledWith({
      provider: 'ENTRA_ID',
      subject: OID,
      tenantId: TENANT,
      email: 'ana.beltran@example.invalid',
      firstName: 'Ana',
      lastName: 'Beltrán',
      displayName: 'Ana Beltrán',
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      USER_PROVISIONED_EVENT,
      { correlationId: 'corr-1', actorId: null, actorEmail: null, ipAddress: '203.0.113.9' },
      expect.objectContaining({
        resourceType: 'user',
        resourceId: 'user-new',
        before: null,
        after: expect.objectContaining({ status: 'ACTIVE', roles: [] }),
        maskedFields: ['email', 'displayName'],
        metadata: { source: SSO_SOURCE, actor: 'system' },
      }),
    );
    // Sin PII en el log: ni correo, ni nombre, ni oid.
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain('user-new');
    for (const secret of ['ana.beltran', 'Ana', OID]) expect(logged).not.toContain(secret);
  });

  it('el usuario nuevo nace sin roles, permisos, equipos ni país: el puerto no recibe nada de eso', async () => {
    const { service, repository } = build();
    await service.admit(principal(), CONTEXT);
    const input = (repository.provisionExternalUser.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(['displayName', 'email', 'firstName', 'lastName', 'provider', 'subject', 'tenantId']);
  });

  it('sin tenant en el principal usa ENTRA_TENANT_ID de la configuración', async () => {
    const { service, repository } = build();
    await service.admit(principal({ tenantId: undefined }), CONTEXT);
    expect(repository.provisionExternalUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }));
  });

  it.each([undefined, '', 'sin-arroba', 'ana_empresa.com#EXT#@tenant.onmicrosoft.com'])('sin correo utilizable (%p): 403 IDENTITY_INCOMPLETE y no crea', async (email) => {
    const { service, repository, audit } = build();
    await expect(service.admit(principal({ email }), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_INCOMPLETE' });
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('correo ya existente sin vínculo: 403 IDENTITY_NOT_LINKED, no vincula ni crea otro (aunque el interruptor esté apagado)', async () => {
    for (const enabled of [true, false]) {
      const { service, repository, audit, parameters } = build({ byEmail: existingUser(), enabled });
      await expect(service.admit(principal(), CONTEXT)).rejects.toMatchObject({
        code: 'IDENTITY_NOT_LINKED',
        message: 'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.',
      });
      expect(repository.provisionExternalUser).not.toHaveBeenCalled();
      expect(parameters.get).not.toHaveBeenCalledWith('seguridad.sso_alta_automatica');
      expect(audit.record).not.toHaveBeenCalled();
    }
  });

  it('carrera: el usuario con ese correo lo creó una petición simultánea de este mismo ingreso (la identidad ya existe al releer): no es NOT_LINKED', async () => {
    const { service, repository, audit } = build({ byEmail: existingUser() });
    repository.findIdentityOwner.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: 'user-existing', status: 'ACTIVE', userDeleted: false } as never);
    await expect(service.admit(principal(), CONTEXT)).resolves.toBeUndefined();
    expect(repository.findIdentityOwner).toHaveBeenCalledTimes(2);
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('dominio no autorizado: 403 IDENTITY_DOMAIN_NOT_ALLOWED antes de mirar el correo existente o el interruptor, y no crea', async () => {
    const { service, repository, audit, parameters } = build({ domains: 'somosgrupoag.com', byEmail: existingUser() });
    await expect(service.admit(principal(), CONTEXT)).rejects.toMatchObject({
      code: 'IDENTITY_DOMAIN_NOT_ALLOWED',
      message: 'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.',
    });
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
    expect(parameters.get).not.toHaveBeenCalledWith('seguridad.sso_alta_automatica');
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['evil-somosgrupoag.com', 'ana@evil-somosgrupoag.com'],
    ['somosgrupoag.com.evil.io', 'ana@somosgrupoag.com.evil.io'],
    ['subdominio', 'ana@sub.somosgrupoag.com'],
  ])('dominio %s no vale (coincidencia exacta)', async (_name, email) => {
    const { service, repository } = build({ domains: 'somosgrupoag.com' });
    await expect(service.admit(principal({ email }), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_DOMAIN_NOT_ALLOWED' });
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
  });

  it('el dominio se compara sin distinguir mayúsculas y la lista admite varios', async () => {
    const { service, repository } = build({ domains: ' Otro.example.invalid , SOMOSGRUPOAG.com ' });
    await service.admit(principal({ email: 'Ana@SomosGrupoAG.COM' }), CONTEXT);
    expect(repository.provisionExternalUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@somosgrupoag.com' }));
  });

  it.each(['', '   ', 'basura sin punto'])('una lista de dominios vacía o ilegible (%p) no autoriza a nadie', async (domains) => {
    const { service, repository } = build({ domains });
    await expect(service.admit(principal(), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_DOMAIN_NOT_ALLOWED' });
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
  });

  it('el dominio solo frena altas nuevas: un usuario ya vinculado entra aunque su dominio no esté en la lista', async () => {
    const { service, parameters } = build({ domains: 'otro.example.invalid', owner: { userId: 'user-1' } });
    await expect(service.admit(principal(), CONTEXT)).resolves.toBeUndefined();
    expect(parameters.get).not.toHaveBeenCalled();
  });

  it('un correo con caracteres de ancho cero o bidi no es utilizable: IDENTITY_INCOMPLETE', async () => {
    const { service } = build();
    await expect(service.admit(principal({ email: `ana${String.fromCharCode(0x200b)}@example.invalid` }), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_INCOMPLETE' });
    await expect(service.admit(principal({ email: `ana@example.invalid${String.fromCharCode(0x202e)}` }), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_INCOMPLETE' });
  });

  it('cada alta deja el log estructurado sso_user_provisioned (info) con userId y correlationId, y nada más', async () => {
    const { service, logger } = build();
    await service.admit(principal(), CONTEXT);
    expect(logger.info).toHaveBeenCalledWith('sso_user_provisioned', { correlationId: 'corr-1', userId: 'user-new' });
  });

  it('una carrera (linked) no registra sso_user_provisioned: solo cuenta el alta real', async () => {
    const { service, logger } = build({ outcome: { kind: 'linked', userId: 'user-new' } });
    await service.admit(principal(), CONTEXT);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('si falla la auditoría tras el alta: log error con el userId (sin PII) y el fallo se propaga', async () => {
    const { service, audit, logger } = build();
    audit.record.mockRejectedValue(new Error('insert falló'));
    await expect(service.admit(principal(), CONTEXT)).rejects.toThrow('insert falló');
    expect(logger.error).toHaveBeenCalledWith('sso_provisioning_audit_failed', { correlationId: 'corr-1', userId: 'user-new', errorName: 'Error' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ana.beltran');
  });

  it('el mensaje de IDENTITY_NOT_LINKED no revela datos de la cuenta existente', async () => {
    const { service } = build({ byEmail: existingUser() });
    const error = await service.admit(principal(), CONTEXT).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain('user-existing');
    expect((error as Error).message).not.toContain('example.invalid');
  });

  it('interruptor apagado: 403 SSO_PROVISIONING_DISABLED y no crea', async () => {
    const { service, repository, parameters, audit } = build({ enabled: false });
    await expect(service.admit(principal(), CONTEXT)).rejects.toMatchObject({ code: 'SSO_PROVISIONING_DISABLED' });
    expect(parameters.get).toHaveBeenCalledWith('seguridad.sso_alta_automatica');
    expect(repository.provisionExternalUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('carrera: otra petición ya creó la cuenta (linked): no duplica ni audita de nuevo, y no falla', async () => {
    const { service, audit } = build({ outcome: { kind: 'linked', userId: 'user-new' } });
    await expect(service.admit(principal(), CONTEXT)).resolves.toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('carrera: el correo lo ocupó otro usuario entre la comprobación y la escritura: 403 IDENTITY_NOT_LINKED', async () => {
    const { service, audit } = build({ outcome: { kind: 'email_taken' } });
    await expect(service.admit(principal(), CONTEXT)).rejects.toMatchObject({ code: 'IDENTITY_NOT_LINKED' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['local', { issuedBy: 'local' as const }],
    ['servicio', { type: 'service' as const }],
  ])('no interviene con principals %s', async (_name, overrides) => {
    const { service, repository } = build();
    await service.admit(principal(overrides), CONTEXT);
    expect(repository.findIdentityOwner).not.toHaveBeenCalled();
  });

  it('un error inesperado del adaptador se propaga (nunca se traga ni se convierte en alta)', async () => {
    const { service, repository } = build();
    repository.provisionExternalUser.mockRejectedValue(new Error('db caída'));
    await expect(service.admit(principal(), CONTEXT)).rejects.toThrow('db caída');
  });

  it('los 403 se registran con el código y la correlación, sin datos de la identidad', async () => {
    const { service, logger } = build({ byEmail: existingUser() });
    await service.admit(principal(), CONTEXT).catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledWith('sso_admission_denied', { correlationId: 'corr-1', code: 'IDENTITY_NOT_LINKED' });
  });
});
