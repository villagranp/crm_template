import {
  BusinessRuleViolationError,
  RequestValidationError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { ActorContext } from '@/modules/access/access-rules';
import { adminOnlyError } from '@/modules/access/admin-only';
import type { AuditContext, AuditService } from '@/modules/audit/audit.service';

import type { TeamDetailRecord, TeamLink, TeamsRepository } from './ports/teams.repository.port';
import { wouldCreateTeamCycle } from './team-hierarchy';
import {
  type AdministratorCheck,
  HAS_CHILDREN,
  TEAM_CYCLE,
  TeamsService,
  changedTeamIds,
} from './teams.service';

const AUDIT: AuditContext = {
  correlationId: 'corr-1',
  actorId: 'actor-1',
  actorEmail: null,
  ipAddress: null,
};
const CONTEXT: ActorContext = { userId: 'actor-1', audit: AUDIT };

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
  let actorState: { isAdministrador: boolean };
  let access: { assertActorIsAdministrador: jest.Mock };
  let service: TeamsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(async (ids: readonly string[]) => ids.map((id) => team({ id }))),
      existsByCode: jest.fn().mockResolvedValue(false),
      listLinks: jest.fn().mockResolvedValue(LINKS),
      findExistingUserIds: jest.fn(async (ids: readonly string[]) => [...ids]),
      create: jest.fn().mockResolvedValue('team-new'),
      update: jest.fn(),
      softDelete: jest.fn(),
      replaceMembers: jest.fn(),
      findExistingTeamIds: jest.fn(async (ids: readonly string[]) => [...ids]),
      listUserMemberships: jest.fn().mockResolvedValue([]),
      replaceUserTeams: jest.fn(),
      // La sección crítica se simula ejecutando el trabajo con el mismo repositorio.
      withHierarchyLock: jest.fn((work: (repo: TeamsRepository) => Promise<unknown>) =>
        work(repository),
      ),
    } as jest.Mocked<TeamsRepository>;
    audit = { record: jest.fn() };
    actorState = { isAdministrador: true };
    access = {
      assertActorIsAdministrador: jest.fn(async () => {
        if (!actorState.isAdministrador) {
          throw adminOnlyError();
        }
      }),
    };
    service = new TeamsService(
      repository,
      audit as unknown as AuditService,
      access as AdministratorCheck,
    );
  });

  describe('create', () => {
    it('rechaza un código existente con 409', async () => {
      repository.existsByCode.mockResolvedValue(true);
      const input = {
        code: 'A',
        name: 'A',
        description: null,
        parentId: null,
        managerId: null,
        isActive: true,
      };

      await expect(service.create(input, CONTEXT)).rejects.toBeInstanceOf(ResourceConflictError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un responsable inexistente', async () => {
      repository.findExistingUserIds.mockResolvedValue([]);
      const input = {
        code: 'A',
        name: 'A',
        description: null,
        parentId: null,
        managerId: 'ghost',
        isActive: true,
      };

      await expect(service.create(input, CONTEXT)).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it('crea y audita team.created', async () => {
      repository.findById.mockResolvedValue(team({ id: 'team-new', code: 'NEW' }));
      const input = {
        code: 'NEW',
        name: 'Nuevo',
        description: null,
        parentId: null,
        managerId: null,
        isActive: true,
      };

      await service.create(input, CONTEXT);

      expect(audit.record).toHaveBeenCalledWith(
        'team.created',
        AUDIT,
        expect.objectContaining({ resourceType: 'team', resourceId: 'team-new', before: null }),
      );
    });
  });

  describe('update', () => {
    it('rechaza colgar un equipo de su descendiente con TEAM_CYCLE', async () => {
      repository.findById.mockImplementation(async (id) => team({ id }));

      const error = await service
        .update('a', { parentId: 'c' }, CONTEXT)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BusinessRuleViolationError);
      expect((error as BusinessRuleViolationError).code).toBe(TEAM_CYCLE);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rechaza ser padre de sí mismo con TEAM_CYCLE', async () => {
      repository.findById.mockImplementation(async (id) => team({ id }));

      await expect(service.update('a', { parentId: 'a' }, CONTEXT)).rejects.toMatchObject({
        code: TEAM_CYCLE,
      });
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
        AUDIT,
        expect.objectContaining({
          before: expect.objectContaining({ parentId: 'b' }),
          after: expect.objectContaining({ parentId: 'd' }),
        }),
      );
    });

    it('devuelve 404 si el equipo no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'X' }, CONTEXT)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
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
      expect(audit.record).toHaveBeenCalledWith(
        'team.deleted',
        AUDIT,
        expect.objectContaining({ after: null }),
      );
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
      expect(audit.record).toHaveBeenCalledWith('team.members_replaced', AUDIT, expect.anything());
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

  describe('ADR-020 · addendum de 2026-10-10 (RN-07.45)', () => {
    beforeEach(() => {
      actorState.isAdministrador = false;
    });

    it('un no administrador crea un equipo sin responsable ni padre', async () => {
      repository.findById.mockResolvedValue(team({ id: 'team-new' }));
      const input = {
        code: 'NEW',
        name: 'Nuevo',
        description: null,
        parentId: null,
        managerId: null,
        isActive: true,
      };

      await service.create(input, CONTEXT);
      expect(repository.create).toHaveBeenCalled();
    });

    it.each([
      ['responsable', { managerId: 'u1', parentId: null }],
      ['padre', { managerId: null, parentId: 'a' }],
    ])('un no administrador no crea un equipo con %s: 403 ADMIN_ONLY', async (_label, refs) => {
      const input = { code: 'NEW', name: 'Nuevo', description: null, isActive: true, ...refs };

      await expect(service.create(input, CONTEXT)).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([
      ['el responsable', { managerId: 'u2' }],
      ['quitar el responsable', { managerId: null }],
      ['el padre', { parentId: 'd' }],
    ])('un no administrador no cambia %s: 403 ADMIN_ONLY', async (_label, input) => {
      repository.findById.mockResolvedValue(
        team({ id: 'c', parentId: 'b', manager: { id: 'u1', displayName: 'U1' } }),
      );

      await expect(service.update('c', input, CONTEXT)).rejects.toMatchObject({
        code: 'ADMIN_ONLY',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('un no administrador edita nombre y descripción, y reenviar el responsable o el padre actuales no es un cambio', async () => {
      repository.findById.mockResolvedValue(
        team({ id: 'c', parentId: 'b', manager: { id: 'u1', displayName: 'U1' } }),
      );
      const input = { name: 'Otro', description: 'Zona', managerId: 'u1', parentId: 'b' };

      await service.update('c', input, CONTEXT);
      expect(repository.update).toHaveBeenCalledWith('c', input);
    });

    it.each([
      ['desactivar un equipo con miembros', { isActive: true, memberCount: 2 }, false],
      ['reactivar un equipo con miembros', { isActive: false, memberCount: 2 }, true],
      ['desactivar un equipo con subequipos', { isActive: true, childCount: 1 }, false],
    ])(
      'un no administrador no puede %s: 403 ADMIN_ONLY y nada cambia',
      async (_label, state, isActive) => {
        repository.findById.mockResolvedValue(team(state));

        await expect(service.update('team-a', { isActive }, CONTEXT)).rejects.toMatchObject({
          code: 'ADMIN_ONLY',
        });
        expect(repository.update).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      },
    );

    it('un no administrador activa o desactiva un equipo vacío', async () => {
      repository.findById.mockResolvedValue(team({ isActive: true }));

      await service.update('team-a', { isActive: false }, CONTEXT);
      expect(repository.update).toHaveBeenCalledWith('team-a', { isActive: false });
      expect(access.assertActorIsAdministrador).not.toHaveBeenCalled();
    });

    it('un no administrador reenvía el estado actual de un equipo con miembros: no es un cambio', async () => {
      repository.findById.mockResolvedValue(
        team({ isActive: true, memberCount: 3, childCount: 1 }),
      );

      await service.update('team-a', { isActive: true, name: 'Otro' }, CONTEXT);
      expect(repository.update).toHaveBeenCalledWith('team-a', { isActive: true, name: 'Otro' });
      expect(access.assertActorIsAdministrador).not.toHaveBeenCalled();
    });

    it('el administrador desactiva un equipo con miembros y queda auditado', async () => {
      actorState.isAdministrador = true;
      repository.findById
        .mockResolvedValueOnce(team({ isActive: true, memberCount: 2 }))
        .mockResolvedValueOnce(team({ isActive: false, memberCount: 2 }));

      await service.update('team-a', { isActive: false }, CONTEXT);
      expect(access.assertActorIsAdministrador).toHaveBeenCalledWith('actor-1');
      expect(audit.record).toHaveBeenCalledWith(
        'team.updated',
        AUDIT,
        expect.objectContaining({
          before: expect.objectContaining({ isActive: true }),
          after: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('un no administrador no reemplaza miembros: 403 ADMIN_ONLY antes de buscar el equipo', async () => {
      await expect(service.replaceMembers('team-a', [], CONTEXT)).rejects.toMatchObject({
        code: 'ADMIN_ONLY',
      });
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.replaceMembers).not.toHaveBeenCalled();
    });

    it.each([
      ['miembros', { memberCount: 1 }],
      ['subequipos', { childCount: 1 }],
    ])(
      'un no administrador no elimina un equipo con %s: 403 ADMIN_ONLY (no 409)',
      async (_label, counts) => {
        repository.findById.mockResolvedValue(team(counts));

        await expect(service.remove('team-a', CONTEXT)).rejects.toMatchObject({
          code: 'ADMIN_ONLY',
        });
        expect(repository.softDelete).not.toHaveBeenCalled();
      },
    );

    it('un no administrador elimina un equipo vacío', async () => {
      repository.findById.mockResolvedValue(team());

      await service.remove('team-a', CONTEXT);
      expect(repository.softDelete).toHaveBeenCalledWith('team-a');
    });
  });

  describe('replaceUserTeams (D-07.4)', () => {
    const membership = (teamId: string, isPrimary = false) => ({
      teamId,
      teamName: `Equipo ${teamId}`,
      isPrimary,
    });

    it('un no administrador: 403 ADMIN_ONLY sin tocar nada', async () => {
      actorState.isAdministrador = false;

      await expect(
        service.replaceUserTeams('u1', [{ teamId: 'a', isPrimary: true }], CONTEXT),
      ).rejects.toMatchObject({
        code: 'ADMIN_ONLY',
      });
      expect(repository.replaceUserTeams).not.toHaveBeenCalled();
    });

    it('dos equipos principales: 409 RESOURCE_CONFLICT', async () => {
      const teams = [
        { teamId: 'a', isPrimary: true },
        { teamId: 'b', isPrimary: true },
      ];

      const error = await service
        .replaceUserTeams('u1', teams, CONTEXT)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ResourceConflictError);
      expect(error).toMatchObject({ code: 'RESOURCE_CONFLICT' });
      expect(repository.replaceUserTeams).not.toHaveBeenCalled();
    });

    it('equipos repetidos: 400', async () => {
      const teams = [
        { teamId: 'a', isPrimary: false },
        { teamId: 'a', isPrimary: false },
      ];
      await expect(service.replaceUserTeams('u1', teams, CONTEXT)).rejects.toBeInstanceOf(
        RequestValidationError,
      );
    });

    it('usuario inexistente: 404', async () => {
      repository.findExistingUserIds.mockResolvedValue([]);
      await expect(service.replaceUserTeams('ghost', [], CONTEXT)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
    });

    it('equipo inexistente o eliminado: 422 UNKNOWN_REFERENCE', async () => {
      repository.findExistingTeamIds.mockResolvedValue(['a']);
      const teams = [
        { teamId: 'a', isPrimary: true },
        { teamId: 'x', isPrimary: false },
      ];

      await expect(service.replaceUserTeams('u1', teams, CONTEXT)).rejects.toMatchObject({
        code: 'UNKNOWN_REFERENCE',
        details: [expect.objectContaining({ identifier: 'x' })],
      });
      expect(repository.replaceUserTeams).not.toHaveBeenCalled();
    });

    it('reemplaza, audita cada equipo afectado y el usuario, y devuelve los equipos resultantes', async () => {
      // Antes: a (principal) y b. Después: b (principal) y c. Cambian a, b y c.
      repository.listUserMemberships
        .mockResolvedValueOnce([membership('a', true), membership('b')])
        .mockResolvedValueOnce([membership('b', true), membership('c')]);
      const teams = [
        { teamId: 'b', isPrimary: true },
        { teamId: 'c', isPrimary: false },
      ];

      const result = await service.replaceUserTeams('u1', teams, CONTEXT);

      expect(repository.replaceUserTeams).toHaveBeenCalledWith('u1', teams);
      expect(result).toEqual([membership('b', true), membership('c')]);
      const teamEvents = audit.record.mock.calls.filter(
        ([event]) => event === 'team.members_replaced',
      );
      expect(
        teamEvents.map(([, , options]) => (options as { resourceId: string }).resourceId).sort(),
      ).toEqual(['a', 'b', 'c']);
      expect(audit.record).toHaveBeenCalledWith(
        'user.teams_replaced',
        AUDIT,
        expect.objectContaining({
          resourceType: 'user',
          resourceId: 'u1',
          before: { teams: ['a:primary', 'b'] },
          after: { teams: ['b:primary', 'c'] },
        }),
      );
    });

    it('lista vacía: deja al usuario sin equipos', async () => {
      repository.listUserMemberships
        .mockResolvedValueOnce([membership('a', true)])
        .mockResolvedValueOnce([]);

      await expect(service.replaceUserTeams('u1', [], CONTEXT)).resolves.toEqual([]);
      expect(repository.replaceUserTeams).toHaveBeenCalledWith('u1', []);
    });

    it('carga los equipos afectados en bloque, antes y después, sin findById por equipo', async () => {
      repository.listUserMemberships
        .mockResolvedValueOnce([membership('a', true)])
        .mockResolvedValueOnce([membership('b', true)]);
      repository.findManyByIds
        .mockResolvedValueOnce([
          team({
            id: 'a',
            members: [{ userId: 'u1', displayName: 'U1', email: 'u1@x', isPrimary: true }],
          }),
          team({ id: 'b' }),
        ])
        .mockResolvedValueOnce([
          team({ id: 'a' }),
          team({
            id: 'b',
            members: [{ userId: 'u1', displayName: 'U1', email: 'u1@x', isPrimary: true }],
          }),
        ]);

      await service.replaceUserTeams('u1', [{ teamId: 'b', isPrimary: true }], CONTEXT);

      expect(repository.findManyByIds).toHaveBeenCalledTimes(2);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        'team.members_replaced',
        AUDIT,
        expect.objectContaining({
          resourceId: 'a',
          before: { members: ['u1:primary'] },
          after: { members: [] },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        'team.members_replaced',
        AUDIT,
        expect.objectContaining({
          resourceId: 'b',
          before: { members: [] },
          after: { members: ['u1:primary'] },
        }),
      );
    });

    it('sin cambios: devuelve los equipos actuales sin escribir ni auditar', async () => {
      repository.listUserMemberships.mockResolvedValueOnce([
        membership('a', true),
        membership('b'),
      ]);

      const result = await service.replaceUserTeams(
        'u1',
        [
          { teamId: 'b', isPrimary: false },
          { teamId: 'a', isPrimary: true },
        ],
        CONTEXT,
      );

      expect(result).toEqual([membership('a', true), membership('b')]);
      expect(repository.replaceUserTeams).not.toHaveBeenCalled();
      expect(repository.findManyByIds).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});

describe('changedTeamIds', () => {
  it('incluye los equipos añadidos, quitados y aquellos donde cambia el principal', () => {
    const before = [
      { teamId: 'a', isPrimary: true },
      { teamId: 'b', isPrimary: false },
      { teamId: 'keep', isPrimary: false },
    ];
    const after = [
      { teamId: 'a', isPrimary: false },
      { teamId: 'keep', isPrimary: false },
      { teamId: 'c', isPrimary: true },
    ];
    expect(changedTeamIds(before, after).sort()).toEqual(['a', 'b', 'c']);
  });

  it('sin cambios no hay equipos afectados', () => {
    expect(
      changedTeamIds([{ teamId: 'a', isPrimary: true }], [{ teamId: 'a', isPrimary: true }]),
    ).toEqual([]);
  });
});
