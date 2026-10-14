import { Inject, Injectable } from '@nestjs/common';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

import { ACTIVITY_PERMISSIONS } from './activity-access-policy';
import { type CommercialActor, CommercialActorResolver, userScopeFrom, VISIT_VIEW_PERMISSION } from './commercial-actor.resolver';
import type { UserRefRecord } from './ports/activity.repository.port';
import { COMMERCIAL_USERS_READER, type CommercialUsersReader } from './ports/commercial-users.reader.port';

/** Permisos de ver del módulo: abren `owner-options` (uno de ellos, addendum ADR-008). */
export const COMMERCIAL_VIEW_PERMISSIONS = [ACTIVITY_PERMISSIONS.view, VISIT_VIEW_PERMISSION] as const;

const BUSINESS_TIME_ZONE_PARAMETER = 'crm.zona_horaria_negocio';
const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Contexto común de los `form-options` de visitas y actividades (04 F.3), aditivo:
 * zonas horarias de presentación (RN-04.9, D-04.17) y límites de adjuntos (D.5,
 * DM-8), para que el navegador formatee y valide antes de subir (como 02 F2).
 */
export interface CommercialFormContext {
  /** Zona del perfil del usuario (`users.time_zone`, DM-2): instantes. */
  readonly timeZone: string;
  /** `crm.zona_horaria_negocio`: fechas sin hora y "hoy". */
  readonly businessTimeZone: string;
  readonly attachments: { readonly enabled: boolean; readonly maxMb: number; readonly allowedTypes: readonly string[] };
}

/**
 * Opciones compartidas por visitas y actividades (04 F.3, D-04.10).
 */
@Injectable()
export class CommercialActivityOptionsService {
  constructor(
    @Inject(COMMERCIAL_USERS_READER) private readonly users: CommercialUsersReader,
    private readonly actors: CommercialActorResolver,
    private readonly parameters: ParameterReader,
    private readonly attachments: AttachmentsService,
  ) {}

  /** Zonas horarias y límites de adjuntos del actor (sin zona propia, la de negocio). */
  async formContext(actor: CommercialActor): Promise<CommercialFormContext> {
    const [businessTimeZone, userTimeZone, limits] = await Promise.all([
      this.parameters.get<string>(BUSINESS_TIME_ZONE_PARAMETER),
      actor.userId ? this.users.findTimeZone(actor.userId) : Promise.resolve(null),
      this.attachments.limits(),
    ]);
    return {
      timeZone: userTimeZone?.trim() || businessTimeZone,
      businessTimeZone,
      attachments: { enabled: true, maxMb: Math.floor(limits.maxBytes / BYTES_PER_MEGABYTE), allowedTypes: [...limits.allowedTypes] },
    };
  }

  /**
   * Responsables y asesores del filtro: usuarios `ACTIVE` con `actividades.ver` o
   * `visitas.ver` efectivo, dentro de la **unión** de los alcances de ver que el
   * actor tiene (OWN: solo él; TEAM: su equipo con subequipos; COUNTRY: su país;
   * ORGANIZATION: todos). Asignar un responsable distinto lo vuelve a validar el
   * caso de uso con el alcance de `administrar` (RN-04.5). `id` (repetible) acota a
   * esos usuarios con el mismo filtro: resuelve el nombre de un asesor elegido en un
   * filtro tras recargar, sin revelar a nadie fuera del alcance.
   */
  async ownerOptions(
    actor: CommercialActor,
    request: { page: number; pageSize: number; search?: string; id?: readonly string[] },
  ): Promise<Page<UserRefRecord>> {
    const scopes = await this.actors.scopesFor(actor, COMMERCIAL_VIEW_PERMISSIONS);
    if (scopes.length === 0) return createPage([], 0, request);
    return this.users.listOwnerOptions({
      page: request.page,
      pageSize: request.pageSize,
      search: request.search?.trim() || null,
      ids: request.id ?? [],
      scope: userScopeFrom(scopes),
      anyOfPermissions: COMMERCIAL_VIEW_PERMISSIONS,
    });
  }
}

/** Contexto → DTO (copias: nunca se exponen las listas internas). */
export function toCommercialFormContextDto(context: CommercialFormContext): {
  timeZone: string;
  businessTimeZone: string;
  attachments: { enabled: boolean; maxMb: number; allowedTypes: string[] };
} {
  return {
    timeZone: context.timeZone,
    businessTimeZone: context.businessTimeZone,
    attachments: { enabled: context.attachments.enabled, maxMb: context.attachments.maxMb, allowedTypes: [...context.attachments.allowedTypes] },
  };
}
