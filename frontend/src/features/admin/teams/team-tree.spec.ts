import { describe, expect, it } from 'vitest';

import { buildTeamTree, teamWithDescendants } from './team-tree';
import type { Team } from './teams.api';

function team(id: string, parentId: string | null, name = id): Team {
  return {
    id,
    code: id,
    name,
    description: null,
    parentId,
    parentName: null,
    manager: null,
    isActive: true,
    memberCount: 0,
    childCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const TEAMS = [team('c', 'b', 'C'), team('b', 'a', 'B'), team('a', null, 'A'), team('d', null, 'D'), team('e', 'a', 'E')];

describe('buildTeamTree', () => {
  it('ordena padres antes que hijos, con su profundidad', () => {
    expect(buildTeamTree(TEAMS).map((row) => `${row.team.id}:${row.depth}`)).toEqual(['a:0', 'b:1', 'c:2', 'e:1', 'd:0']);
  });

  it('trata como raíz un equipo cuyo padre no está en la lista', () => {
    expect(buildTeamTree([team('x', 'eliminado')])).toEqual([{ team: expect.objectContaining({ id: 'x' }), depth: 0 }]);
  });

  it('no se cuelga con un ciclo en los datos', () => {
    const rows = buildTeamTree([team('x', 'y'), team('y', 'x')]);
    expect(rows.map((row) => row.team.id).sort()).toEqual(['x', 'y']);
  });
});

describe('teamWithDescendants', () => {
  it('incluye al equipo y a toda su descendencia', () => {
    expect([...teamWithDescendants('a', TEAMS)].sort()).toEqual(['a', 'b', 'c', 'e']);
    expect([...teamWithDescendants('d', TEAMS)]).toEqual(['d']);
  });
});
