import { BadRequestException, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { isUuid } from '@/modules/attachments/attachment-policy';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import { ProjectsService } from './projects.service';

/** Parámetro de ruta del proyecto en `projects/:id/attachments`. */
export const PROJECT_ID_PARAM = 'id';

/**
 * Autoriza la subida de un adjunto **antes** de leer el cuerpo `multipart` (AGENTS
 * §9.4, mismo patrón que `CustomerAttachmentWriteGuard`): los guards de Nest corren
 * antes que los interceptores, así multer no guarda nada en memoria sin saber si el
 * actor ve y puede editar el proyecto.
 *
 * - `id` que no es UUID → `400` (el mismo que `ParseUUIDPipe`).
 * - Fuera del alcance, inexistente o eliminado → `404`; visible sin poder editarlo → `403`.
 *
 * El handler vuelve a comprobarlo tras recibir el archivo.
 */
@Injectable()
export class ProjectAttachmentWriteGuard implements CanActivate {
  constructor(
    private readonly projects: ProjectsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const projectId = request.params[PROJECT_ID_PARAM];
    try {
      if (typeof projectId !== 'string' || !isUuid(projectId)) {
        throw new BadRequestException('Validation failed (uuid is expected)');
      }
      const actor = await this.actors.fromRequest(request);
      await this.projects.assertCanManageAttachments(actor, projectId);
    } catch (error) {
      await discardBody(request);
      throw error;
    }
    return true;
  }
}

/**
 * Descarta el cuerpo pendiente sin almacenarlo y espera a su final antes de responder
 * el error: si se responde a mitad de subida el cliente ve un corte de conexión en
 * lugar del `404`/`403`.
 */
function discardBody(request: AppRequest): Promise<void> {
  if (request.readableEnded || request.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    request.once('end', resolve);
    request.once('close', resolve);
    request.once('error', () => resolve());
    request.resume();
  });
}
