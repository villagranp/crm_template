import type { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { ParameterReader } from './parameter-reader';
import type { ParametersRepository, SystemParameterRecord } from './ports/parameters.repository.port';

function record(key: string, value: string, type: SystemParameterRecord['type']): SystemParameterRecord {
  return {
    id: 'p-1',
    key,
    value,
    type,
    group: 'crm',
    name: key,
    description: null,
    isPublic: false,
    isSystem: true,
    updatedAt: new Date(),
    updatedById: null,
  };
}

function setup(stored: SystemParameterRecord | null) {
  const repository: jest.Mocked<ParametersRepository> = {
    listAll: jest.fn(),
    findByKey: jest.fn<Promise<SystemParameterRecord | null>, [string]>(async () => stored),
    updateValue: jest.fn(),
  };
  const logger = { warn: jest.fn() };
  const reader = new ParameterReader(repository, logger as unknown as AppLogger);
  return { reader, repository, logger };
}

describe('ParameterReader', () => {
  it('devuelve el valor tipado y válido', async () => {
    const { reader } = setup(record('crm.alertas.visita_sin_confirmar_horas', '72', 'NUMBER'));

    await expect(reader.get<number>('crm.alertas.visita_sin_confirmar_horas')).resolves.toBe(72);
    await expect(reader.read('crm.alertas.visita_sin_confirmar_horas')).resolves.toEqual({
      value: 72,
      valid: true,
      source: 'stored',
    });
  });

  it('interpreta JSON y aplica la normalización del registro', async () => {
    const { reader } = setup(record('crm.campos_obligatorios', '{"customer":["taxId"]}', 'JSON'));

    const value = await reader.get<Record<string, string[]>>('crm.campos_obligatorios');

    expect(value['customer']).toEqual(['legalName', 'countryId', 'statusId', 'salesOwnerId', 'taxId']);
  });

  it('valor ilegible: usa el defecto documentado y registra un aviso sin el valor (AC-07.33)', async () => {
    const { reader, logger } = setup(record('crm.alertas.visita_sin_confirmar_horas', 'abc', 'NUMBER'));

    await expect(reader.read('crm.alertas.visita_sin_confirmar_horas')).resolves.toEqual({
      value: 48,
      valid: false,
      source: 'default',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'parameter_invalid_value',
      expect.objectContaining({ key: 'crm.alertas.visita_sin_confirmar_horas', reason: 'invalid' }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('abc');
  });

  it('valor fuera de la regla (nit = BLOQUEAR) también cae al defecto', async () => {
    const { reader } = setup(record('crm.clientes.reglas_duplicidad', '{"nit":"BLOQUEAR"}', 'JSON'));

    await expect(reader.get('crm.clientes.reglas_duplicidad')).resolves.toEqual({
      razonSocialNormalizada: 'AVISAR',
      nit: 'AVISAR',
    });
  });

  it('parámetro ausente: defecto y aviso', async () => {
    const { reader, logger } = setup(null);

    await expect(reader.get<boolean>('sistema.permite_datos_demo')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('parameter_invalid_value', expect.objectContaining({ reason: 'missing' }));
  });

  it('sin caché: cada lectura consulta la base (DC-3)', async () => {
    const { reader, repository } = setup(record('crm.forecast.horizonte_meses', '6', 'NUMBER'));

    await reader.get('crm.forecast.horizonte_meses');
    repository.findByKey.mockResolvedValue(record('crm.forecast.horizonte_meses', '9', 'NUMBER'));

    await expect(reader.get('crm.forecast.horizonte_meses')).resolves.toBe(9);
    expect(repository.findByKey).toHaveBeenCalledTimes(2);
  });

  it('una clave sin regla es un error de programación', async () => {
    const { reader } = setup(null);
    await expect(reader.get('no.registrada')).rejects.toThrow('no rule');
  });
});
