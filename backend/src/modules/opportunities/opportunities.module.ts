import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaOpportunitiesRepository } from '@/infrastructure/database/prisma/repositories/prisma-opportunities.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ExchangeRatesModule } from '@/modules/exchange-rates/exchange-rates.module';
import { ProjectsModule } from '@/modules/projects/projects.module';

import { OpportunitiesController, ProjectOpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityAccessService } from './opportunity-access.service';
import { OpportunityStageService } from './opportunity-stage.service';
import { OPPORTUNITIES_REPOSITORY } from './ports/opportunities.repository.port';

/**
 * Módulo 3 · Oportunidades y resultados (03 F-17, F-18). Dueño de `opportunities`,
 * `opportunity_stage_history`, `opportunity_results` y `opportunity_result_history`.
 * Hereda la visibilidad del proyecto (DM-13) y bloquea su fila antes de escribir
 * (`PROJECTS_REPOSITORY.lockProject`, 03 "Precisiones" E2a). La estimación usa
 * `CurrencyConversionService` (ADR-024). `AuditModule`, `ParametersCoreModule` y
 * `PrismaModule` son globales.
 *
 * Exporta `OpportunityAccessService` para los módulos que vinculen registros a una
 * oportunidad (Módulo 4).
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, CustomersModule, ExchangeRatesModule, ProjectsModule],
  controllers: [OpportunitiesController, ProjectOpportunitiesController],
  providers: [
    OpportunityAccessService,
    OpportunitiesService,
    OpportunityStageService,
    { provide: OPPORTUNITIES_REPOSITORY, useClass: PrismaOpportunitiesRepository },
  ],
  // La carga inicial de proyectos crea y cierra oportunidades con estos servicios (ADR-031).
  exports: [OpportunityAccessService, OpportunitiesService, OpportunityStageService],
})
export class OpportunitiesModule {}
