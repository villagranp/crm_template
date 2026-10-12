import { Inject, Injectable } from '@nestjs/common';

import {
  BusinessRuleViolationError,
  PermissionDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/common/errors/application-error';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import {
  PERMISSION_RESOLVER,
  type PermissionResolver,
} from '@/infrastructure/authentication/ports/permission-resolver.port';
import { AccessService } from '@/modules/access/access.service';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';
import { CatalogLookupService } from '@/modules/catalogs/catalog-lookup.service';

import { applyRule, type CatalogReference, catalogReferencesOf, type ParameterRule, ruleFor } from './parameter-rules.registry';
import { INVALID_PARAMETER_VALUE, normalizeParameterValue } from './parameter-value';
import { PARAMETERS_REPOSITORY, type ParametersRepository, type SystemParameterRecord } from './ports/parameters.repository.port';

/** Grupo cuyos parámetros gobiernan controles de seguridad (bloqueo, caducidad). */
export const SECURITY_PARAMETER_GROUP = 'seguridad';
/** Permiso adicional que exige editar un parámetro estructural o del grupo `seguridad` (D10, RN-07.32). */
export const CONFIGURE_PARAMETERS_PERMISSION = 'parametros.configurar';
export const SYSTEM_RESOURCE_READ_ONLY = 'SYSTEM_RESOURCE_READ_ONLY';

export interface ParameterGroup {
  group: string;
  parameters: SystemParameterRecord[];
}

/** `true` si editar el parámetro exige además `parametros.configurar`. */
export function requiresConfigure(parameter: Pick<SystemParameterRecord, 'key' | 'group'>): boolean {
  return parameter.group === SECURITY_PARAMETER_GROUP || ruleFor(parameter.key)?.requiresConfigure === true;
}

export function isReadOnly(parameter: Pick<SystemParameterRecord, 'key'>): boolean {
  return ruleFor(parameter.key)?.readOnly === true;
}

function invalidValue(key: string, issues: ReadonlyArray<{ field: string; issue: string }>): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    INVALID_PARAMETER_VALUE,
    'The value is not valid for this parameter',
    issues.map((issue) => ({ ...issue, key })),
  );
}

/**
 * Parámetros del sistema (PLAN-ADMIN, D10; 07 F-46).
 *
 * Sólo se edita el valor. No hay alta ni baja: un parámetro existe porque el
 * código lo lee, así que las claves nunca cambian desde aquí. La validación es
 * en dos capas: por tipo (`parameter-value.ts`) y por clave con el registro de
 * reglas (`parameter-rules.registry.ts`, D-07.7), incluidas las referencias a
 * códigos de catálogo, que deben existir y estar activos (RN-07.30).
 */
@Injectable()
export class ParametersService {
  constructor(
    @Inject(PARAMETERS_REPOSITORY) private readonly repository: ParametersRepository,
    @Inject(PERMISSION_RESOLVER) private readonly permissionResolver: PermissionResolver,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
    private readonly catalogLookup: CatalogLookupService,
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

    // RN-07.46: p. ej. `crm.moneda_base` (cambiarla invalidaría los importes en USD guardados).
    if (isReadOnly(parameter)) {
      throw new ResourceConflictError(
        'This parameter is read-only',
        [{ field: 'value', key, issue: 'read_only' }],
        SYSTEM_RESOURCE_READ_ONLY,
      );
    }

    // `parametros.editar` ya lo exigió el guard; los estructurales y los de seguridad piden además `configurar`.
    if (requiresConfigure(parameter)) {
      const granted = await this.permissionResolver.resolvePermissions(principal);
      if (!granted.has(CONFIGURE_PARAMETERS_PERMISSION)) {
        throw new PermissionDeniedError(CONFIGURE_PARAMETERS_PERMISSION);
      }
    }

    let value = normalizeParameterValue(parameter, rawValue);
    const rule = ruleFor(key);
    if (rule) {
      value = await this.applyRegistryRule(rule, value);
    }

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

  private async applyRegistryRule(rule: ParameterRule, value: string): Promise<string> {
    const result = applyRule(rule, value);
    if (!result.ok) {
      throw invalidValue(rule.key, result.issues);
    }
    await this.assertReferences(rule.key, catalogReferencesOf(rule, result.value));
    return result.stored;
  }

  /** Cada código referenciado existe y está activo en su catálogo (RN-07.30). */
  private async assertReferences(key: string, references: readonly CatalogReference[]): Promise<void> {
    if (references.length === 0) return;

    const states = new Map<string, ReadonlyMap<string, boolean> | null>();
    for (const catalogKey of new Set(references.map((reference) => reference.catalogKey))) {
      states.set(catalogKey, await this.catalogLookup.itemStates(catalogKey));
    }

    const issues = references.flatMap((reference) => {
      const items = states.get(reference.catalogKey);
      const active = items?.get(reference.code);
      if (active === true) return [];
      return [
        {
          field: reference.field,
          issue:
            active === false
              ? `El código ${reference.code} está inactivo en ${reference.catalogKey}`
              : `El código ${reference.code} no existe en ${reference.catalogKey}`,
          catalogKey: reference.catalogKey,
          code: reference.code,
        },
      ];
    });
    if (issues.length > 0) {
      throw invalidValue(key, issues);
    }
  }
}
