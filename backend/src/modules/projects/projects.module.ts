import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaProjectProductsRepository } from '@/infrastructure/database/prisma/repositories/prisma-project-products.repository';
import { PrismaProjectsRepository } from '@/infrastructure/database/prisma/repositories/prisma-projects.repository';
import { AccessModule } from '@/modules/access/access.module';
import { AttachmentsModule } from '@/modules/attachments/attachments.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ProductsModule } from '@/modules/products/products.module';
import { UnitConversionsModule } from '@/modules/unit-conversions/unit-conversions.module';

import { PROJECT_PRODUCTS_REPOSITORY } from './ports/project-products.repository.port';
import { PROJECTS_REPOSITORY } from './ports/projects.repository.port';
import { ProjectAccessService } from './project-access.service';
import { ProjectAttachmentWriteGuard } from './project-attachment-write.guard';
import { ProjectAttachmentsController } from './project-attachments.controller';
import { ProjectCatalogsService } from './project-catalogs.service';
import { ProjectClassificationController } from './project-classification.controller';
import { ProjectClassificationService } from './project-classification.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectDuplicationService } from './project-duplication.service';
import { ProjectHistoryService } from './project-history.service';
import { ProjectOptionsController } from './project-options.controller';
import { ProjectOptionsService } from './project-options.service';
import { ProjectPhaseController } from './project-phase.controller';
import { ProjectPhaseService } from './project-phase.service';
import { ProjectProductsController } from './project-products.controller';
import { ProjectProductsService } from './project-products.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Módulo 3 · Proyectos (03). Dueño de `projects`, `project_phase_history`,
 * `project_products` y de los adjuntos con `project_id`. Lee, por el lado del
 * proyecto, oportunidades, forecast, visitas y actividades (estado comercial y bloqueos).
 *
 * Los puertos se enlazan aquí a sus adaptadores Prisma; ningún servicio importa Prisma
 * (ADR-004). `AuditModule`, `ParametersCoreModule` y `PrismaModule` son globales.
 *
 * `ProjectOptionsController` se registra antes que `ProjectsController`: sus rutas
 * estáticas (`/projects/form-options`…) deben resolverse antes que `/projects/:id`.
 *
 * Exporta `ProjectAccessService` (visibilidad y alcances por operación) para
 * Oportunidades y Forecast (E2b), que heredan la visibilidad del proyecto (DM-13), y el
 * puerto `PROJECTS_REPOSITORY` para que sus escrituras bloqueen la fila del proyecto
 * (`lockProject(id, 'UPDATE', tx)`), toquen `last_activity_at` y validen asesores
 * asignables con las mismas consultas (03 "Precisiones" E2a).
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, AttachmentsModule, CustomersModule, ProductsModule, UnitConversionsModule],
  controllers: [
    ProjectOptionsController,
    ProjectsController,
    ProjectPhaseController,
    ProjectClassificationController,
    ProjectProductsController,
    ProjectAttachmentsController,
  ],
  providers: [
    ProjectAccessService,
    ProjectCatalogsService,
    ProjectCreationService,
    ProjectsService,
    ProjectPhaseService,
    ProjectClassificationService,
    ProjectProductsService,
    ProjectDuplicationService,
    ProjectHistoryService,
    ProjectOptionsService,
    ProjectAttachmentWriteGuard,
    { provide: PROJECTS_REPOSITORY, useClass: PrismaProjectsRepository },
    { provide: PROJECT_PRODUCTS_REPOSITORY, useClass: PrismaProjectProductsRepository },
  ],
  exports: [ProjectAccessService, ProjectCatalogsService, PROJECTS_REPOSITORY],
})
export class ProjectsModule {}
