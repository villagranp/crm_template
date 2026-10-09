import { Module } from '@nestjs/common';

import { PrismaApprovalsRepository } from '@/infrastructure/database/prisma/repositories/prisma-approvals.repository';

import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { APPROVALS_REPOSITORY } from './ports/approvals.repository.port';

/** Aprobaciones (PLAN-ADMIN, D12): bandeja de solo lectura. */
@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, { provide: APPROVALS_REPOSITORY, useClass: PrismaApprovalsRepository }],
})
export class ApprovalsModule {}
