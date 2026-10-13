import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { PrismaAlertsRepository } from '@/infrastructure/database/prisma/repositories/prisma-alerts.repository';
import { PrismaDashboardRepository } from '@/infrastructure/database/prisma/repositories/prisma-dashboard.repository';
import { AccessModule } from '@/modules/access/access.module';
import { BUSINESS_CLOCK, systemBusinessClock } from '@/modules/commercial-metrics/business-clock';
import { CommercialMetricsModule } from '@/modules/commercial-metrics/commercial-metrics.module';
import { CustomersModule } from '@/modules/customers/customers.module';

import { DashboardActivityService } from './dashboard-activity.service';
import { DashboardAlertsService } from './dashboard-alerts.service';
import { DashboardContextFactory } from './dashboard-context';
import { DashboardIndicatorsService } from './dashboard-indicators.service';
import { DashboardController } from './dashboard.controller';
import { ALERTS_READ_MODEL } from './ports/alerts-read-model.port';
import { DASHBOARD_READ_MODEL } from './ports/dashboard-read-model.port';

/**
 * Módulo 1 · Inicio / Panel de control (01). Solo lectura: no crea tablas ni
 * escribe en la base. Las fórmulas vienen de `CommercialMetricsModule`; la
 * actividad y las alertas, de sus puertos de lectura (00 §11). `CustomersModule`
 * aporta el `CustomerActorResolver` (actor local y permisos efectivos).
 */
@Module({
  imports: [PrismaModule, AccessModule, CommercialMetricsModule, CustomersModule],
  controllers: [DashboardController],
  providers: [
    DashboardContextFactory,
    DashboardIndicatorsService,
    DashboardActivityService,
    DashboardAlertsService,
    { provide: BUSINESS_CLOCK, useValue: systemBusinessClock },
    { provide: DASHBOARD_READ_MODEL, useClass: PrismaDashboardRepository },
    { provide: ALERTS_READ_MODEL, useClass: PrismaAlertsRepository },
  ],
})
export class DashboardModule {}
