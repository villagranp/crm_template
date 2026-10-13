import { PermissionDeniedError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';

import { ProjectAccessService } from './project-access.service';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { makeActor, makeProject, makeScopes, ownerScope, TX } from './testing/project-fixtures';

const EDITOR = ['proyectos.ver', 'proyectos.editar'];
const MANAGER = [...EDITOR, 'proyectos.administrar'];

function setup() {
  const repository = {
    lockProject: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(makeProject()),
    findEligibleOwner: jest.fn().mockResolvedValue(null),
  };
  const resolver = { resolveMany: jest.fn() };
  const service = new ProjectAccessService(repository as unknown as ProjectsRepository, resolver as unknown as VisibilityScopeResolver);
  return { service, repository, resolver };
}

describe('ProjectAccessService (03 "Precisiones", Revisión E5)', () => {
  describe('lockEditable (M4)', () => {
    it('bloquea el proyecto y relee con el alcance de ver dentro de la transacción; no consulta alcances (sin pool)', async () => {
      const { service, repository, resolver } = setup();
      const scopes = makeScopes();
      const visible = await service.lockEditable(makeActor(EDITOR), 'project-1', scopes, TX);
      expect(repository.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
      expect(repository.findById).toHaveBeenCalledWith('project-1', scopes.view, TX);
      expect(repository.lockProject.mock.invocationCallOrder[0]).toBeLessThan(repository.findById.mock.invocationCallOrder[0] ?? 0);
      expect(resolver.resolveMany).not.toHaveBeenCalled();
      expect(visible.record.id).toBe('project-1');
    });

    it('eliminado antes del bloqueo o ya fuera del alcance → el mismo 404', async () => {
      const { service, repository } = setup();
      repository.lockProject.mockResolvedValueOnce(false);
      await expect(service.lockEditable(makeActor(EDITOR), 'project-1', makeScopes(), TX)).rejects.toBeInstanceOf(ResourceNotFoundError);
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.lockEditable(makeActor(EDITOR), 'project-1', makeScopes(), TX)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it('asesor reasignado entre la lectura y el bloqueo: el antiguo dueño sin administrar recibe 403; con administrar en su alcance, sigue', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(makeProject({ owner: { id: 'user-2', displayName: 'Otro' } }));
      const error = await service.lockEditable(makeActor(EDITOR), 'project-1', makeScopes({ view: ownerScope(['user-1', 'user-2']) }), TX).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED' });
      const team = ownerScope(['user-1', 'user-2']);
      await expect(service.lockEditable(makeActor(MANAGER), 'project-1', makeScopes({ view: team, administer: team }), TX)).resolves.toMatchObject({
        subject: { ownerId: 'user-2', inAdministerScope: true },
      });
    });
  });

  describe('isAssignableOwner (nit del duplicado)', () => {
    it('el propio actor siempre (sin distinguir mayúsculas); otro, solo si el repositorio lo da por elegible en su conjunto asignable', async () => {
      const { service, repository } = setup();
      await expect(service.isAssignableOwner(makeActor(MANAGER), 'USER-1', makeScopes())).resolves.toBe(true);
      expect(repository.findEligibleOwner).not.toHaveBeenCalled();
      await expect(service.isAssignableOwner(makeActor(MANAGER), 'user-9', makeScopes({ administer: ownerScope(['user-1']) }))).resolves.toBe(false);
      expect(repository.findEligibleOwner).toHaveBeenCalledWith('user-9', { kind: 'FILTERED', userIds: ['user-1'], countryIds: [] }, 'proyectos.ver');
      repository.findEligibleOwner.mockResolvedValueOnce('user-9');
      await expect(service.isAssignableOwner(makeActor(MANAGER), 'user-9', makeScopes())).resolves.toBe(true);
    });
  });
});
