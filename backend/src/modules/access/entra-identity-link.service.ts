import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '@/config/app-config.service';
import { type AuditContext, AuditService } from '@/modules/audit/audit.service';

import { ACCESS_REPOSITORY, type AccessRepository, type LinkIdentityOutcome } from './ports/access.repository.port';
import { canonicalOid } from '@/common/identity-claims';

/** Evento de auditoría de la vinculación de una identidad de Entra ID a un usuario (ADR-027). */
export const USER_IDENTITY_LINKED_EVENT = 'user.identity_linked';

/**
 * Vinculación explícita de un usuario del CRM con su identidad de Entra ID (`oid`), la única
 * forma de vincular una cuenta que ya existe (ADR-027): nunca por correo.
 *
 * Crea **solo** la fila de `user_identities`: no toca roles, permisos, equipos ni estado. Lo usa la
 * carga por script (`load:data entra-identities`); la validación de la fila (GUID, existencia,
 * conflictos) la hace el cargador antes de llegar aquí, y el índice único de la base cierra la carrera.
 */
@Injectable()
export class EntraIdentityLinkService {
  constructor(
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async link(userId: string, oid: string, context: AuditContext): Promise<LinkIdentityOutcome> {
    const subject = canonicalOid(oid);
    const outcome = await this.repository.linkIdentity({
      userId,
      provider: 'ENTRA_ID',
      subject,
      tenantId: this.config.get('ENTRA_TENANT_ID') ?? null,
    });

    if (outcome.kind === 'linked') {
      await this.audit.record(USER_IDENTITY_LINKED_EVENT, context, {
        resourceType: 'user',
        resourceId: userId,
        before: { identityProvider: null, identitySubject: null },
        after: { identityProvider: 'ENTRA_ID', identitySubject: subject },
        metadata: { source: 'LOAD_SCRIPT' },
      });
    }
    return outcome;
  }
}
