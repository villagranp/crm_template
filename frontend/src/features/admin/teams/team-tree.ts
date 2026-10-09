import type { Team } from './teams.api';

export interface TeamTreeRow {
  team: Team;
  /** 0 = raíz. */
  depth: number;
}

/**
 * Aplana la jerarquía en orden de recorrido (padre antes que hijos, hermanos
 * por nombre) con su profundidad, para pintarla como lista sangrada.
 *
 * Un equipo cuyo padre no está en la lista (p. ej. eliminado) se trata como
 * raíz. Un ciclo en los datos no cuelga el recorrido: cada equipo sale una vez.
 */
export function buildTeamTree(teams: readonly Team[]): TeamTreeRow[] {
  const ids = new Set(teams.map((team) => team.id));
  const childrenOf = new Map<string | null, Team[]>();
  for (const team of teams) {
    const parentKey = team.parentId && ids.has(team.parentId) ? team.parentId : null;
    childrenOf.set(parentKey, [...(childrenOf.get(parentKey) ?? []), team]);
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name, 'es'));
  }

  const rows: TeamTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const team of childrenOf.get(parentId) ?? []) {
      if (visited.has(team.id)) {
        continue;
      }
      visited.add(team.id);
      rows.push({ team, depth });
      visit(team.id, depth + 1);
    }
  };
  visit(null, 0);

  // Equipos atrapados en un ciclo (inalcanzables desde una raíz).
  for (const team of teams) {
    if (!visited.has(team.id)) {
      visited.add(team.id);
      rows.push({ team, depth: 0 });
    }
  }
  return rows;
}

/** Ids del equipo y de todos sus descendientes: no pueden ser su nuevo padre (`TEAM_CYCLE`). */
export function teamWithDescendants(teamId: string, teams: readonly Team[]): Set<string> {
  const result = new Set<string>([teamId]);
  let added = true;
  while (added) {
    added = false;
    for (const team of teams) {
      if (team.parentId && result.has(team.parentId) && !result.has(team.id)) {
        result.add(team.id);
        added = true;
      }
    }
  }
  return result;
}
