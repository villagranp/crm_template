import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError, ResourceNotFoundError } from '@/common/errors/application-error';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import {
  PERMISSION_RESOLVER,
  type PermissionResolver,
} from '@/infrastructure/authentication/ports/permission-resolver.port';
import { AccessService } from '@/modules/access/access.service';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import { normalizeParameterValue } from './parameter-value';
import { PARAMETERS_REPOSITORY, type ParametersRepository, type SystemParameterRecord } from './ports/parameters.repository.port';

/** Grupo cuyos parámetros gobiernan controles de seguridad (bloqueo, caducidad). */
export const SECURITY_PARAMETER_GROUP = 'seguridad';
/** Permiso adicional que exige editar un parámetro del grupo `seguridad` (D10). */
export const CONFIGURE_PARAMETERS_PERMISSION = 'parametros.configurar';

export interface ParameterGroup {
  group: string;
  parameters: SystemParameterRecord[];
}

/**
 * Parámetros del sistema (PLAN-ADMIN, D10).
 *
 * Sólo se edita el valor. No hay alta ni baja: un parámetro existe porque el
 * código lo lee (p. ej. `AuthRepository.getSecuritySettings` lee las claves
 * `seguridad.*`), así que las claves nunca cambian desde aquí.
 */
@Injectable()
export class ParametersService {
  constructor(
    @Inject(PARAMETERS_REPOSITORY) private readonly repository: ParametersRepository,
    @Inject(PERMISSION_RESOLVER) private readonly permissionResolver: PermissionResolver,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
  ) {}

  async listGrouped(): Promise<ParameterGroup[]> {
    const parameters = await this.repository.listAll();
    const groups = new Map<string, SystemParameterRecord[]>();
    for (const parameter of parameters) {
      const list = groups.get(parameter.group) ?? [];
      list.push(parameter);
      groups.set(parameter.group, list);
    }
    return [...groups.entries()].map(([group, items]) => ({ group, parameters: items }));
  }

  async updateValue(
    key: string,
    rawValue: string,
    principal: AuthenticatedPrincipal,
    context: AuditContext,
  ): Promise<SystemParameterRecord> {
    const parameter = await this.repository.findByKey(key);
    if (!parameter) {
      throw new ResourceNotFoundError('SystemParameter', key);
    }

    // `parametros.editar` ya lo exigió el guard; los de seguridad piden además `configurar`.
    if (parameter.group === SECURITY_PARAMETER_GROUP) {
      const granted = await this.permissionResolver.resolvePermissions(principal);
      if (!granted.has(CONFIGURE_PARAMETERS_PERMISSION)) {
        throw new PermissionDeniedError(CONFIGURE_PARAMETERS_PERMISSION);
      }
    }

    const value = normalizeParameterValue(parameter, rawValue);
    const actorId = await this.accessService.findUserIdForPrincipal(principal);
    const updated = await this.repository.updateValue(key, value, actorId);

    await this.auditService.record('parameter.updated', context, {
      resourceType: 'system_parameter',
      resourceId: key,
      before: { value: parameter.value },
      after: { value: updated.value },
    });

    return updated;
  }
}
