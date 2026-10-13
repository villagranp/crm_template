import {
  canAssignOwner,
  canDeleteProject,
  canEditProject,
  missingEditPermission,
  projectCapabilities,
  projectPolicySubject,
} from './project-access-policy';
import { ALL_SCOPE, makeActor, makeScopes, ownerScope } from './testing/project-fixtures';

const ADVISOR = ['proyectos.ver', 'proyectos.crear', 'proyectos.editar', 'oportunidades.crear', 'forecast.editar'];
const MANAGER = [...ADVISOR, 'proyectos.eliminar', 'proyectos.administrar', 'oportunidades.administrar', 'forecast.administrar'];
const TEAM = ownerScope(['user-1', 'user-2']);
const MANAGER_SCOPES = makeScopes({
  view: TEAM,
  administer: TEAM,
  delete: TEAM,
  opportunityAdminister: TEAM,
  forecastAdminister: TEAM,
});

function subject(ownerId: string, scopes = MANAGER_SCOPES, countryId = 'country-gt') {
  return projectPolicySubject({ ownerId, countryId }, scopes);
}

describe('project-access-policy (03 H.1, DM-34, RN-03.19)', () => {
  it('asesor sobre lo propio: edita, duplica, crea oportunidades y forecast; no administra ni elimina', () => {
    expect(projectCapabilities(makeActor(ADVISOR), subject('user-1', makeScopes()))).toEqual({
      canEdit: true,
      canAdminister: false,
      canDelete: false,
      canDuplicate: true,
      canCreateOpportunity: true,
      canEditForecast: true,
    });
  });

  it('manager sobre un miembro de su equipo: todo', () => {
    expect(projectCapabilities(makeActor(MANAGER), subject('user-2'))).toEqual({
      canEdit: true,
      canAdminister: true,
      canDelete: true,
      canDuplicate: true,
      canCreateOpportunity: true,
      canEditForecast: true,
    });
  });

  it('cada operación usa el alcance de su permiso: ver con alcance amplio no concede administrar fuera del equipo', () => {
    const scopes = makeScopes({ view: ALL_SCOPE, administer: TEAM, delete: TEAM, opportunityAdminister: TEAM, forecastAdminister: TEAM });
    const foreign = subject('user-9', scopes);
    expect(projectCapabilities(makeActor(MANAGER), foreign)).toEqual({
      canEdit: false,
      canAdminister: false,
      canDelete: false,
      canDuplicate: true,
      canCreateOpportunity: false,
      canEditForecast: false,
    });
    expect(missingEditPermission(makeActor(MANAGER), foreign)).toBe('proyectos.administrar');
  });

  it('el alcance COUNTRY se evalúa por el país del proyecto', () => {
    const country = ownerScope(['user-1'], ['country-gt']);
    const scopes = makeScopes({ view: country, administer: country, delete: country });
    expect(canEditProject(makeActor(MANAGER), subject('user-7', scopes, 'country-gt'))).toBe(true);
    expect(canEditProject(makeActor(MANAGER), subject('user-7', scopes, 'country-sv'))).toBe(false);
  });

  it('administrar sin editar no edita; eliminar exige su permiso, su alcance y propiedad o administrar', () => {
    expect(canEditProject(makeActor(['proyectos.administrar']), subject('user-2'))).toBe(false);
    expect(missingEditPermission(makeActor(['proyectos.ver']), subject('user-2'))).toBe('proyectos.editar');
    expect(missingEditPermission(makeActor(ADVISOR), subject('user-1'))).toBe('proyectos.editar');

    const deleteOwn = makeActor(['proyectos.eliminar']);
    expect(canDeleteProject(deleteOwn, subject('user-1'))).toBe(true);
    expect(canDeleteProject(deleteOwn, subject('user-2'))).toBe(false);
    expect(canDeleteProject(makeActor(['proyectos.eliminar', 'proyectos.administrar']), subject('user-2'))).toBe(true);
    expect(canDeleteProject(makeActor(MANAGER), subject('user-2', makeScopes({ view: TEAM, administer: TEAM })))).toBe(false);
  });

  it('sin usuario local no es dueño de nada', () => {
    const anonymous = makeActor(ADVISOR, null);
    expect(canEditProject(anonymous, subject('user-1', makeScopes()))).toBe(false);
    expect(canAssignOwner(anonymous, 'user-1')).toBe(false);
  });

  it('canAssignOwner (RN-03.6): sin administrar, solo a sí mismo', () => {
    expect(canAssignOwner(makeActor(ADVISOR), 'user-1')).toBe(true);
    expect(canAssignOwner(makeActor(ADVISOR), 'user-2')).toBe(false);
    expect(canAssignOwner(makeActor(MANAGER), 'user-2')).toBe(true);
  });
});
