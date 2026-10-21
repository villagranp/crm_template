import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { AccessDeniedError } from '@/common/errors/application-error';
import type { AppRequest } from '@/common/types/request-context';

/** Cabecera y valor exactos que deben enviar las llamadas propias de la SPA (ASVS G-20). */
export const REQUESTED_WITH_HEADER = 'X-Requested-With';
export const REQUESTED_WITH_VALUE = 'XMLHttpRequest';

export const CSRF_HEADER_REQUIRED = 'CSRF_HEADER_REQUIRED';

/**
 * Defensa anti-CSRF de los endpoints que se autentican solo con la cookie de
 * refresco (`/auth/refresh`, `/auth/logout`). Una cabecera propia no es una
 * cabecera segura de CORS: un formulario o un `fetch` simple desde otro sitio no
 * puede añadirla sin una comprobación previa que la API no concede. Complementa
 * a SameSite=Lax, que no cubre peticiones desde el mismo sitio registrable.
 *
 * El nombre se compara sin distinguir mayúsculas (Node normaliza las cabeceras a
 * minúsculas); el valor, de forma exacta. Corre antes del handler: si falla no
 * hay rotación, revocación ni borrado de cookie.
 */
@Injectable()
export class RequestedWithHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (request.headers[REQUESTED_WITH_HEADER.toLowerCase()] !== REQUESTED_WITH_VALUE) {
      throw new AccessDeniedError(
        CSRF_HEADER_REQUIRED,
        `Esta operación exige la cabecera ${REQUESTED_WITH_HEADER}: ${REQUESTED_WITH_VALUE}`,
      );
    }
    return true;
  }
}
