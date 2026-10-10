import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaTeamsRepository } from '@/infrastructure/database/prisma/repositories/prisma-teams.repository';

import { TEAMS_REPOSITORY } from './ports/teams.repository.port';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/**
 * Equipos (PLAN-ADMIN, D8). El puerto `TEAMS_REPOSITORY` se enlaza aquí a su
 * adaptador Prisma; `TeamsService` no conoce Prisma. La bitácora (`AuditService`)
 * llega del módulo global de auditoría.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TeamsController],
  providers: [TeamsService, { provide: TEAMS_REPOSITORY, useClass: PrismaTeamsRepository }],
})
export class TeamsModule {}
