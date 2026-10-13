import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaForecastRepository } from '@/infrastructure/database/prisma/repositories/prisma-forecast.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { UnitConversionsModule } from '@/modules/unit-conversions/unit-conversions.module';

import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';
import { FORECAST_REPOSITORY } from './ports/forecast.repository.port';

/**
 * Módulo 3 · Forecast M+6 (03 F-20). Dueño de `forecast_lines`. Hereda la visibilidad
 * del proyecto (DM-13) y usa de Proyectos el puerto `PROJECTS_REPOSITORY` para bloquear
 * la fila del proyecto, tocar `last_activity_at` y validar asesores asignables.
 *
 * `FORECAST_CLOCK` (= `BUSINESS_CLOCK`) es el reloj de la ventana; lo provee y exporta
 * `ProjectsModule` (una sola fuente para DEF-G, Revisión E5 m2): el del sistema en
 * producción; las pruebas lo sustituyen (`overrideProvider`) para simular el cambio de mes. `AuditModule`,
 * `ParametersCoreModule`, `LoggingModule` y `PrismaModule` son globales.
 */
@Module({
  imports: [PrismaModule, AccessModule, CustomersModule, ProjectsModule, UnitConversionsModule],
  controllers: [ForecastController],
  providers: [
    ForecastService,
    { provide: FORECAST_REPOSITORY, useClass: PrismaForecastRepository },
  ],
})
export class ForecastModule {}
