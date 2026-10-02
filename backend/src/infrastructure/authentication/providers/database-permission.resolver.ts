import { Injectable } from '@nestjs/common';

import { AccessService } from '@/modules/access/access.service';

import type { AuthenticatedPrincipal } from '../ports/authenticated-principal';
import type { PermissionResolver } from '../ports/permission-resolver.port';

/**
 * Resolutor de permisos respaldado por la base de datos (ADR-008).
 *
 * Sustituye al mapa estático: los permisos salen de los roles y de las
 * excepciones directas del usuario, no de los claims del token. Un rol que
 * llega en el token no concede nada por sí mismo; se traduce a una cuenta local
 * y a sus asignaciones.
 *
 * Si la identidad autenticada no tiene cuenta local habilitada, devuelve el
 * conjunto vacío: el token es válido pero no autoriza nada.
 */
@Injectable()
export class DatabasePermissionResolver implements PermissionResolver {
  constructor(private readonly accessService: AccessService) {}

  async resolvePermissions(principal: AuthenticatedPrincipal): Promise<ReadonlySet<string>> {
    const userId = await this.accessService.findUserIdForPrincipal(principal);

    if (!userId) {
      return new Set<string>();
    }

    return this.accessService.getEffectivePermissions(userId);
  }
}
