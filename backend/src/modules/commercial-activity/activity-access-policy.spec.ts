import {
  type ActivityPolicyActor,
  type ActivityPolicySubject,
  allowedActivityActions,
  canAssignActivityOwner,
  isActivityActionPermitted,
  missingActivityPermission,
} from './activity-access-policy';

const ASESOR = ['actividades.ver', 'actividades.crear', 'actividades.editar', 'actividades.cerrar'];
const MANAGER = [...ASESOR, 'actividades.eliminar', 'actividades.administrar'];

const actor = (permissions: string[], userId: string | null = 'me'): ActivityPolicyActor => ({ userId, permissions: new Set(permissions) });

function subject(overrides: Partial<ActivityPolicySubject> = {}): ActivityPolicySubject {
  return { ownerId: 'me', access: 'DIRECT', group: 'OPEN', inAdministerScope: false, inDeleteScope: false, ...overrides };
}

describe('activity-access-policy (04 H.2, DM-34)', () => {
  it('asesor sobre su actividad abierta: editar, completar y cancelar (sin eliminar)', () => {
    expect(allowedActivityActions(actor(ASESOR), subject())).toEqual(['EDIT', 'COMPLETE', 'CANCEL']);
  });

  it('el estado recorta las acciones: completada → ninguna; cancelada → solo eliminar (con permiso)', () => {
    expect(allowedActivityActions(actor(MANAGER), subject({ group: 'COMPLETED', inAdministerScope: true, inDeleteScope: true }))).toEqual([]);
    expect(allowedActivityActions(actor(MANAGER), subject({ group: 'CANCELLED', inAdministerScope: true, inDeleteScope: true }))).toEqual(['DELETE']);
  });

  it('ajena: solo con administrar dentro de SU alcance (y el permiso de la operación)', () => {
    const foreign = subject({ ownerId: 'other' });
    expect(allowedActivityActions(actor(ASESOR), foreign)).toEqual([]);
    expect(allowedActivityActions(actor(MANAGER), foreign)).toEqual([]);
    expect(allowedActivityActions(actor(MANAGER), { ...foreign, inAdministerScope: true, inDeleteScope: true })).toEqual([
      'EDIT',
      'COMPLETE',
      'CANCEL',
      'DELETE',
    ]);
    // `administrar` sin `editar` no edita (como 02 F.1).
    expect(isActivityActionPermitted(actor(['actividades.administrar']), { ...foreign, inAdministerScope: true }, 'EDIT')).toBe(false);
  });

  it('visible solo por herencia (DM-13): solo lectura aunque administre', () => {
    const inherited = subject({ ownerId: 'other', access: 'INHERITED', inAdministerScope: true, inDeleteScope: true });
    expect(allowedActivityActions(actor(MANAGER), inherited)).toEqual([]);
  });

  it('eliminar exige actividades.eliminar dentro de su alcance, también sobre la propia', () => {
    expect(isActivityActionPermitted(actor(MANAGER), subject(), 'DELETE')).toBe(false);
    expect(isActivityActionPermitted(actor(MANAGER), subject({ inDeleteScope: true }), 'DELETE')).toBe(true);
  });

  it('permiso que falta en el 403', () => {
    expect(missingActivityPermission(actor(['actividades.ver']), subject(), 'EDIT')).toBe('actividades.editar');
    expect(missingActivityPermission(actor(ASESOR), subject({ ownerId: 'other' }), 'EDIT')).toBe('actividades.administrar');
    expect(missingActivityPermission(actor(['actividades.ver', 'actividades.editar']), subject(), 'COMPLETE')).toBe('actividades.cerrar');
    expect(missingActivityPermission(actor(ASESOR), subject({ ownerId: 'other' }), 'DELETE')).toBe('actividades.eliminar');
  });

  it('sin cuenta local no es dueño de nada', () => {
    expect(allowedActivityActions(actor(ASESOR, null), subject({ ownerId: 'me' }))).toEqual([]);
  });

  it('responsable: el propio siempre; otro solo con administrar (RN-04.5)', () => {
    expect(canAssignActivityOwner(actor(ASESOR), 'me')).toBe(true);
    expect(canAssignActivityOwner(actor(ASESOR), 'other')).toBe(false);
    expect(canAssignActivityOwner(actor(MANAGER), 'other')).toBe(true);
  });
});
