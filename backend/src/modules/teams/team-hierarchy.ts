import type { TeamLink } from './ports/teams.repository.port';

/**
 * ¿Colgar `teamId` de `newParentId` crearía un ciclo? (PLAN-ADMIN, D8)
 *
 * Hay ciclo si el nuevo padre es el propio equipo o uno de sus descendientes,
 * es decir, si al subir desde el nuevo padre se llega a `teamId`. El recorrido
 * se protege contra datos ya corruptos (un ciclo previo) con un conjunto de
 * visitados: si se repite un nodo, se considera ciclo.
 */
export function wouldCreateTeamCycle(teamId: string, newParentId: string | null, links: readonly TeamLink[]): boolean {
  if (newParentId === null) {
    return false;
  }

  const parentOf = new Map(links.map((link) => [link.id, link.parentId]));
  const visited = new Set<string>();
  let current: string | null | undefined = newParentId;

  while (current) {
    if (current === teamId || visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = parentOf.get(current);
  }

  return false;
}
