import { BusinessRuleViolationError, PermissionDeniedError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { PermissionResolver } from '@/infrastructure/authentication/ports/permission-resolver.port';
import type { AccessService } from '@/modules/access/access.service';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import { ParametersService } from './parameters.service';
import type { ParametersRepository, SystemParameterRecord } from './ports/parameters.repository.port';

const PRINCIPAL: AuthenticatedPrincipal = { subjectId: 'sub-1', type: 'user', providerRoles: [], issuedBy: 'local' };
const CONTEXT: AuditContext = { correlationId: 'corr-1', actorId: 'sub-1', actorEmail: null, ipAddress: null };

function parameter(overrides: Partial<SystemParameterRecord> = {}): SystemParameterRecord {
  return {
    id: 'p-1',
    key: 'seguridad.minutos_bloqueo',
    value: '15',
    type: 'NUMBER',
    group: 'seguridad',
    name: 'Minutos de bloqueo',
    description: null,
    isPublic: false,
    isSystem: true,
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  };
}

function setup(existing: SystemParameterRecord | null, permissions: string[]) {
  const repository: jest.Mocked<ParametersRepository> = {
    listAll: jest.fn(async () => (existing ? [existing] : [])),
    findByKey: jest.fn<Promise<SystemParameterRecord | null>, [string]>(async () => existing),
    updateValue: jest.fn(async (key: string, value: string, updatedById: string | null) =>
      parameter({ ...existing, key, value, updatedById }),
    ),
  };
  const resolver: PermissionResolver = { resolvePermissions: jest.fn(async () => new Set(permissions)) };
  const accessService = { findUserIdForPrincipal: jest.fn(async () => 'user-1') };
  const auditService = { record: jest.fn(async () => undefined) };
  const service = new ParametersService(
    repository,
    resolver,
    accessService as unknown as AccessService,
    auditService as unknown as AuditService,
  );
  return { service, repository, auditService };
}

describe('ParametersService.updateValue', () => {
  it('guarda el valor normalizado con quien lo cambió y lo audita', async () => {
    const { service, repository, auditService } = setup(parameter(), ['parametros.editar', 'parametros.configurar']);

    const updated = await service.updateValue('seguridad.minutos_bloqueo', ' 30 ', PRINCIPAL, CONTEXT);

    expect(updated.value).toBe('30');
    expect(repository.updateValue).toHaveBeenCalledWith('seguridad.minutos_bloqueo', '30', 'user-1');
    expect(auditService.record).toHaveBeenCalledWith('parameter.updated', CONTEXT, {
      resourceType: 'system_parameter',
      resourceId: 'seguridad.minutos_bloqueo',
      before: { value: '15' },
      after: { value: '30' },
    });
  });

  it('un parámetro de seguridad sin parametros.configurar es 403 y no se toca', async () => {
    const { service, repository } = setup(parameter(), ['parametros.editar']);

    await expect(service.updateValue('seguridad.minutos_bloqueo', '30', PRINCIPAL, CONTEXT)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    expect(repository.updateValue).not.toHaveBeenCalled();
  });

  it('fuera de seguridad basta parametros.editar', async () => {
    const { service } = setup(parameter({ key: 'app.nombre', type: 'STRING', group: 'general', value: 'A' }), [
      'parametros.editar',
    ]);

    await expect(service.updateValue('app.nombre', 'B', PRINCIPAL, CONTEXT)).resolves.toMatchObject({ value: 'B' });
  });

  it('una clave inexistente es 404', async () => {
    const { service } = setup(null, ['parametros.editar']);
    await expect(service.updateValue('no.existe', '1', PRINCIPAL, CONTEXT)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('un valor fuera de rango es 422 y no se guarda', async () => {
    const { service, repository } = setup(parameter(), ['parametros.editar', 'parametros.configurar']);

    await expect(service.updateValue('seguridad.minutos_bloqueo', '0', PRINCIPAL, CONTEXT)).rejects.toBeInstanceOf(
      BusinessRuleViolationError,
    );
    expect(repository.updateValue).not.toHaveBeenCalled();
  });
});

describe('ParametersService.listGrouped', () => {
  it('agrupa conservando el orden del repositorio', async () => {
    const { service, repository } = setup(null, []);
    repository.listAll.mockResolvedValue([
      parameter({ key: 'a.uno', group: 'a' }),
      parameter({ key: 'a.dos', group: 'a' }),
      parameter({ key: 'b.uno', group: 'b' }),
    ]);

    const groups = await service.listGrouped();

    expect(groups.map((group) => [group.group, group.parameters.map((item) => item.key)])).toEqual([
      ['a', ['a.uno', 'a.dos']],
      ['b', ['b.uno']],
    ]);
  });
});
