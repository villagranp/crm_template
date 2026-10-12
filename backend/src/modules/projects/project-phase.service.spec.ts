import { ResourceNotFoundError } from '@/common/errors/application-error';
import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import type { AuditService } from '@/modules/audit/audit.service';
import type { CatalogReferenceValidator } from '@/modules/catalogs/catalog-reference.validator';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';

import type { ProjectAccessService } from './project-access.service';
import { toVisibleProject } from './project-access.service';
import { ProjectPhaseService } from './project-phase.service';
import type { ProjectsRepository } from './ports/projects.repository.port';
import { fakeTransactions, makeActor, makeProject, makeScopes, PHASES, TX } from './testing/project-fixtures';

const EDITOR = ['proyectos.ver', 'proyectos.editar'];

function setup(current = makeProject({ phase: { ...PHASES.diseno }, phaseProgress: '10.00' })) {
  const visible = toVisibleProject(current, makeScopes());
  const repository = {
    lockProject: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(current),
    changePhase: jest.fn().mockResolvedValue(undefined),
    listPhaseHistory: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
  };
  const access = { findVisible: jest.fn().mockResolvedValue(visible), findEditable: jest.fn().mockResolvedValue(visible) };
  const catalog = {
    assertItem: jest.fn((_key: string, id: string) => {
      const phase = Object.values(PHASES).find((item) => item.id === id);
      return Promise.resolve({ ...phase, catalogKey: 'crm.fase_cliente' });
    }),
  };
  const parameters = { get: jest.fn().mockResolvedValue({ FINALIZADO: { progresoMinimo: 100 } }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ProjectPhaseService(
    repository as unknown as ProjectsRepository,
    fakeTransactions(),
    access as unknown as ProjectAccessService,
    catalog as unknown as CatalogReferenceValidator,
    parameters as unknown as ParameterReader,
    audit as unknown as AuditService,
    { info: jest.fn() } as unknown as AppLogger,
  );
  return { service, repository, catalog, audit };
}

describe('ProjectPhaseService (F-16)', () => {
  it('compara con la fase leída bajo el bloqueo, escribe con `tx` y audita con el comentario enmascarado', async () => {
    const { service, repository, catalog, audit } = setup();
    await service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.cotizacion.id, progress: '30', comment: '  Inicio  ' });
    expect(repository.lockProject).toHaveBeenCalledWith('project-1', 'UPDATE', TX);
    expect(repository.findById).toHaveBeenCalledWith('project-1', null, TX);
    expect(catalog.assertItem).toHaveBeenCalledWith('crm.fase_cliente', PHASES.cotizacion.id, {
      field: 'phaseId',
      requireActive: true,
      currentId: PHASES.diseno.id,
      tx: TX,
    });
    expect(repository.changePhase).toHaveBeenCalledWith(
      'project-1',
      {
        fromPhaseId: PHASES.diseno.id,
        toPhaseId: PHASES.cotizacion.id,
        fromProgress: '10.00',
        toProgress: '30.00',
        comment: 'Inicio',
        changedById: 'user-1',
        at: expect.any(Date),
      },
      TX,
    );
    expect(audit.record).toHaveBeenCalledWith(
      'crm.project.phase_changed',
      expect.anything(),
      expect.objectContaining({
        before: { phaseId: PHASES.diseno.id, phaseProgress: '10.00', comment: null },
        after: { phaseId: PHASES.cotizacion.id, phaseProgress: '30.00', comment: 'Inicio' },
        maskedFields: ['comment'],
      }),
    );
  });

  it('sin porcentaje al pasar a FINALIZADO usa `defaultProgress` (100) y cumple la regla de avance', async () => {
    const { service, repository } = setup();
    await service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.finalizado.id });
    expect(repository.changePhase.mock.calls[0]?.[1]).toMatchObject({ toProgress: '100.00' });
  });

  it('errores exactos sin escribir: rango, regla de avance, sin cambios', async () => {
    const { service, repository } = setup();
    await expect(service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.cotizacion.id, progress: '100.01' })).rejects.toMatchObject({
      code: 'INVALID_PROGRESS',
    });
    await expect(service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.finalizado.id, progress: '90' })).rejects.toMatchObject({
      code: 'PHASE_PROGRESS_RULE',
      details: [{ field: 'progress', phaseCode: 'FINALIZADO', minimumProgress: '100.00' }],
    });
    await expect(service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.diseno.id, progress: '10' })).rejects.toMatchObject({
      code: 'PHASE_UNCHANGED',
      details: [{ field: 'phaseId' }],
    });
    expect(repository.changePhase).not.toHaveBeenCalled();
  });

  it('proyecto eliminado entre la lectura y el bloqueo → 404', async () => {
    const { service, repository } = setup();
    repository.lockProject.mockResolvedValue(false);
    await expect(service.change(makeActor(EDITOR), 'project-1', { phaseId: PHASES.cotizacion.id })).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
