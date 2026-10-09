import { BusinessRuleViolationError, ResourceConflictError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import type { TeamDetailRecord, TeamLink, TeamsRepository } from './ports/teams.repository.port';
import { wouldCreateTeamCycle } from './team-hierarchy';
import { HAS_CHILDREN, TEAM_CYCLE, TeamsService } from './teams.service';

const CONTEXT: AuditContext = { correlationId: 'corr-1', actorId: 'actor-1', actorEmail: null, ipAddress: null };

function team(overrides: Partial<TeamDetailRecord> = {}): TeamDetailRecord {
  return {
    id: 'team-a',
    code: 'A',
    name: 'Equipo A',
    description: null,
    parentId: null,
    parentName: null,
    manager: null,
    isActive: true,
    memberCount: 0,
    childCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    members: [],
    ...overrides,
  };
}

/** a ← b ← c (c es nieto de a); d es raíz suelta. */
const LINKS: TeamLink[] = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: null },
];

describe('wouldCreateTeamCycle', () => {
  it('permite quitar el padre', () => {
    expect(wouldCreateTeamCycle('b', null, LINKS)).toBe(false);
  });

  it('permite mover a una rama que no desciende del equipo', () => {
    expect(wouldCreateTeamCycle('c', 'd', LINKS)).toBe(false);
    expect(wouldCreateTeamCycle('d', 'c', LINKS)).toBe(false);
  });

  it('detecta un equipo como padre de sí mismo', () => {
    expect(wouldCreateTeamCycle('a', 'a', LINKS)).toBe(true);
  });

  it('detecta colgar un equipo de su hijo o de su nieto', () => {
    expect(wouldCreateTeamCycle('a', 'b', LINKS)).toBe(true);
    expect(wouldCreateTeamCycle('a', 'c', LINKS)).toBe(true);
  });

  it('termina aunque los datos ya tengan un ciclo', () => {
    const corrupted: TeamLink[] = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
    ];
    expect(wouldCreateTeamCycle('z', 'x', corrupted)).toBe(true);
  });
});

describe('TeamsService', () => {
  let repository: jest.Mocked<TeamsRepository>;
  let audit: { record: jest.Mock };
  let service: TeamsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      existsByCode: jest.fn().mockResolvedValue(false),
      listLinks: jest.fn().mockResolvedValue(LINKS),
      findExistingUserIds: jest.fn(async (ids: readonly string[]) => [...ids]),
      create: jest.fn().mockResolvedValue('team-new'),
      update: jest.fn(),
      softDelete: jest.fn(),
      replaceMembers: jest.fn(),
      // La sección crítica se simula ejecutando el trabajo con el mismo repositorio.
      withHierarchyLock: jest.fn((work: (repo: TeamsRepository) => Promise<unknown>) => work(repository)),
    } as jest.Mocked<TeamsRepository>;
    audit = { record: jest.fn() };
    service = new TeamsService(repository, audit as unknown as AuditService);
  });

  describe('create', () => {
    it('rechaza un código existente con 409', async () => {
      repository.existsByCode.mockResolvedValue(true);
      const input = { code: 'A', name: 'A', description: null, parentId: null, managerId: null, isActive: true };

      await expect(service.create(input, CONTEXT)).rejects.toBeInstanceOf(ResourceConflictError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un responsable inexistente', async () => {
      repository.findExistingUserIds.mockResolvedValue([]);
      const input = { code: 'A', name: 'A', description: null, parentId: null, managerId: 'ghost', isActive: true };

      await expect(service.create(input, CONTEXT)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it('crea y audita team.created', async () => {
      repository.findById.mockResolvedValue(team({ id: 'team-new', code: 'NEW' }));
      const input = { code: 'NEW', name: 'Nuevo', description: null, parentId: null, managerId: null, isActive: true };

      await service.create(input, CONTEXT);

      expect(audit.record).toHaveBeenCalledWith(
        'team.created',
        CONTEXT,
        expect.objectContaining({ resourceType: 'team', resourceId: 'team-new', before: null }),
      );
    });
  });

  describe('update', () => {
    it('rechaza colgar un equipo de su descendiente con TEAM_CYCLE', async () => {
      repository.findById.mockImplementation(async (id) => team({ id }));

      const error = await service.update('a', { parentId: 'c' }, CONTEXT).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect((error as BusinessRuleViolationError).code).toBe(TEAM_CYCLE);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rechaza ser padre de sí mismo con TEAM_CYCLE', async () => {
      repository.findById.mockImplementation(async (id) => team({ id }));

      await expect(service.update('a', { parentId: 'a' }, CONTEXT)).rejects.toMatchObject({ code: TEAM_CYCLE });
    });

    it('acepta un padre válido y audita el cambio', async () => {
      repository.findById
        .mockResolvedValueOnce(team({ id: 'c', parentId: 'b' }))
        .mockResolvedValueOnce(team({ id: 'd' }))
        .mockResolvedValueOnce(team({ id: 'c', parentId: 'd' }));

      await service.update('c', { parentId: 'd' }, CONTEXT);

      expect(repository.update).toHaveBeenCalledWith('c', { parentId: 'd' });
      expect(audit.record).toHaveBeenCalledWith(
        'team.updated',
        CONTEXT,
        expect.objectContaining({ before: expect.objectContaining({ parentId: 'b' }), after: expect.objectContaining({ parentId: 'd' }) }),
      );
    });

    it('devuelve 404 si el equipo no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, CONTEXT)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });
  });

  describe('remove', () => {
    it.each([
      ['miembros', { memberCount: 2 }],
      ['subequipos', { childCount: 1 }],
    ])('rechaza eliminar con %s (409 HAS_CHILDREN)', async (_label, counts) => {
      repository.findById.mockResolvedValue(team(counts));

      await expect(service.remove('team-a', CONTEXT)).rejects.toMatchObject({ code: HAS_CHILDREN });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('elimina lógicamente un equipo vacío y audita team.deleted', async () => {
      repository.findById.mockResolvedValue(team());

      await service.remove('team-a', CONTEXT);

      expect(repository.softDelete).toHaveBeenCalledWith('team-a');
      expect(audit.record).toHaveBeenCalledWith('team.deleted', CONTEXT, expect.objectContaining({ after: null }));
    });
  });

  describe('replaceMembers', () => {
    it('pide desmarcar el principal en otros equipos solo para los marcados como principales', async () => {
      repository.findById.mockResolvedValue(team());
      const members = [
        { userId: 'u1', isPrimary: true },
        { userId: 'u2', isPrimary: false },
      ];

      await service.replaceMembers('team-a', members, CONTEXT);

      expect(repository.replaceMembers).toHaveBeenCalledWith('team-a', members, ['u1']);
      expect(audit.record).toHaveBeenCalledWith('team.members_replaced', CONTEXT, expect.anything());
    });

    it('rechaza usuarios repetidos', async () => {
      repository.findById.mockResolvedValue(team());

      await expect(
        service.replaceMembers(
          'team-a',
          [
            { userId: 'u1', isPrimary: true },
            { userId: 'u1', isPrimary: false },
          ],
          CONTEXT,
        ),
      ).rejects.toBeInstanceOf(BusinessRuleViolationError);
    });

    it('rechaza usuarios inexistentes sin tocar los miembros', async () => {
      repository.findById.mockResolvedValue(team());
      repository.findExistingUserIds.mockResolvedValue(['u1']);

      await expect(
        service.replaceMembers(
          'team-a',
          [
            { userId: 'u1', isPrimary: false },
            { userId: 'ghost', isPrimary: false },
          ],
          CONTEXT,
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(repository.replaceMembers).not.toHaveBeenCalled();
    });
  });
});
