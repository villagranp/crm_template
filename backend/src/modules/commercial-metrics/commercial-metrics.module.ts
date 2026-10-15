import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaCommercialMetricsRepository } from '@/infrastructure/database/prisma/repositories/prisma-commercial-metrics.repository';
import { CatalogsModule } from '@/modules/catalogs/catalogs.module';

import { BUSINESS_CLOCK, systemBusinessClock } from './business-clock';
import { CommercialMetricsService } from './commercial-metrics.service';
import { COMMERCIAL_METRICS_READ_MODEL } from './ports/commercial-metrics-read-model.port';

/**
 * Indicadores comerciales compartidos por Inicio (01 F.2, L.1) y Reportes (05 G.3):
 * `CommercialMetricsService` es la **fuente única** de las fórmulas (RN-01.10). Enlaza el
 * puerto `COMMERCIAL_METRICS_READ_MODEL` a su adaptador Prisma y exporta el servicio y
 * el reloj del negocio (`BUSINESS_CLOCK`, el mismo token que provee `ProjectsModule`;
 * las pruebas lo sustituyen con `overrideProvider`).
 *
 * No resuelve alcances ni lee parámetros: lo hace cada módulo consumidor con el permiso
 * de su operación (`reportes.ver` en Reportes; el `.ver` de la fuente en Inicio).
 */
@Module({
  imports: [PrismaModule, CatalogsModule],
  providers: [
    CommercialMetricsService,
    { provide: COMMERCIAL_METRICS_READ_MODEL, useClass: PrismaCommercialMetricsRepository },
    { provide: BUSINESS_CLOCK, useValue: systemBusinessClock },
  ],
  exports: [CommercialMetricsService, BUSINESS_CLOCK],
})
export class CommercialMetricsModule {}
