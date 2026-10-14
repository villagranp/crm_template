import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaActivityRepository } from '@/infrastructure/database/prisma/repositories/prisma-activity.repository';
import { PrismaAgendaReadModel } from '@/infrastructure/database/prisma/repositories/prisma-agenda-read-model';
import { PrismaCommercialActivityUsageQuery } from '@/infrastructure/database/prisma/repositories/prisma-commercial-activity-usage.query';
import { PrismaCommercialLinkReader } from '@/infrastructure/database/prisma/repositories/prisma-commercial-link.reader';
import { PrismaCommercialUsersReader } from '@/infrastructure/database/prisma/repositories/prisma-commercial-users.reader';
import { PrismaInteractionReadModel } from '@/infrastructure/database/prisma/repositories/prisma-interaction-read-model';
import { PrismaVisitRepository } from '@/infrastructure/database/prisma/repositories/prisma-visit.repository';
import { AccessModule } from '@/modules/access/access.module';
import { AttachmentsModule } from '@/modules/attachments/attachments.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ProjectsModule } from '@/modules/projects/projects.module';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { AgendaService } from './agenda.service';
import { CommercialActorResolver } from './commercial-actor.resolver';
import { CommercialActivityOptionsController } from './commercial-activity-options.controller';
import { CommercialActivityOptionsService } from './commercial-activity-options.service';
import { CommercialAttachmentWriteGuard } from './commercial-attachment-write.guard';
import { ActivityAttachmentsController, VisitAttachmentsController } from './commercial-attachments.controller';
import { InteractionsService } from './interactions.service';
import { LinkedProjectsService } from './linked-projects.service';
import { ACTIVITY_REPOSITORY } from './ports/activity.repository.port';
import { AGENDA_READ_MODEL } from './ports/agenda-read-model.port';
import { COMMERCIAL_ACTIVITY_USAGE_QUERY } from './ports/commercial-activity-usage.port';
import { COMMERCIAL_LINK_READER } from './ports/commercial-link.reader.port';
import { COMMERCIAL_USERS_READER } from './ports/commercial-users.reader.port';
import { INTERACTION_READ_MODEL } from './ports/interaction-read-model.port';
import { VISIT_REPOSITORY } from './ports/visit.repository.port';
import { AgendaController, FollowUpsController, InteractionsController } from './read-models.controller';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/**
 * Módulo 4 · Actividad comercial (04). Dueño de `activities`, `visits`,
 * `visit_events`, `interaction_participants` y de los adjuntos de visitas, eventos
 * de visita y actividades; lee la vista `crm_interactions_v`.
 *
 * Los puertos se enlazan aquí a sus adaptadores Prisma; ningún servicio importa
 * Prisma (ADR-004). `AuditModule`, `ParametersCoreModule` y `PrismaModule`
 * (transacciones y secuencias) son globales. Del Módulo 2 usa
 * `CustomerReferenceGuard` (02 F.6.3) y el servicio transversal de adjuntos
 * (`AttachmentsModule`, 02 F.6.5). Del Módulo 3, el repositorio de proyectos
 * (`ProjectsModule`, `PROJECTS_REPOSITORY`) para bloquear el proyecto vinculado y
 * escribir `last_activity_at` (`LinkedProjectsService`); los vínculos con proyectos y
 * oportunidades los valida `CommercialLinkReader`, propio porque 03 no publica una
 * guardia que distinga referencia desconocida de eliminada (04 «Precisiones»).
 *
 * Exporta `CommercialActivityUsageQuery` (token `COMMERCIAL_ACTIVITY_USAGE_QUERY`,
 * 04 F.6) para quien necesite contar visitas y actividades abiertas; 03 cuenta los
 * bloqueos de eliminación con su propia consulta (03 §F.4), con su propia regla.
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, CustomersModule, ProjectsModule, AttachmentsModule],
  controllers: [
    ActivitiesController,
    VisitsController,
    VisitAttachmentsController,
    ActivityAttachmentsController,
    AgendaController,
    InteractionsController,
    FollowUpsController,
    CommercialActivityOptionsController,
  ],
  providers: [
    ActivitiesService,
    VisitsService,
    AgendaService,
    InteractionsService,
    CommercialActivityOptionsService,
    CommercialActorResolver,
    CommercialAttachmentWriteGuard,
    LinkedProjectsService,
    { provide: ACTIVITY_REPOSITORY, useClass: PrismaActivityRepository },
    { provide: VISIT_REPOSITORY, useClass: PrismaVisitRepository },
    { provide: AGENDA_READ_MODEL, useClass: PrismaAgendaReadModel },
    { provide: INTERACTION_READ_MODEL, useClass: PrismaInteractionReadModel },
    { provide: COMMERCIAL_ACTIVITY_USAGE_QUERY, useClass: PrismaCommercialActivityUsageQuery },
    { provide: COMMERCIAL_LINK_READER, useClass: PrismaCommercialLinkReader },
    { provide: COMMERCIAL_USERS_READER, useClass: PrismaCommercialUsersReader },
  ],
  exports: [CommercialActorResolver, COMMERCIAL_ACTIVITY_USAGE_QUERY],
})
export class CommercialActivityModule {}
