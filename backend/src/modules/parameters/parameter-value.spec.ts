import { BusinessRuleViolationError } from '@/common/errors/application-error';

import { INVALID_PARAMETER_VALUE, MAX_STRING_LENGTH, normalizeParameterValue, type ParameterDefinition } from './parameter-value';

function rejection(parameter: ParameterDefinition, raw: string): BusinessRuleViolationError {
  try {
    normalizeParameterValue(parameter, raw);
  } catch (error) {
    if (error instanceof BusinessRuleViolationError) {
      return error;
    }
    throw error;
  }
  throw new Error(`"${raw}" debería ser rechazado`);
}

describe('normalizeParameterValue', () => {
  describe('NUMBER', () => {
    const integer: ParameterDefinition = { key: 'otro.entero', type: 'NUMBER', value: '20' };
    const decimal: ParameterDefinition = { key: 'otro.decimal', type: 'NUMBER', value: '0.5' };

    it('acepta enteros y los normaliza', () => {
      expect(normalizeParameterValue(integer, ' 42 ')).toBe('42');
      expect(normalizeParameterValue(integer, '007')).toBe('7');
    });

    it('exige entero si el valor actual es entero', () => {
      expect(rejection(integer, '1.5').code).toBe(INVALID_PARAMETER_VALUE);
    });

    it('acepta decimales si el valor actual es decimal', () => {
      expect(normalizeParameterValue(decimal, '1.25')).toBe('1.25');
    });

    it('rechaza texto, notación exponencial y vacío', () => {
      for (const raw of ['abc', '1e3', '', 'NaN', 'Infinity']) {
        expect(rejection(decimal, raw).code).toBe(INVALID_PARAMETER_VALUE);
      }
    });
  });

  describe('rangos de las claves conocidas', () => {
    it.each([
      ['seguridad.intentos_fallidos_maximos', '0', '21', ['1', '20']],
      ['seguridad.minutos_bloqueo', '0', '1441', ['1', '1440']],
      ['seguridad.dias_caducidad_password', '-1', '366', ['0', '365']],
      ['auditoria.dias_retencion', '29', '3651', ['30', '3650']],
      ['ui.paginacion_default', '0', '101', ['1', '100']],
    ])('%s: rechaza %s y %s, acepta los límites', (key, below, above, accepted) => {
      const parameter: ParameterDefinition = { key, type: 'NUMBER', value: '5' };
      expect(rejection(parameter, below).details[0]).toMatchObject({ field: 'value', key });
      expect(rejection(parameter, above).code).toBe(INVALID_PARAMETER_VALUE);
      for (const raw of accepted) {
        expect(normalizeParameterValue(parameter, raw)).toBe(raw);
      }
    });
  });

  it('BOOLEAN: sólo true o false', () => {
    const parameter: ParameterDefinition = { key: 'x.flag', type: 'BOOLEAN', value: 'true' };
    expect(normalizeParameterValue(parameter, 'false')).toBe('false');
    for (const raw of ['TRUE', '1', 'si', '']) {
      expect(rejection(parameter, raw).code).toBe(INVALID_PARAMETER_VALUE);
    }
  });

  it('JSON: válido y compactado', () => {
    const parameter: ParameterDefinition = { key: 'x.json', type: 'JSON', value: '{}' };
    expect(normalizeParameterValue(parameter, '{ "a": [1, 2] }')).toBe('{"a":[1,2]}');
    expect(rejection(parameter, '{a:1}').code).toBe(INVALID_PARAMETER_VALUE);
  });

  it('DATE: ISO 8601', () => {
    const parameter: ParameterDefinition = { key: 'x.fecha', type: 'DATE', value: '2026-01-01' };
    expect(normalizeParameterValue(parameter, '2026-10-08')).toBe('2026-10-08');
    expect(normalizeParameterValue(parameter, '2026-10-08T10:00:00Z')).toBe('2026-10-08T10:00:00Z');
    expect(rejection(parameter, '08/10/2026').code).toBe(INVALID_PARAMETER_VALUE);
    expect(rejection(parameter, '2026-13-45').code).toBe(INVALID_PARAMETER_VALUE);
  });

  it('STRING: recorta y exige entre 1 y el máximo', () => {
    const parameter: ParameterDefinition = { key: 'app.nombre', type: 'STRING', value: 'App' };
    expect(normalizeParameterValue(parameter, '  Mi app  ')).toBe('Mi app');
    expect(rejection(parameter, '   ').code).toBe(INVALID_PARAMETER_VALUE);
    expect(rejection(parameter, 'x'.repeat(MAX_STRING_LENGTH + 1)).code).toBe(INVALID_PARAMETER_VALUE);
  });
});
