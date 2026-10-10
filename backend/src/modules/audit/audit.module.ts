import { Global, Module } from '@nestjs/common';

import { PrismaAuditRepository } from '@/infrastructure/database/prisma/repositories/prisma-audit.repository';

import { AuditLogsController } from './audit-logs.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';
import { AUDIT_QUERY_REPOSITORY } from './ports/audit-query.repository.port';
import { AUDIT_REPOSITORY } from './ports/audit.repository.port';

/**
 * Bitácora de auditoría. Global porque toda área de administración la usa:
 * importarla módulo a módulo solo añadiría ruido.
 *
 * La escritura (`AuditService`) se exporta; la consulta y la exportación
 * (`AuditQueryService`) sólo las usa el controlador de este módulo.
 */
@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [
    AuditService,
    AuditQueryService,
    PrismaAuditRepository,
    { provide: AUDIT_REPOSITORY, useExisting: PrismaAuditRepository },
    { provide: AUDIT_QUERY_REPOSITORY, useExisting: PrismaAuditRepository },
  ],
  exports: [AuditService],
})
export class AuditModule {}
