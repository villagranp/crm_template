import { Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
import { isWithinScope, noVisibility, type VisibilityScope } from '@/modules/access/visibility-scope';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import type { AuditContext } from '@/modules/audit/audit.service';

import { ACTIVITY_PERMISSIONS, type ActivityPolicyActor } from './activity-access-policy';
import type { CommercialAccess, CommercialVisibility } from './ports/commercial-visibility';
import type { UserScopeSet } from './ports/commercial-users.reader.port';

/** Permisos de lectura de otros módulos que intervienen en la visibilidad y las referencias. */
export const PROJECT_VIEW_PERMISSION = 'proyectos.ver';
export const OPPORTUNITY_VIEW_PERMISSION = 'oportunidades.ver';
export const VISIT_VIEW_PERMISSION = 'visitas.ver';
export const VISIT_ADMINISTER_PERMISSION = 'visitas.administrar';

/**
 * Quién opera: usuario local (resuelto en la base, nunca el token), permisos
 * efectivos y contexto de auditoría. Misma forma que `CustomerActor`, así que se
 * pasa tal cual a `CustomerReferenceGuard` (02 F.6.3).
 */
export interface CommercialActor extends ActivityPolicyActor {
  readonly audit: AuditContext;
}

/** Alcances que deciden qué ve y qué puede hacer el actor sobre actividades (04 H.2, H.3). */
export interface ActivityAccessScopes {
  /** `actividades.ver` (directo) + `proyectos.ver` (herencia, DM-13). */
  readonly visibility: CommercialVisibility;
  readonly administer: VisibilityScope;
  readonly delete: VisibilityScope;
  /** `proyectos.ver`: qué proyectos puede vincular (RN-04.1, `422 UNKNOWN_REFERENCE`). */
  readonly projects: VisibilityScope;
  /** `oportunidades.ver`: qué oportunidades puede vincular. */
  readonly opportunities: VisibilityScope;
}

/** Alcances que deciden qué ve y qué puede hacer el actor sobre visitas (04 H.2, H.3). */
export interface VisitAccessScopes {
  /** `visitas.ver` (directo) + `proyectos.ver` (herencia, DM-13). */
  readonly visibility: CommercialVisibility;
  readonly administer: VisibilityScope;
  /** `proyectos.ver`: qué proyectos puede vincular (RN-04.1). */
  readonly projects: VisibilityScope;
}

/** Visibilidad por fuente de los modelos de lectura; `null` = sin el permiso de ver de esa fuente. */
export interface ReadModelScopes {
  readonly visits: CommercialVisibility | null;
  readonly activities: CommercialVisibility | null;
}

/** Dueño y país del cliente de un registro, para evaluar alcances en memoria. */
export interface CommercialScopeRef {
  readonly ownerId: string;
  readonly customerCountryId: string;
}

/** `DIRECT` si cae en el alcance directo del permiso de ver; si no, solo por herencia. */
export function commercialAccessFor(visibility: CommercialVisibility, record: CommercialScopeRef): CommercialAccess {
  return isWithinScope(visibility.direct, { ownerId: record.ownerId, countryId: record.customerCountryId }) ? 'DIRECT' : 'INHERITED';
}

export function inScope(scope: VisibilityScope, record: CommercialScopeRef): boolean {
  return isWithinScope(scope, { ownerId: record.ownerId, countryId: record.customerCountryId });
}

/** Usuarios alcanzados por un alcance (`owner_id`/`users.country_id`), para responsables y opciones. */
export function userScopeFrom(scopes: readonly VisibilityScope[]): UserScopeSet {
  if (scopes.some((scope) => scope.kind === 'ALL')) return { kind: 'ALL' };
  const userIds = new Set<string>();
  const countryIds = new Set<string>();
  for (const scope of scopes) {
    if (scope.kind !== 'FILTERED') continue;
    scope.ownerIds.forEach((id) => userIds.add(id));
    scope.countryIds.forEach((id) => countryIds.add(id));
  }
  return { kind: 'FILTERED', userIds: [...userIds], countryIds: [...countryIds] };
}

/**
 * Resuelve el actor y sus alcances (00 §4.2). Sin caché: un cambio de rol, equipo o
 * país rige en la siguiente petición (ADR-020). Los alcances se leen **antes** de
 * abrir cualquier transacción (AGENTS §9.4).
 */
@Injectable()
export class CommercialActorResolver {
  constructor(
    private readonly access: AccessService,
    private readonly scopes: VisibilityScopeResolver,
  ) {}

  async fromRequest(request: AppRequest): Promise<CommercialActor> {
    const { userId, audit } = await this.access.resolveActor(request);
    const permissions = userId ? await this.access.getEffectivePermissions(userId) : new Set<string>();
    return { userId, permissions, audit };
  }

  /** Todos los alcances de actividades con **una** lectura del perfil de acceso. */
  async activityScopes(actor: CommercialActor): Promise<ActivityAccessScopes> {
    const operational = [ACTIVITY_PERMISSIONS.administer, ACTIVITY_PERMISSIONS.delete].filter((permission) =>
      actor.permissions.has(permission),
    );
    const resolved = await this.scopes.resolveMany(actor.userId, [
      ACTIVITY_PERMISSIONS.view,
      PROJECT_VIEW_PERMISSION,
      OPPORTUNITY_VIEW_PERMISSION,
      ...operational,
    ]);
    const scopeOf = (permission: string): VisibilityScope => resolved.get(permission) ?? noVisibility(actor.userId);
    return {
      visibility: { direct: scopeOf(ACTIVITY_PERMISSIONS.view), inherited: scopeOf(PROJECT_VIEW_PERMISSION) },
      administer: scopeOf(ACTIVITY_PERMISSIONS.administer),
      delete: scopeOf(ACTIVITY_PERMISSIONS.delete),
      projects: scopeOf(PROJECT_VIEW_PERMISSION),
      opportunities: scopeOf(OPPORTUNITY_VIEW_PERMISSION),
    };
  }

  /** Alcances de visitas (04 H.2, H.3) con una lectura del perfil de acceso. */
  async visitScopes(actor: CommercialActor): Promise<VisitAccessScopes> {
    const operational = actor.permissions.has(VISIT_ADMINISTER_PERMISSION) ? [VISIT_ADMINISTER_PERMISSION] : [];
    const resolved = await this.scopes.resolveMany(actor.userId, [VISIT_VIEW_PERMISSION, PROJECT_VIEW_PERMISSION, ...operational]);
    const scopeOf = (permission: string): VisibilityScope => resolved.get(permission) ?? noVisibility(actor.userId);
    return {
      visibility: { direct: scopeOf(VISIT_VIEW_PERMISSION), inherited: scopeOf(PROJECT_VIEW_PERMISSION) },
      administer: scopeOf(VISIT_ADMINISTER_PERMISSION),
      projects: scopeOf(PROJECT_VIEW_PERMISSION),
    };
  }

  /**
   * Visibilidad de cada fuente para los modelos de lectura (agenda, interacciones,
   * seguimiento, 04 F.3): `null` si el actor no tiene el permiso de ver de esa fuente
   * (la agenda sin `visitas.ver` no incluye visitas, AC-04.5).
   */
  async readScopes(actor: CommercialActor): Promise<ReadModelScopes> {
    const canSeeVisits = actor.permissions.has(VISIT_VIEW_PERMISSION);
    const canSeeActivities = actor.permissions.has(ACTIVITY_PERMISSIONS.view);
    if (!canSeeVisits && !canSeeActivities) return { visits: null, activities: null };
    const resolved = await this.scopes.resolveMany(actor.userId, [
      ...(canSeeVisits ? [VISIT_VIEW_PERMISSION] : []),
      ...(canSeeActivities ? [ACTIVITY_PERMISSIONS.view] : []),
      PROJECT_VIEW_PERMISSION,
    ]);
    const scopeOf = (permission: string): VisibilityScope => resolved.get(permission) ?? noVisibility(actor.userId);
    const inherited = scopeOf(PROJECT_VIEW_PERMISSION);
    return {
      visits: canSeeVisits ? { direct: scopeOf(VISIT_VIEW_PERMISSION), inherited } : null,
      activities: canSeeActivities ? { direct: scopeOf(ACTIVITY_PERMISSIONS.view), inherited } : null,
    };
  }

  /** Alcances de una lista de permisos (solo los que el actor tiene; el resto, vacío). */
  async scopesFor(actor: CommercialActor, permissions: readonly string[]): Promise<VisibilityScope[]> {
    const held = permissions.filter((permission) => actor.permissions.has(permission));
    if (held.length === 0) return [];
    const resolved = await this.scopes.resolveMany(actor.userId, held);
    return held.map((permission) => resolved.get(permission) ?? noVisibility(actor.userId));
  }
}
