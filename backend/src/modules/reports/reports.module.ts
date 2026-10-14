import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaReportingRepository } from '@/infrastructure/database/prisma/repositories/prisma-reporting.repository';
import { AccessModule } from '@/modules/access/access.module';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';
import { CommercialMetricsModule } from '@/modules/commercial-metrics/commercial-metrics.module';
import { ExchangeRatesModule } from '@/modules/exchange-rates/exchange-rates.module';

import { ActivityReportController } from './activity-report.controller';
import { ActivityReportService } from './activity-report.service';
import { FilterOptionsController } from './filter-options.controller';
import { FilterOptionsService } from './filter-options.service';
import { ForecastReportController } from './forecast-report.controller';
import { ForecastReportService } from './forecast-report.service';
import { LocalCurrencyReferenceService } from './local-currency-reference';
import { OpportunityReportController } from './opportunity-report.controller';
import { OpportunityReportService } from './opportunity-report.service';
import { REPORTING_REPOSITORY } from './ports/reporting.repository.port';
import { ProjectReportController } from './project-report.controller';
import { ProjectReportService } from './project-report.service';
import { ReportContextResolver } from './report-context';
import { VisitReportController } from './visit-report.controller';
import { VisitReportService } from './visit-report.service';

/**
 * Módulo 5 · Reportes (05). **Solo lee** (RN-05.1): no es dueño de ningún registro y no
 * llama a los servicios de Clientes, Proyectos ni Actividad (F.6); lee las tablas
 * compartidas por su puerto `ReportingRepository` (filas) y por el servicio compartido
 * de indicadores `CommercialMetricsService` (conteos y agregados, G.3), con el alcance de
 * `reportes.ver` resuelto por `VisibilityScopeResolver`.
 *
 * `ParametersCoreModule` y `AuditModule` son globales. La exportación XLSX (F-39), el
 * dashboard (F-40) y el embudo (F-41) se añaden aquí en la siguiente etapa (K.2 pasos 5–7).
 */
@Module({
  imports: [PrismaModule, AccessModule, CatalogsModule, CommercialMetricsModule, ExchangeRatesModule],
  controllers: [
    FilterOptionsController,
    ProjectReportController,
    OpportunityReportController,
    ForecastReportController,
    VisitReportController,
    ActivityReportController,
  ],
  providers: [
    ReportContextResolver,
    FilterOptionsService,
    ProjectReportService,
    OpportunityReportService,
    ForecastReportService,
    VisitReportService,
    ActivityReportService,
    LocalCurrencyReferenceService,
    { provide: REPORTING_REPOSITORY, useClass: PrismaReportingRepository },
  ],
})
export class ReportsModule {}
