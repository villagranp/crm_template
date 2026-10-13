import { Inject, Injectable } from '@nestjs/common';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';

import { ACTIVITY_PERMISSIONS } from './activity-access-policy';
import { type CommercialActor, CommercialActorResolver, userScopeFrom, VISIT_VIEW_PERMISSION } from './commercial-actor.resolver';
import type { UserRefRecord } from './ports/activity.repository.port';
import { COMMERCIAL_USERS_READER, type CommercialUsersReader } from './ports/commercial-users.reader.port';

/** Permisos de ver del módulo: abren `owner-options` (uno de ellos, addendum ADR-008). */
export const COMMERCIAL_VIEW_PERMISSIONS = [ACTIVITY_PERMISSIONS.view, VISIT_VIEW_PERMISSION] as const;

/**
 * Opciones compartidas por visitas y actividades (04 F.3, D-04.10).
 */
@Injectable()
export class CommercialActivityOptionsService {
  constructor(
    @Inject(COMMERCIAL_USERS_READER) private readonly users: CommercialUsersReader,
    private readonly actors: CommercialActorResolver,
  ) {}

  /**
   * Responsables y asesores del filtro: usuarios `ACTIVE` con `actividades.ver` o
   * `visitas.ver` efectivo, dentro de la **unión** de los alcances de ver que el
   * actor tiene (OWN: solo él; TEAM: su equipo con subequipos; COUNTRY: su país;
   * ORGANIZATION: todos). Asignar un responsable distinto lo vuelve a validar el
   * caso de uso con el alcance de `administrar` (RN-04.5).
   */
  async ownerOptions(actor: CommercialActor, request: { page: number; pageSize: number; search?: string }): Promise<Page<UserRefRecord>> {
    const scopes = await this.actors.scopesFor(actor, COMMERCIAL_VIEW_PERMISSIONS);
    if (scopes.length === 0) return createPage([], 0, request);
    return this.users.listOwnerOptions({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search?.trim() || null,
      scope: userScopeFrom(scopes),
      anyOfPermissions: COMMERCIAL_VIEW_PERMISSIONS,
    });
  }
}
