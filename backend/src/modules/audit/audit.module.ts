import { Global, Module } from '@nestjs/common';

import { PrismaAuditRepository } from '@/infrastructure/database/prisma/repositories/prisma-audit.repository';

import { AuditService } from './audit.service';
import { AUDIT_REPOSITORY } from './ports/audit.repository.port';

/**
 * Bitácora de auditoría. Global porque toda área de administración la usa:
 * importarla módulo a módulo solo añadiría ruido.
 */
@Global()
@Module({
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository }],
  exports: [AuditService],
})
export class AuditModule {}
