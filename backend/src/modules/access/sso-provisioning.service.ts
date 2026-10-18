import { Inject, Injectable } from '@nestjs/common';

import { isEmailDomainAllowed, parseDomainList, usableEmail } from '@/common/identity-claims';
import { AppConfigService } from '@/config/app-config.service';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';
import type { AdmissionContext, PrincipalAdmission } from '@/infrastructure/authentication/ports/principal-admission.port';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { SSO_ALLOWED_DOMAINS_PARAMETER, SSO_AUTO_PROVISIONING_PARAMETER } from '@/modules/parameters/authentication-settings';

import {
  ACCESS_REPOSITORY,
  type AccessRepository,
  type ProvisionExternalUserOutcome,
} from './ports/access.repository.port';
import {
  deriveNames,
  identityDomainNotAllowedError,
  identityIncompleteError,
  identityNotLinkedError,
  provisioningDisabledError,
} from './sso-identity.rules';

/** Evento de auditoría del alta al primer ingreso (ADR-027). */
export const USER_PROVISIONED_EVENT = 'user.provisioned';
export const SSO_SOURCE = 'ENTRA_ID';

/**
 * Admisión de identidades de Entra ID (ADR-027).
 *
 * Se invoca una vez por petición, justo después de verificar el token. El camino normal es una
 * sola consulta por el índice único de la identidad (`oid`, con su tenant): si existe, no se hace nada más.
 * Solo si no existe se decide, en este orden:
 *
 *   1. El token no trae un correo utilizable → `403 IDENTITY_INCOMPLETE`.
 *   2. El dominio del correo no está en `seguridad.sso_dominios_permitidos` (exacto, sin distinguir
 *      mayúsculas; lista vacía: nadie) → `403 IDENTITY_DOMAIN_NOT_ALLOWED`. Se comprueba **antes de
 *      crear** y no afecta a quien ya está vinculado.
 *   3. Ya hay un usuario local con ese correo → `403 IDENTITY_NOT_LINKED` (tras releer la identidad,
 *      por si ese usuario lo creó una petición simultánea del mismo ingreso). **Nunca se vincula
 *      por correo**: el correo se puede reasignar en el directorio y vincular sin que un
 *      administrador lo confirme sería ceder la cuenta a quien lo reciba.
 *   4. El interruptor `seguridad.sso_alta_automatica` está apagado → `403 SSO_PROVISIONING_DISABLED`.
 *   5. Se crea el usuario `ACTIVE` **sin roles, permisos, equipos ni país** con su identidad,
 *      de forma idempotente y a prueba de carreras, se registra `sso_user_provisioned` (log
 *      estructurado, sin PII, para alertar ráfagas) y se audita `user.provisioned`.
 *
 * Nota: `findUserByEmail` ignora a los usuarios eliminados, pero su correo sigue ocupado en la base (la
 * unicidad incluye los eliminados): un primer ingreso con el correo de un usuario eliminado llega a la
 * escritura, choca con la unicidad y responde `IDENTITY_NOT_LINKED`, no un alta.
 *
 * Una identidad cuyo usuario existe pero está suspendido, bloqueado o eliminado no se toca:
 * autentica y no recibe permisos (`AccessService.findUserIdForPrincipal`).
 */
@Injectable()
export class SsoProvisioningService implements PrincipalAdmission {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    private readonly parameters: ParameterReader,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {}

  async admit(principal: AuthenticatedPrincipal, context: AdmissionContext): Promise<void> {
    if (principal.issuedBy !== 'entra' || principal.type !== 'user') {
      return;
    }

    const tenantId = principal.tenantId ?? this.config.get('ENTRA_TENANT_ID') ?? undefined;
    if (await this.repository.findIdentityOwner('ENTRA_ID', principal.subjectId, tenantId)) {
      return;
    }

    const email = usableEmail(principal.email);
    if (!email) {
      throw this.deny(context, identityIncompleteError());
    }

    const allowedDomains = parseDomainList(await this.parameters.get<string>(SSO_ALLOWED_DOMAINS_PARAMETER));
    if (!isEmailDomainAllowed(email, allowedDomains)) {
      throw this.deny(context, identityDomainNotAllowedError());
    }

    if (await this.repository.findUserByEmail(email)) {
      // Carrera: ese usuario puede ser el que una petición simultánea de este mismo primer ingreso
      // acaba de crear (con su identidad), entre la consulta de la identidad y la del correo. Solo si
      // la identidad sigue sin existir es una cuenta ajena que nadie ha vinculado.
      if (await this.repository.findIdentityOwner('ENTRA_ID', principal.subjectId, tenantId)) {
        return;
      }
      throw this.deny(context, identityNotLinkedError());
    }

    if (!(await this.parameters.get<boolean>(SSO_AUTO_PROVISIONING_PARAMETER))) {
      throw this.deny(context, provisioningDisabledError());
    }

    const outcome = await this.repository.provisionExternalUser({
      provider: 'ENTRA_ID',
      subject: principal.subjectId,
      tenantId: tenantId ?? null,
      email,
      ...deriveNames(principal.displayName, email),
    });

    await this.afterProvisioning(outcome, email, principal, context);
  }

  private async afterProvisioning(
    outcome: ProvisionExternalUserOutcome,
    email: string,
    principal: AuthenticatedPrincipal,
    context: AdmissionContext,
  ): Promise<void> {
    if (outcome.kind === 'email_taken') {
      // Otro usuario (o uno eliminado) ocupa el correo: es el caso 2, descubierto en la carrera.
      throw this.deny(context, identityNotLinkedError());
    }
    if (outcome.kind === 'linked') {
      // Una petición simultánea del mismo primer ingreso ya creó la cuenta (y la auditó).
      return;
    }

    // Primero el log estructurado (sin PII): permite alertar ráfagas de altas aunque falle la auditoría.
    this.logger.info('sso_user_provisioned', { correlationId: context.correlationId, userId: outcome.userId });

    const names = deriveNames(principal.displayName, email);
    try {
      await this.audit.record(
        USER_PROVISIONED_EVENT,
        // Actor sistema: nadie con sesión local hizo el alta, la hizo el primer ingreso.
        { correlationId: context.correlationId, actorId: null, actorEmail: null, ipAddress: context.ipAddress },
        {
          resourceType: 'user',
          resourceId: outcome.userId,
          before: null,
          after: { email, displayName: names.displayName, status: 'ACTIVE', roles: [] },
          maskedFields: ['email', 'displayName'],
          metadata: { source: SSO_SOURCE, actor: 'system' },
        },
      );
    } catch (error) {
      // El usuario YA existe y el siguiente ingreso lo encontrará: este queda sin su evento. Se deja rastro
      // (con el id, sin PII) para repararlo y se propaga igual que cualquier fallo de auditoría (AuditService).
      this.logger.error('sso_provisioning_audit_failed', {
        correlationId: context.correlationId,
        userId: outcome.userId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  private deny<T extends Error & { code: string }>(context: AdmissionContext, error: T): T {
    this.logger.warn('sso_admission_denied', { correlationId: context.correlationId, code: error.code });
    return error;
  }
}
