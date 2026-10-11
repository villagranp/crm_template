import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';

import { resolvePermissions, widestScope } from './access.service';
import { ACCESS_REPOSITORY, type AccessRepository, type DataScope, type UserAccessSnapshot } from './ports/access.repository.port';
import { VISIBILITY_SCOPE_READER, type VisibilityScopeReader } from './ports/visibility-scope.port';
import { noVisibility, type VisibilityScope } from './visibility-scope';

/**
 * Alcance de datos que concede un permiso: el más amplio entre los roles
 * vigentes que lo conceden. Si el permiso solo llega por una concesión directa
 * (`GRANT`), el alcance es `OWN`: una excepción individual da la acción, no
 * amplía lo que se ve. `null` si el permiso no es efectivo (incluida la
 * denegación directa, que siempre gana).
 */
export function dataScopeForPermission(snapshot: UserAccessSnapshot, permission: string): DataScope | null {
  if (!resolvePermissions(snapshot).has(permission)) {
    return null;
  }
  const granting = snapshot.roles.filter((role) => role.permissionCodes.includes(permission)).map((role) => role.dataScope);
  return widestScope(granting);
}

/**
 * Resuelve el `VisibilityScope` de un usuario para un permiso (00 §4.2, 02 H.1).
 *
 * - `ORGANIZATION` → `ALL`.
 * - `COUNTRY` → `countryIds = [users.country_id]` + sus propios registros. Sin
 *   país, se degrada a `OWN` con advertencia en el log (D-02.8).
 * - `TEAM` → `ownerIds` = el usuario + miembros y responsables de sus equipos y
 *   de todos sus subequipos (DM-12). Sin foto histórica: se resuelve en cada llamada.
 * - `OWN` → `ownerIds = [usuario]`.
 * - Sin el permiso, o sin cuenta local → no ve nada (`NONE`).
 *
 * Los alcances son acumulativos: los más amplios incluyen siempre los registros
 * propios. Sin caché: un cambio de rol, equipo o país rige en la siguiente
 * petición (ADR-020, addendum de 2026-10-10).
 *
 * El permiso ya lo exige `PermissionsGuard`; aquí se vuelve a evaluar porque el
 * alcance depende de **qué roles** lo conceden.
 */
@Injectable()
export class VisibilityScopeResolver {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly accessRepository: AccessRepository,
    @Inject(VISIBILITY_SCOPE_READER) private readonly reader: VisibilityScopeReader,
    private readonly logger: AppLogger,
  ) {}

  async resolve(userId: string | null, permission: string): Promise<VisibilityScope> {
    const scopes = await this.resolveMany(userId, [permission]);
    return scopes.get(permission) ?? noVisibility(userId);
  }

  /**
   * Alcances de varios permisos con **una** lectura del perfil de acceso y, como
   * mucho, una del país y una de los equipos del usuario (02 H.2: las políticas
   * comparan el alcance de cada permiso en memoria con `isWithinScope`).
   */
  async resolveMany(userId: string | null, permissions: readonly string[]): Promise<ReadonlyMap<string, VisibilityScope>> {
    const result = new Map<string, VisibilityScope>();
    if (!userId) {
      for (const permission of permissions) result.set(permission, noVisibility(null));
      return result;
    }
    const snapshot = await this.accessRepository.getUserAccessSnapshot(userId);
    let country: Promise<string | null> | null = null;
    let team: Promise<VisibilityScope> | null = null;

    for (const permission of new Set(permissions)) {
      const dataScope = snapshot ? dataScopeForPermission(snapshot, permission) : null;
      switch (dataScope) {
        case null:
          result.set(permission, noVisibility(userId));
          break;
        case 'ORGANIZATION':
          result.set(permission, { kind: 'ALL', userId, dataScope: 'ORGANIZATION' });
          break;
        case 'COUNTRY':
          country ??= this.reader.findUserCountryId(userId);
          result.set(permission, this.countryScope(userId, permission, await country));
          break;
        case 'TEAM':
          team ??= this.teamScope(userId);
          result.set(permission, await team);
          break;
        case 'OWN':
          result.set(permission, ownScope(userId));
          break;
      }
    }
    return result;
  }

  private countryScope(userId: string, permission: string, countryId: string | null): VisibilityScope {
    if (!countryId) {
      // D-02.8: sin país, el alcance COUNTRY no tiene a qué aplicarse.
      this.logger.warn('visibility_scope_country_missing', { userId, permission, degradedTo: 'OWN' });
      return ownScope(userId);
    }
    return { kind: 'FILTERED', userId, dataScope: 'COUNTRY', ownerIds: [userId], teamIds: [], countryIds: [countryId] };
  }

  private async teamScope(userId: string): Promise<VisibilityScope> {
    const team = await this.reader.findTeamScope(userId);
    const ownerIds = [...new Set([userId, ...team.userIds])];
    return { kind: 'FILTERED', userId, dataScope: 'TEAM', ownerIds, teamIds: [...team.teamIds], countryIds: [] };
  }
}

function ownScope(userId: string): VisibilityScope {
  return { kind: 'FILTERED', userId, dataScope: 'OWN', ownerIds: [userId], teamIds: [], countryIds: [] };
}
