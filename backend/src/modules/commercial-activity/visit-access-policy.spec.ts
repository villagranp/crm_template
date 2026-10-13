import { makeActor } from './testing/activity-fixtures';
import { administersVisit, allowedVisitActions, canAssignVisitOwner, visitOperationDenial, type VisitPolicySubject } from './visit-access-policy';

const ASESOR = ['visitas.ver', 'visitas.crear', 'visitas.editar', 'visitas.cerrar'];
const MANAGER = [...ASESOR, 'visitas.administrar'];

function subject(overrides: Partial<VisitPolicySubject> = {}): VisitPolicySubject {
  return { ownerId: 'user-1', access: 'DIRECT', group: 'PENDING', inAdministerScope: false, ...overrides };
}

describe('visit-access-policy (04 H.2, RN-04.18, DM-20)', () => {
  it('el dueño con visitas.editar opera su visita pendiente; con visitas.cerrar confirma la suya realizada', () => {
    const actor = makeActor(ASESOR);
    expect(allowedVisitActions(actor, subject())).toEqual(['EDIT', 'COMPLETE', 'RESCHEDULE', 'CANCEL']);
    expect(allowedVisitActions(actor, subject({ group: 'DONE' }))).toEqual(['CORRECT_COMPLETION', 'CONFIRM']);
    expect(allowedVisitActions(actor, subject({ group: 'CONFIRMED' }))).toEqual([]);
    expect(allowedVisitActions(actor, subject({ group: 'CANCELLED' }))).toEqual([]);
  });

  it('PF-04.64: el manager administra la ajena de su equipo pero no la confirma (OWNER_ONLY)', () => {
    const manager = makeActor(MANAGER, 'manager-1');
    const ofTeam = subject({ ownerId: 'user-1', group: 'DONE', inAdministerScope: true });
    expect(administersVisit(manager, ofTeam)).toBe(true);
    expect(allowedVisitActions(manager, ofTeam)).toEqual(['CORRECT_COMPLETION']);
    expect(visitOperationDenial(manager, ofTeam, 'CONFIRM')).toEqual({ kind: 'OWNER_ONLY' });
  });

  it('PF-04.65: el administrador (comodín, alcance ORGANIZATION) tampoco confirma la de otro', () => {
    const admin = makeActor([...MANAGER, 'actividades.administrar'], 'admin-1');
    expect(visitOperationDenial(admin, subject({ group: 'DONE', inAdministerScope: true }), 'CONFIRM')).toEqual({ kind: 'OWNER_ONLY' });
  });

  it('orden de RN-04.18: sin visitas.cerrar → PERMISSION antes que OWNER_ONLY', () => {
    const noClose = makeActor(['visitas.ver', 'visitas.editar'], 'manager-1');
    expect(visitOperationDenial(noClose, subject({ group: 'DONE' }), 'CONFIRM')).toEqual({ kind: 'PERMISSION', permission: 'visitas.cerrar' });
  });

  it('ajena sin visitas.administrar (o fuera de su alcance) → falta visitas.administrar; heredada → solo lectura', () => {
    const asesor = makeActor(ASESOR, 'user-2');
    expect(visitOperationDenial(asesor, subject(), 'EDIT')).toEqual({ kind: 'PERMISSION', permission: 'visitas.administrar' });
    const outOfScope = makeActor(MANAGER, 'manager-1');
    expect(visitOperationDenial(outOfScope, subject({ inAdministerScope: false }), 'RESCHEDULE')).toEqual({
      kind: 'PERMISSION',
      permission: 'visitas.administrar',
    });
    const owner = makeActor(ASESOR);
    expect(allowedVisitActions(owner, subject({ access: 'INHERITED' }))).toEqual([]);
    expect(visitOperationDenial(makeActor(['visitas.ver']), subject(), 'CANCEL')).toEqual({ kind: 'PERMISSION', permission: 'visitas.editar' });
  });

  it('administrar sin editar no edita (como 02 F.1)', () => {
    const onlyAdminister = makeActor(['visitas.ver', 'visitas.administrar'], 'manager-1');
    expect(allowedVisitActions(onlyAdminister, subject({ inAdministerScope: true }))).toEqual([]);
  });

  it('RN-04.5: asignar otro responsable exige visitas.administrar', () => {
    expect(canAssignVisitOwner(makeActor(ASESOR), 'user-1')).toBe(true);
    expect(canAssignVisitOwner(makeActor(ASESOR), 'user-2')).toBe(false);
    expect(canAssignVisitOwner(makeActor(MANAGER, 'manager-1'), 'user-2')).toBe(true);
  });
});
