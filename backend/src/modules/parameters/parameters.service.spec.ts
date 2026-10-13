import {
  BusinessRuleViolationError,
  PermissionDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { PermissionResolver } from '@/infrastructure/authentication/ports/permission-resolver.port';
import type { AccessService } from '@/modules/access/access.service';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';
import type { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';
import type { TonnageUnitIssue } from '@/modules/unit-conversions/conversion-precedence';
import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

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

/** Estado de los catálogos para las referencias: `catalogKey → (code → isActive)`. */
const CATALOG_STATES: Record<string, Record<string, boolean>> = {
  'crm.prioridad': { ALTA: true, MEDIA: true, BAJA: false },
  'crm.estado_cliente': { PROSPECTO: true, ACTIVO: true },
  'crm.fase_cliente': { DISENO: true, FINALIZADO: true },
  'crm.etapa_oportunidad': { CONTACTADO: true, COTIZANDO: true, GANADO: true, PERDIDO: true },
};

/** Incidencias RN-07.33 por código de unidad (las demás unidades son válidas). */
const TONNAGE_UNIT_ISSUES: Record<string, TonnageUnitIssue[]> = {
  KG: ['IDENTITY_RULE_MISSING'],
  M2: ['UNIT_NOT_MASS', 'IDENTITY_RULE_MISSING'],
  NOPE: ['UNIT_NOT_FOUND'],
};

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
  const catalogLookup = {
    itemStates: jest.fn(async (catalogKey: string) => {
      const states = CATALOG_STATES[catalogKey];
      return states ? new Map(Object.entries(states)) : null;
    }),
  };
  const unitConversions = {
    tonnageUnitCandidateIssues: jest.fn(async (code: string) => TONNAGE_UNIT_ISSUES[code] ?? []),
  };
  const service = new ParametersService(
    repository,
    resolver,
    accessService as unknown as AccessService,
    auditService as unknown as AuditService,
    catalogLookup as unknown as CatalogLookupService,
    unitConversions as unknown as UnitConversionResolver,
  );
  return { service, repository, auditService, catalogLookup, unitConversions };
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

describe('ParametersService.updateValue con el registro de reglas (D-07.7)', () => {
  const EDITOR = ['parametros.editar'];

  it('crm.moneda_base es de solo lectura: 409 SYSTEM_RESOURCE_READ_ONLY aunque tenga configurar', async () => {
    const { service, repository } = setup(
      parameter({ key: 'crm.moneda_base', type: 'STRING', group: 'crm', value: 'USD' }),
      ['parametros.editar', 'parametros.configurar'],
    );

    const error = await service.updateValue('crm.moneda_base', 'USD', PRINCIPAL, CONTEXT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResourceConflictError);
    expect(error).toMatchObject({ code: 'SYSTEM_RESOURCE_READ_ONLY' });
    expect(repository.updateValue).not.toHaveBeenCalled();
  });

  it('un parámetro estructural sin parametros.configurar es 403', async () => {
    const { service } = setup(
      parameter({ key: 'crm.forecast.unidad_tonelaje', type: 'STRING', group: 'crm', value: 'TON' }),
      EDITOR,
    );

    await expect(service.updateValue('crm.forecast.unidad_tonelaje', 'KG', PRINCIPAL, CONTEXT)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it('RN-07.33: la unidad de tonelaje debe ser activa, de masa y con identidad; si no, 422 con cada motivo', async () => {
    const existing = parameter({ key: 'crm.forecast.unidad_tonelaje', type: 'STRING', group: 'crm', value: 'TON' });
    const { service, repository, unitConversions } = setup(existing, ['parametros.editar', 'parametros.configurar']);

    const error = await service.updateValue('crm.forecast.unidad_tonelaje', 'M2', PRINCIPAL, CONTEXT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BusinessRuleViolationError);
    expect(error).toMatchObject({
      code: 'INVALID_PARAMETER_VALUE',
      details: [
        { field: 'value', issue: 'La unidad no es de dimensión MASS', reason: 'UNIT_NOT_MASS', unitCode: 'M2', key: 'crm.forecast.unidad_tonelaje' },
        {
          field: 'value',
          issue: 'La unidad no tiene una regla identidad GLOBAL activa',
          reason: 'IDENTITY_RULE_MISSING',
          unitCode: 'M2',
          key: 'crm.forecast.unidad_tonelaje',
        },
      ],
    });
    expect(unitConversions.tonnageUnitCandidateIssues).toHaveBeenCalledWith('M2');
    expect(repository.updateValue).not.toHaveBeenCalled();

    await expect(service.updateValue('crm.forecast.unidad_tonelaje', 'NOPE', PRINCIPAL, CONTEXT)).rejects.toMatchObject({
      details: [expect.objectContaining({ reason: 'UNIT_NOT_FOUND' })],
    });
    await expect(service.updateValue('crm.forecast.unidad_tonelaje', 'TON', PRINCIPAL, CONTEXT)).resolves.toMatchObject({ value: 'TON' });
  });

  it('RN-07.33 solo se evalúa para la unidad de tonelaje', async () => {
    const { service, unitConversions } = setup(parameter(), ['parametros.editar', 'parametros.configurar']);
    await service.updateValue('seguridad.minutos_bloqueo', '30', PRINCIPAL, CONTEXT);
    expect(unitConversions.tonnageUnitCandidateIssues).not.toHaveBeenCalled();
  });

  it('nit = BLOQUEAR es 422 con el campo; nit = NO se guarda compactado', async () => {
    const existing = parameter({
      key: 'crm.clientes.reglas_duplicidad',
      type: 'JSON',
      group: 'crm',
      value: '{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}',
    });
    const { service, repository } = setup(existing, EDITOR);

    await expect(
      service.updateValue(
        'crm.clientes.reglas_duplicidad',
        '{"razonSocialNormalizada":"AVISAR","nit":"BLOQUEAR"}',
        PRINCIPAL,
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMETER_VALUE', details: [expect.objectContaining({ field: 'value.nit' })] });

    await service.updateValue(
      'crm.clientes.reglas_duplicidad',
      '{ "razonSocialNormalizada": "AVISAR", "nit": "NO" }',
      PRINCIPAL,
      CONTEXT,
    );
    expect(repository.updateValue).toHaveBeenCalledWith(
      'crm.clientes.reglas_duplicidad',
      '{"razonSocialNormalizada":"AVISAR","nit":"NO"}',
      'user-1',
    );
  });

  it('crm.valores_por_defecto con un código inexistente o inactivo es 422 con el campo', async () => {
    const existing = parameter({ key: 'crm.valores_por_defecto', type: 'JSON', group: 'crm', value: '{}' });
    const { service, repository } = setup(existing, EDITOR);

    await expect(
      service.updateValue('crm.valores_por_defecto', '{"customer.statusId":"NO_EXISTE"}', PRINCIPAL, CONTEXT),
    ).rejects.toMatchObject({
      code: 'INVALID_PARAMETER_VALUE',
      details: [expect.objectContaining({ field: 'value.customer.statusId', code: 'NO_EXISTE' })],
    });
    await expect(
      service.updateValue('crm.valores_por_defecto', '{"activity.priorityId":"BAJA"}', PRINCIPAL, CONTEXT),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ issue: expect.stringContaining('inactivo') })] });
    expect(repository.updateValue).not.toHaveBeenCalled();

    await service.updateValue('crm.valores_por_defecto', '{"customer.statusId":"PROSPECTO"}', PRINCIPAL, CONTEXT);
    expect(repository.updateValue).toHaveBeenCalled();
  });

  it('las transiciones de etapa solo admiten etapas existentes', async () => {
    const existing = parameter({ key: 'crm.oportunidades.transiciones_etapa', type: 'JSON', group: 'crm', value: '{}' });
    const { service } = setup(existing, EDITOR);

    await expect(
      service.updateValue('crm.oportunidades.transiciones_etapa', '{"CONTACTADO":["NEGOCIANDO"]}', PRINCIPAL, CONTEXT),
    ).rejects.toMatchObject({ details: [expect.objectContaining({ field: 'value.CONTACTADO.0' })] });
  });

  it('crm.campos_obligatorios conserva los obligatorios de base', async () => {
    const existing = parameter({ key: 'crm.campos_obligatorios', type: 'JSON', group: 'crm', value: '{}' });
    const { service, repository } = setup(existing, EDITOR);

    await service.updateValue('crm.campos_obligatorios', '{"customer":["taxId"]}', PRINCIPAL, CONTEXT);

    const stored = JSON.parse(String(repository.updateValue.mock.calls[0]?.[1])) as Record<string, string[]>;
    expect(stored['customer']).toEqual(['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId']);
    expect(Object.keys(stored)).toEqual(['customer', 'project', 'visit', 'activity']);
  });

  it('dias_aviso_antiguedad: 0 y 367 son 422, 45 se guarda', async () => {
    const existing = parameter({
      key: 'crm.tipos_cambio.dias_aviso_antiguedad',
      type: 'NUMBER',
      group: 'crm',
      value: '31',
    });
    const { service } = setup(existing, EDITOR);

    for (const value of ['0', '367']) {
      await expect(
        service.updateValue('crm.tipos_cambio.dias_aviso_antiguedad', value, PRINCIPAL, CONTEXT),
      ).rejects.toMatchObject({ code: 'INVALID_PARAMETER_VALUE' });
    }
    await expect(
      service.updateValue('crm.tipos_cambio.dias_aviso_antiguedad', '45', PRINCIPAL, CONTEXT),
    ).resolves.toMatchObject({ value: '45' });
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
