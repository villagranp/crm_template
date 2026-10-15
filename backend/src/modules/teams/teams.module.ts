import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaTeamsRepository } from '@/infrastructure/database/prisma/repositories/prisma-teams.repository';
import { AccessModule } from '@/modules/access/access.module';

import { TEAMS_REPOSITORY } from './ports/teams.repository.port';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { UserTeamsController } from './user-teams.controller';

/**
 * Equipos (PLAN-ADMIN, D8). El puerto `TEAMS_REPOSITORY` se enlaza aquí a su
 * adaptador Prisma; `TeamsService` no conoce Prisma. La bitácora (`AuditService`)
 * llega del módulo global de auditoría. `AccessModule` aporta `AccessService`:
 * resuelve el actor y aplica la regla de administrador (addendum de ADR-020).
 *
 * `UserTeamsController` sirve `PUT /users/{id}/teams` (07 D-07.4): el módulo de
 * equipos es el dueño de las reglas de pertenencia.
 */
@Module({
  imports: [PrismaModule, AccessModule],
  controllers: [TeamsController, UserTeamsController],
  providers: [TeamsService, { provide: TEAMS_REPOSITORY, useClass: PrismaTeamsRepository }],
})
export class TeamsModule {}
