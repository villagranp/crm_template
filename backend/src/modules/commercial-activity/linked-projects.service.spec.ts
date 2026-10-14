import type { ProjectsRepository } from '@/modules/projects/ports/projects.repository.port';

import { LinkedProjectsService } from './linked-projects.service';
import { TX } from './testing/activity-fixtures';

function setup() {
  const projects = { lockProject: jest.fn(async () => true), touchLastActivity: jest.fn(async () => undefined) };
  return { projects, service: new LinkedProjectsService(projects as unknown as ProjectsRepository) };
}

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('LinkedProjectsService (RN-04.2, RN-04.11)', () => {
  it('bloquea con el FOR UPDATE del Módulo 3, una vez por proyecto y en orden de id', async () => {
    const { projects, service } = setup();

    await service.lock([B, A, B.toUpperCase()], TX);

    expect(projects.lockProject.mock.calls).toEqual([
      [A, 'UPDATE', TX],
      [B, 'UPDATE', TX],
    ]);
  });

  it('sin proyectos no bloquea ni escribe', async () => {
    const { projects, service } = setup();

    await service.lock([], TX);
    await service.touch([], new Date(), TX);

    expect(projects.lockProject).not.toHaveBeenCalled();
    expect(projects.touchLastActivity).not.toHaveBeenCalled();
  });

  it('escribe last_activity_at con el repositorio del Módulo 3 (única escritura del CRM)', async () => {
    const { projects, service } = setup();
    const at = new Date('2026-10-13T15:00:00.000Z');

    await service.touch([A, A, B], at, TX);

    expect(projects.touchLastActivity).toHaveBeenCalledWith([A, B], at, TX);
  });
});
