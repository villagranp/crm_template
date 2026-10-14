import { BadRequestException, type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AppRequest } from '@/common/types/request-context';
import { isUuid } from '@/modules/attachments/attachment-policy';
import { discardRequestBody } from '@/modules/attachments/discard-request-body';

import { ActivitiesService } from './activities.service';
import { CommercialActorResolver } from './commercial-actor.resolver';
import { VisitsService } from './visits.service';

/** Dueño del adjunto que se sube (04 F.4, DC-2). */
export type CommercialAttachmentOwnerKind = 'visit' | 'visitEvent' | 'activity';

export const COMMERCIAL_ATTACHMENT_OWNER_KEY = 'commercialAttachmentOwner';

/** Marca el handler de subida con el tipo de dueño que autoriza `CommercialAttachmentWriteGuard`. */
export const CommercialAttachmentOwner = (kind: CommercialAttachmentOwnerKind): MethodDecorator =>
  SetMetadata(COMMERCIAL_ATTACHMENT_OWNER_KEY, kind);

/** Parámetros de ruta: `:id` (visita o actividad) y `:eventId` (evento de la visita). */
export const OWNER_ID_PARAM = 'id';
export const EVENT_ID_PARAM = 'eventId';

/**
 * Autoriza la subida de un adjunto **antes** de leer el cuerpo `multipart` (AGENTS
 * §9.4, 04 F.4): los guards de Nest corren antes que los interceptores; sin esto,
 * multer almacenaría el archivo en memoria antes de saber si el actor puede.
 *
 * - Id que no es UUID → `400` (el mismo que `ParseUUIDPipe`).
 * - Dueño fuera del alcance o inexistente (o evento de otra visita) → `404`.
 * - Visita/actividad no editable por el actor → `403`; terminal → `409 RECORD_READ_ONLY`.
 * - Evento: solo quien lo ejecutó (`403`) y en 15 minutos (`409`, D-04.18).
 *
 * El handler vuelve a comprobarlo tras recibir el archivo (el acceso o el estado
 * pueden cambiar durante la subida).
 */
@Injectable()
export class CommercialAttachmentWriteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly visits: VisitsService,
    private readonly activities: ActivitiesService,
    private readonly actors: CommercialActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const kind = this.reflector.get<CommercialAttachmentOwnerKind | undefined>(COMMERCIAL_ATTACHMENT_OWNER_KEY, context.getHandler());
    try {
      if (!kind) throw new Error('CommercialAttachmentWriteGuard requires @CommercialAttachmentOwner on the handler');
      const ownerId = uuidParam(request, OWNER_ID_PARAM);
      const actor = await this.actors.fromRequest(request);
      if (kind === 'activity') {
        await this.activities.assertCanManageAttachments(actor, ownerId);
      } else if (kind === 'visit') {
        await this.visits.assertCanManageAttachments(actor, ownerId);
      } else {
        await this.visits.assertCanAttachToEvent(actor, ownerId, uuidParam(request, EVENT_ID_PARAM));
      }
    } catch (error) {
      await discardRequestBody(request);
      throw error;
    }
    return true;
  }
}

function uuidParam(request: AppRequest, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string' || !isUuid(value)) throw new BadRequestException('Validation failed (uuid is expected)');
  return value;
}
