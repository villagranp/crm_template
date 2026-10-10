import { describe, expect, it } from 'vitest';

import { validateParameterValue } from './parameters.schemas';

describe('validateParameterValue', () => {
  it('NUMBER entero con rango conocido', () => {
    const parameter = { key: 'seguridad.intentos_fallidos_maximos', type: 'NUMBER' as const, value: '5' };
    expect(validateParameterValue(parameter, '10')).toBeNull();
    expect(validateParameterValue(parameter, '1.5')).toBe('Debe ser un número entero.');
    expect(validateParameterValue(parameter, '21')).toBe('Debe estar entre 1 y 20.');
  });

  it('BOOLEAN, JSON, DATE y STRING', () => {
    expect(validateParameterValue({ key: 'x', type: 'BOOLEAN', value: 'true' }, 'false')).toBeNull();
    expect(validateParameterValue({ key: 'x', type: 'BOOLEAN', value: 'true' }, 'si')).not.toBeNull();
    expect(validateParameterValue({ key: 'x', type: 'JSON', value: '{}' }, '{"a":1}')).toBeNull();
    expect(validateParameterValue({ key: 'x', type: 'JSON', value: '{}' }, '{a:1}')).toBe('Debe ser JSON válido.');
    expect(validateParameterValue({ key: 'x', type: 'DATE', value: '2026-01-01' }, '2026-10-08')).toBeNull();
    expect(validateParameterValue({ key: 'x', type: 'DATE', value: '2026-01-01' }, '08/10/2026')).not.toBeNull();
    expect(validateParameterValue({ key: 'x', type: 'STRING', value: 'a' }, '   ')).not.toBeNull();
  });
});
