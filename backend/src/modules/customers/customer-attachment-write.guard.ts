import { BadRequestException, type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import type { AppRequest } from '@/common/types/request-context';
import { isUuid } from '@/modules/attachments/attachment-policy';
import { discardRequestBody } from '@/modules/attachments/discard-request-body';

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
      await discardRequestBody(request);
      throw error;
    }
    return true;
  }
}
