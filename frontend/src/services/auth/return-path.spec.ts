import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearReturnPath,
  consumeReturnPath,
  isSafeReturnPath,
  readReturnPath,
  RETURN_PATH_STORAGE_KEY,
  saveReturnPath,
} from './return-path';

describe('isSafeReturnPath', () => {
  it.each(['/', '/clientes', '/administracion/usuarios', '/proyectos/p-1?tab=resumen', '/reportes/forecast#fin'])(
    'acepta la ruta interna %s',
    (path) => {
      expect(isSafeReturnPath(path)).toBe(true);
    },
  );

  it.each([
    ['URL absoluta', 'https://evil.example/robo'],
    ['URL sin esquema con doble barra', '//evil.example/robo'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['barra invertida que el navegador trata como barra', '/\\evil.example'],
    ['ruta relativa', 'clientes'],
    ['cadena vacía', ''],
    ['salto de línea', '/clientes\n/otra'],
    ['tabulación', '/\t/evil.example'],
    ['carácter de control', '/clientes\u0000'],
    ['no es texto', 42],
    ['nulo', null],
    ['pantalla de acceso', '/acceso'],
    ['callback de Entra', '/auth/callback'],
    ['callback con parámetros', '/auth/callback?code=1'],
    ['cambio de contraseña', '/cambiar-contrasena'],
  ])('rechaza %s', (_label, value) => {
    expect(isSafeReturnPath(value)).toBe(false);
  });
});

describe('ruta de retorno guardada', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('guarda una ruta interna y la entrega una sola vez', () => {
    saveReturnPath('/clientes?pagina=2');

    expect(readReturnPath()).toBe('/clientes?pagina=2');
    expect(consumeReturnPath()).toBe('/clientes?pagina=2');
    expect(consumeReturnPath()).toBeNull();
  });

  it('no guarda una ruta externa y borra la que hubiera', () => {
    saveReturnPath('/clientes');

    saveReturnPath('https://evil.example');

    expect(readReturnPath()).toBeNull();
    expect(sessionStorage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('ignora un valor manipulado en el almacenamiento', () => {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, '//evil.example/robo');

    expect(readReturnPath()).toBeNull();
    expect(consumeReturnPath()).toBeNull();
    expect(sessionStorage.getItem(RETURN_PATH_STORAGE_KEY)).toBeNull();
  });

  it('clearReturnPath olvida la ruta (cierre de sesión voluntario)', () => {
    saveReturnPath('/clientes');

    clearReturnPath();

    expect(readReturnPath()).toBeNull();
  });

  it('si el almacenamiento lanza, no rompe: simplemente no hay ruta de retorno', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => saveReturnPath('/clientes')).not.toThrow();
    expect(readReturnPath()).toBeNull();
    expect(() => clearReturnPath()).not.toThrow();
    expect(consumeReturnPath()).toBeNull();
  });
});
