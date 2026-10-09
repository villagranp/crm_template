import { describe, expect, it } from 'vitest';

import { buildPermissionMatrix } from './roles-format';
import type { Permission } from './roles.api';

function permission(code: string, moduleKey: string | null = 'administracion'): Permission {
  const [resource = '', action = ''] = code.split('.');
  return { id: code, code, resource, action, name: code, moduleKey };
}

describe('buildPermissionMatrix', () => {
  it('agrupa por módulo y recurso, con las acciones en el orden del catálogo', () => {
    const matrix = buildPermissionMatrix([
      permission('usuarios.exportar'),
      permission('usuarios.ver'),
      permission('roles.crear'),
      permission('roles.ver'),
      permission('reportes.ver', null),
    ]);

    expect(matrix.map((module) => module.moduleKey)).toEqual(['administracion', 'general']);
    expect(matrix[0]?.actions).toEqual(['ver', 'crear', 'exportar']);
    expect(matrix[0]?.resources.map((row) => row.resource)).toEqual(['roles', 'usuarios']);
    expect(matrix[0]?.resources[1]?.byAction['exportar']?.code).toBe('usuarios.exportar');
    expect(matrix[0]?.resources[0]?.byAction['exportar']).toBeUndefined();
  });
});
