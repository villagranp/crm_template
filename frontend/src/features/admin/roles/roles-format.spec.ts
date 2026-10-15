import { describe, expect, it } from 'vitest';

import { ACTION_LABEL, buildPermissionMatrix, DATA_SCOPE_LABEL, moduleLabel } from './roles-format';
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

describe('PF-07.7: matriz con cerrar y administrar agrupada por módulo del CRM', () => {
  it('ordena los módulos como el menú y las operaciones Ver, Crear, Editar, Cerrar, Eliminar, Exportar, Administrar', () => {
    const matrix = buildPermissionMatrix([
      permission('usuarios.ver'),
      permission('oportunidades.administrar', 'proyectos'),
      permission('oportunidades.exportar', 'proyectos'),
      permission('oportunidades.eliminar', 'proyectos'),
      permission('oportunidades.cerrar', 'proyectos'),
      permission('oportunidades.editar', 'proyectos'),
      permission('oportunidades.crear', 'proyectos'),
      permission('oportunidades.ver', 'proyectos'),
      permission('proyectos.ver', 'proyectos'),
      permission('clientes.ver', 'clientes'),
      permission('visitas.cerrar', 'actividad-comercial'),
    ]);

    expect(matrix.map((module) => module.moduleKey)).toEqual([
      'clientes',
      'proyectos',
      'actividad-comercial',
      'administracion',
    ]);
    const projects = matrix[1];
    expect(projects?.actions).toEqual(['ver', 'crear', 'editar', 'cerrar', 'eliminar', 'exportar', 'administrar']);
    // `proyectos.cerrar` no existe en el catálogo: su celda queda vacía.
    expect(projects?.resources.find((row) => row.resource === 'proyectos')?.byAction['cerrar']).toBeUndefined();
  });

  it('etiqueta acciones, módulos y el ámbito «Su país»', () => {
    expect(ACTION_LABEL['cerrar']).toBe('Cerrar');
    expect(ACTION_LABEL['administrar']).toBe('Administrar');
    expect(moduleLabel('actividad-comercial')).toBe('Actividad comercial');
    expect(moduleLabel('administracion')).toBe('Administración');
    expect(moduleLabel('desconocido')).toBe('desconocido');
    expect(DATA_SCOPE_LABEL.COUNTRY).toBe('Su país');
  });
});
