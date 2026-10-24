import { Module } from '@nestjs/common';

import { PrismaInitialDataLookupRepository } from '@/infrastructure/database/prisma/repositories/prisma-initial-data-lookup.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { OpportunitiesModule } from '@/modules/opportunities/opportunities.module';
import { ProductsModule } from '@/modules/products/products.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { SafetyMinutesModule } from '@/modules/safety-minutes/safety-minutes.module';

import { InitialDataLoader } from './initial-data-loader.service';
import { INITIAL_DATA_LOOKUP } from './ports/initial-data-lookup.port';

/**
 * Carga inicial de datos por scripts (`docs/implementation-plans/CARGA-INICIAL.md`). **Sin
 * controladores**: no expone nada por red; lo usa solo `backend/scripts/load-initial-data.ts`
 * dentro de un contexto standalone de Nest. Crea proyectos (con su clasificación, fase y
 * oportunidad, ADR-031), familias, productos y minutos de seguridad con los servicios de aplicación
 * de sus módulos (que ahora los exportan), nunca con Prisma directo. La auditoría y `PrismaModule` son globales.
 */
@Module({
  imports: [AccessModule, CustomersModule, OpportunitiesModule, ProductsModule, ProjectsModule, SafetyMinutesModule],
  providers: [InitialDataLoader, { provide: INITIAL_DATA_LOOKUP, useClass: PrismaInitialDataLookupRepository }],
  exports: [InitialDataLoader],
})
export class InitialDataLoadModule {}
