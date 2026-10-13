import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaActivityRepository } from '@/infrastructure/database/prisma/repositories/prisma-activity.repository';
import { PrismaCommercialLinkReader } from '@/infrastructure/database/prisma/repositories/prisma-commercial-link.reader';
import { PrismaCommercialUsersReader } from '@/infrastructure/database/prisma/repositories/prisma-commercial-users.reader';
import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { CustomersModule } from '@/modules/customers/customers.module';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { CommercialActorResolver } from './commercial-actor.resolver';
import { CommercialActivityOptionsController } from './commercial-activity-options.controller';
import { CommercialActivityOptionsService } from './commercial-activity-options.service';
import { ACTIVITY_REPOSITORY } from './ports/activity.repository.port';
import { COMMERCIAL_LINK_READER } from './ports/commercial-link.reader.port';
import { COMMERCIAL_USERS_READER } from './ports/commercial-users.reader.port';

/**
 * Módulo 4 · Actividad comercial (04). Dueño de `activities`, `visits`,
 * `visit_events`, `interaction_participants` y de los adjuntos de visitas y
 * actividades.
 *
 * Los puertos se enlazan aquí a sus adaptadores Prisma; ningún servicio importa
 * Prisma (ADR-004). `AuditModule`, `ParametersCoreModule` y `PrismaModule`
 * (transacciones y secuencias) son globales. Del Módulo 2 usa
 * `CustomerReferenceGuard` (02 F.6.3); los vínculos con proyectos y oportunidades
 * los valida `CommercialLinkReader`, propio hasta que el Módulo 3 publique su guardia.
 *
 * Estado: actividades, bandeja, opciones y responsables. Visitas, agenda,
 * interacciones, seguimiento y adjuntos se añaden en la siguiente etapa sobre los
 * mismos puertos y el dominio puro (`visit-lifecycle`, `schedule-conflict`,
 * `agenda-status`, `follow-up`).
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, CustomersModule],
  controllers: [ActivitiesController, CommercialActivityOptionsController],
  providers: [
    ActivitiesService,
    CommercialActivityOptionsService,
    CommercialActorResolver,
    { provide: ACTIVITY_REPOSITORY, useClass: PrismaActivityRepository },
    { provide: COMMERCIAL_LINK_READER, useClass: PrismaCommercialLinkReader },
    { provide: COMMERCIAL_USERS_READER, useClass: PrismaCommercialUsersReader },
  ],
  exports: [CommercialActorResolver],
})
export class CommercialActivityModule {}
