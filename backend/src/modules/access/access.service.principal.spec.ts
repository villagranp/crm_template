import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

import { AccessService } from './access.service';
import type { AccessRepository, AccessUserRecord, UserStatus } from './ports/access.repository.port';

const OID = '00000000-0000-4000-8000-0000000000aa';

const record = (id: string, status: UserStatus = 'ACTIVE'): AccessUserRecord => ({ id, email: 'persona@example.invalid', displayName: 'Persona', status, jobTitle: null, teams: [] });

function principal(overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return { subjectId: OID, type: 'user', email: 'persona@example.invalid', providerRoles: [], issuedBy: 'entra', ...overrides };
}

function build(options: { linked?: AccessUserRecord | null; byEmail?: AccessUserRecord | null } = {}) {
  const repository = {
    findUserBySubject: jest.fn(async () => options.linked ?? null),
    findUserByEmail: jest.fn(async () => options.byEmail ?? null),
  };
  return { service: new AccessService(repository as unknown as AccessRepository), repository };
}

describe('AccessService.findUserIdForPrincipal · Entra ID (ADR-027): nunca por correo', () => {
  it('con vínculo por oid devuelve el usuario', async () => {
    const { service, repository } = build({ linked: record('user-1') });
    await expect(service.findUserIdForPrincipal(principal())).resolves.toBe('user-1');
    expect(repository.findUserBySubject).toHaveBeenCalledWith('ENTRA_ID', OID, undefined);
  });

  it('pasa el tenant del token a la búsqueda de la identidad', async () => {
    const { service, repository } = build({ linked: record('user-1') });
    await service.findUserIdForPrincipal(principal({ tenantId: 'tenant-1' }));
    expect(repository.findUserBySubject).toHaveBeenCalledWith('ENTRA_ID', OID, 'tenant-1');
  });

  it('recuerda el resultado por principal: la misma petición no repite la consulta (incluso si fue null)', async () => {
    const found = build({ linked: record('user-1') });
    const same = principal();
    await expect(found.service.findUserIdForPrincipal(same)).resolves.toBe('user-1');
    await expect(found.service.findUserIdForPrincipal(same)).resolves.toBe('user-1');
    expect(found.repository.findUserBySubject).toHaveBeenCalledTimes(1);

    const missing = build({ linked: null });
    const nobody = principal();
    await missing.service.findUserIdForPrincipal(nobody);
    await missing.service.findUserIdForPrincipal(nobody);
    expect(missing.repository.findUserBySubject).toHaveBeenCalledTimes(1);
  });

  it('otra petición (otro objeto principal) vuelve a consultar: un cambio de estado se ve en la siguiente', async () => {
    const { service, repository } = build({ linked: record('user-1') });
    await service.findUserIdForPrincipal(principal());
    await service.findUserIdForPrincipal(principal());
    expect(repository.findUserBySubject).toHaveBeenCalledTimes(2);
  });

  it('sin vínculo NO cae al correo aunque exista un usuario con ese correo', async () => {
    const { service, repository } = build({ linked: null, byEmail: record('user-by-email') });
    await expect(service.findUserIdForPrincipal(principal())).resolves.toBeNull();
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
  });

  it.each<UserStatus>(['SUSPENDED', 'LOCKED'])('un vinculado %s autentica pero no recibe permisos (null)', async (status) => {
    const { service } = build({ linked: record('user-1', status) });
    await expect(service.findUserIdForPrincipal(principal())).resolves.toBeNull();
  });

  it('un vinculado INVITED conserva su cuenta', async () => {
    const { service } = build({ linked: record('user-1', 'INVITED') });
    await expect(service.findUserIdForPrincipal(principal())).resolves.toBe('user-1');
  });
});

describe('AccessService.findUserIdForPrincipal · local: comportamiento conservado', () => {
  const local = (overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal => principal({ issuedBy: 'local', ...overrides });

  it('con vínculo LOCAL devuelve el usuario', async () => {
    const { service, repository } = build({ linked: record('user-1') });
    await expect(service.findUserIdForPrincipal(local())).resolves.toBe('user-1');
    expect(repository.findUserBySubject).toHaveBeenCalledWith('LOCAL', OID);
  });

  it('con local no se recuerda nada: cada llamada consulta', async () => {
    const { service, repository } = build({ linked: record('user-1') });
    const same = local();
    await service.findUserIdForPrincipal(same);
    await service.findUserIdForPrincipal(same);
    expect(repository.findUserBySubject).toHaveBeenCalledTimes(2);
  });

  it('sin vínculo cae al correo', async () => {
    const { service, repository } = build({ linked: null, byEmail: record('user-by-email') });
    await expect(service.findUserIdForPrincipal(local())).resolves.toBe('user-by-email');
    expect(repository.findUserByEmail).toHaveBeenCalledWith('persona@example.invalid');
  });

  it('el correo de una cuenta suspendida no da acceso; sin correo no hay cuenta', async () => {
    await expect(build({ byEmail: record('u', 'SUSPENDED') }).service.findUserIdForPrincipal(local())).resolves.toBeNull();
    await expect(build({ byEmail: record('u') }).service.findUserIdForPrincipal(local({ email: undefined }))).resolves.toBeNull();
  });
});

describe('AccessService.isLinkedTo', () => {
  it('delega en el puerto', async () => {
    const repository = { userHasIdentity: jest.fn(async () => true) };
    const service = new AccessService(repository as unknown as AccessRepository);
    await expect(service.isLinkedTo('user-1', 'ENTRA_ID')).resolves.toBe(true);
    expect(repository.userHasIdentity).toHaveBeenCalledWith('user-1', 'ENTRA_ID');
  });
});

describe('AccessService.findUserRefByIdentifier (--actor de los scripts)', () => {
  function buildRef() {
    const repository = {
      findUserByEmail: jest.fn(async () => record('user-by-email')),
      findUserIdByEmployeeCode: jest.fn(async (code: string) => (code === 'EMP-1' ? 'user-by-code' : null)),
      findUserDetail: jest.fn(async () => ({ id: 'user-by-code', email: 'codigo@example.invalid' })),
    };
    return { service: new AccessService(repository as unknown as AccessRepository), repository };
  }

  it('con @ busca por correo', async () => {
    const { service, repository } = buildRef();
    await expect(service.findUserRefByIdentifier(' Admin@Example.invalid ')).resolves.toEqual({ id: 'user-by-email', email: 'persona@example.invalid' });
    expect(repository.findUserByEmail).toHaveBeenCalledWith('Admin@Example.invalid');
    expect(repository.findUserIdByEmployeeCode).not.toHaveBeenCalled();
  });

  it('sin @ busca por código de colaborador en mayúsculas', async () => {
    const { service, repository } = buildRef();
    await expect(service.findUserRefByIdentifier(' emp-1 ')).resolves.toEqual({ id: 'user-by-code', email: 'codigo@example.invalid' });
    expect(repository.findUserIdByEmployeeCode).toHaveBeenCalledWith('EMP-1');
  });

  it('un código inexistente o de un usuario eliminado devuelve null', async () => {
    const { service, repository } = buildRef();
    await expect(service.findUserRefByIdentifier('NO-EXISTE')).resolves.toBeNull();
    repository.findUserDetail.mockResolvedValueOnce(null as never);
    await expect(service.findUserRefByIdentifier('EMP-1')).resolves.toBeNull();
  });
});
