import { BusinessRuleViolationError } from '@/common/errors/application-error';

import { CRM_PERMISSIONS } from '../../../prisma/seed/crm-access';

import {
  CRM_PERMISSION_RESOURCES,
  CRM_PROFILE_INCOMPLETE,
  assertCrmProfileComplete,
  isCommercialRole,
  missingCrmProfileFields,
  requiresCrmProfile,
} from './crm-profile';

const ASESOR = { code: 'asesor', permissionCodes: ['clientes.ver', 'visitas.crear'] };
const AUDITOR = { code: 'auditor', permissionCodes: ['auditoria.ver', 'usuarios.ver'] };
const USUARIO = { code: 'usuario', permissionCodes: [] };
const ADMIN = { code: 'administrador', permissionCodes: ['usuarios.editar', 'clientes.administrar'] };

describe('crm-profile (D-07.3)', () => {
  it('los recursos coinciden con el catálogo de permisos del CRM sembrado (00 §5.2)', () => {
    expect([...CRM_PERMISSION_RESOURCES].sort()).toEqual(CRM_PERMISSIONS.map((permission) => permission.resource).sort());
  });

  describe('isCommercialRole', () => {
    it('es comercial un rol que concede algún permiso de un recurso del CRM', () => {
      expect(isCommercialRole(ASESOR)).toBe(true);
      expect(isCommercialRole({ code: 'propio', permissionCodes: ['usuarios.ver', 'metas.ver'] })).toBe(true);
    });

    it('no lo es un rol sin permisos del CRM ni el administrador', () => {
      expect(isCommercialRole(AUDITOR)).toBe(false);
      expect(isCommercialRole(USUARIO)).toBe(false);
      expect(isCommercialRole(ADMIN)).toBe(false);
    });

    it('compara el recurso completo, no un prefijo', () => {
      expect(isCommercialRole({ code: 'x', permissionCodes: ['clientesx.ver', 'reportes'] })).toBe(true);
      expect(isCommercialRole({ code: 'x', permissionCodes: ['clientesx.ver'] })).toBe(false);
    });
  });

  it('requiresCrmProfile: basta un rol comercial entre varios', () => {
    expect(requiresCrmProfile([ADMIN, ASESOR])).toBe(true);
    expect(requiresCrmProfile([ADMIN, AUDITOR])).toBe(false);
    expect(requiresCrmProfile([])).toBe(false);
  });

  it('missingCrmProfileFields devuelve los campos vacíos en orden estable', () => {
    expect(missingCrmProfileFields({ employeeCode: null, countryId: null })).toEqual(['employeeCode', 'countryId']);
    expect(missingCrmProfileFields({ employeeCode: 'E-1', countryId: null })).toEqual(['countryId']);
    expect(missingCrmProfileFields({ employeeCode: '', countryId: 'c' })).toEqual(['employeeCode']);
    expect(missingCrmProfileFields({ employeeCode: 'E-1', countryId: 'c' })).toEqual([]);
  });

  describe('assertCrmProfileComplete', () => {
    it('lanza 422 CRM_PROFILE_INCOMPLETE con un detalle por campo que falta', () => {
      const error = captured(() => assertCrmProfileComplete([ASESOR], { employeeCode: null, countryId: 'c' }));

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect(error).toMatchObject({ code: CRM_PROFILE_INCOMPLETE, details: [{ field: 'employeeCode', issue: 'required' }] });
    });

    it('acepta un perfil completo y no exige nada a quien no tiene roles comerciales', () => {
      expect(() => assertCrmProfileComplete([ASESOR], { employeeCode: 'E-1', countryId: 'c' })).not.toThrow();
      expect(() => assertCrmProfileComplete([AUDITOR, ADMIN], { employeeCode: null, countryId: null })).not.toThrow();
    });
  });
});

function captured(act: () => void): unknown {
  try {
    act();
  } catch (error) {
    return error;
  }
  throw new Error('No lanzó');
}
