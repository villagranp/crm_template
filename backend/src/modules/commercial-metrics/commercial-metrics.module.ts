import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCommercialMetricsRepository } from '@/infrastructure/database/prisma/repositories/prisma-commercial-metrics.repository';

import { CommercialMetricsService } from './commercial-metrics.service';
import { COMMERCIAL_METRICS_READ_MODEL } from './ports/commercial-metrics-read-model.port';

/**
 * Fórmulas comerciales compartidas (01 F.2, D-01.2): lo importan Inicio
 * (`DashboardModule`) y Reportes (Módulo 5), que amplía el mismo servicio.
 */
@Module({
  imports: [PrismaModule],
  providers: [CommercialMetricsService, { provide: COMMERCIAL_METRICS_READ_MODEL, useClass: PrismaCommercialMetricsRepository }],
  exports: [CommercialMetricsService],
})
export class CommercialMetricsModule {}
