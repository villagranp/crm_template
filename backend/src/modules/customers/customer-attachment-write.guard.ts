import { BadRequestException, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { isUuid } from '@/modules/attachments/attachment-policy';

import { CustomerActorResolver } from './customer-actor.resolver';
import { CustomersService } from './customers.service';

/** Parámetro de ruta del cliente en `customers/:customerId/attachments`. */
export const CUSTOMER_ID_PARAM = 'customerId';

/**
 * Autoriza la subida de un adjunto **antes** de leer el cuerpo `multipart`
 * (02 RN-02.29). Los guards de Nest corren antes que los interceptores: sin
 * esto, multer almacenaría el archivo en memoria antes de saber si el actor ve
 * y puede editar el cliente.
 *
 * - `customerId` que no es UUID → `400` (el mismo que `ParseUUIDPipe`).
 * - Cliente fuera del alcance, inexistente o eliminado → `404`; visible sin poder
 *   editarlo → `403` (`CustomersService.assertCanManageAttachments`).
 *
 * El handler vuelve a comprobarlo tras recibir el archivo (la subida puede tardar
 * y el acceso cambiar entretanto).
 */
@Injectable()
export class CustomerAttachmentWriteGuard implements CanActivate {
  constructor(
    private readonly customers: CustomersService,
    private readonly actors: CustomerActorResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const customerId = request.params[CUSTOMER_ID_PARAM];
    try {
      if (typeof customerId !== 'string' || !isUuid(customerId)) {
        throw new BadRequestException('Validation failed (uuid is expected)');
      }
      const actor = await this.actors.fromRequest(request);
      await this.customers.assertCanManageAttachments(actor, customerId);
    } catch (error) {
      await discardBody(request);
      throw error;
    }
    return true;
  }
}

/**
 * Descarta, sin almacenarlo, el cuerpo que el cliente siga enviando y espera a
 * su final antes de responder el error (como hace multer con los suyos): si se
 * responde a mitad de subida, el servidor cierra la conexión y el cliente ve un
 * corte (`ECONNRESET`/`EPIPE`) en lugar del `404`/`403`. La memoria no crece (los
 * trozos se tiran según llegan) y NGINX acota el tamaño del cuerpo.
 */
function discardBody(request: AppRequest): Promise<void> {
  if (request.readableEnded || request.destroyed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    request.once('end', resolve);
    request.once('close', resolve);
    request.once('error', () => resolve());
    request.resume();
  });
}
