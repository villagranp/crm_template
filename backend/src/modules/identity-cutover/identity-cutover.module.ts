import { Module } from '@nestjs/common';

import { PrismaLocalCredentialRevocationRepository } from '@/infrastructure/database/prisma/repositories/prisma-local-credential-revocation.repository';
import { AccessModule } from '@/modules/access/access.module';

import { LocalCredentialRevocationService } from './local-credential-revocation.service';
import { LOCAL_CREDENTIAL_REVOCATION } from './ports/local-credential-revocation.port';

/**
 * Corte a Entra ID (ADR-027). **Sin controladores**: no expone nada por red; lo usa solo
 * `backend/scripts/revoke-local-credentials.ts` dentro de un contexto standalone de Nest. La
 * auditoría, la configuración y `PrismaModule` son globales.
 */
@Module({
  imports: [AccessModule],
  providers: [LocalCredentialRevocationService, { provide: LOCAL_CREDENTIAL_REVOCATION, useClass: PrismaLocalCredentialRevocationRepository }],
  exports: [LocalCredentialRevocationService],
})
export class IdentityCutoverModule {}
