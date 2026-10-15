import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { AuthenticationModule } from './infrastructure/authentication/authentication.module';
import { AccessModule } from './modules/access/access.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { CommercialActivityModule } from './modules/commercial-activity/commercial-activity.module';
import { CommercialMetricsModule } from './modules/commercial-metrics/commercial-metrics.module';
import { CustomerImportsModule } from './modules/customer-imports/customer-imports.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { ForecastModule } from './modules/forecast/forecast.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ParametersCoreModule } from './modules/parameters/parameters-core.module';
import { ParametersModule } from './modules/parameters/parameters.module';
import { ProductsModule } from './modules/products/products.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SafetyMinutesModule } from './modules/safety-minutes/safety-minutes.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UnitConversionsModule } from './modules/unit-conversions/unit-conversions.module';
import { HealthModule } from './modules/health/health.module';
import { InitialDataLoadModule } from './modules/initial-data-load/initial-data-load.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { AuthenticationGuard } from './common/guards/authentication.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

/**
 * Controles transversales aplicados globalmente (deny-by-default):
 * rate limiting -> autenticacion -> autorizacion.
 * El orden de los guards importa: se evaluan en el orden en que se registran.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: config.get('RATE_LIMIT_TTL_SECONDS') * 1000,
          limit: config.get('RATE_LIMIT_MAX_REQUESTS'),
        },
      ],
    }),
    PrismaModule,
    AuthenticationModule,
    AccessModule,
    AuthModule,
    AuditModule,
    TeamsModule,
    ParametersCoreModule,
    CatalogsModule,
    ParametersModule,
    ApprovalsModule,
    // Sin rutas propias; se registra aquí para que la ruta de adjuntos se valide al arrancar (ADR-021).
    AttachmentsModule,
    // CRM · piezas transversales de solo lectura (00 §11): tipos de cambio (ADR-024) y conversión a toneladas.
    ExchangeRatesModule,
    UnitConversionsModule,
    // CRM · Módulo 2: clientes, contactos y sus adjuntos (02).
    CustomersModule,
    // CRM · Módulo 3: maestro de productos (solo lectura), proyectos (03, E2a), oportunidades y forecast (E2b).
    ProductsModule,
    ProjectsModule,
    OpportunitiesModule,
    ForecastModule,
    // CRM · Módulo 4: actividad comercial (04).
    CommercialActivityModule,
    // CRM · Módulo 1: fórmulas comerciales compartidas (Inicio y Reportes, 01 F.2, 05 G.3) y panel de Inicio (01).
    CommercialMetricsModule,
    DashboardModule,
    // CRM · Módulo 5: reportes (05).
    ReportsModule,
    // CRM · Módulo 6: carga masiva de clientes (06, F-42).
    CustomerImportsModule,
    // Ajustes 1 (AJ1-2): minuto de seguridad (mantenimiento y lectura del día).
    SafetyMinutesModule,
    // Carga inicial de datos por scripts (CARGA-INICIAL.md): sin rutas HTTP, solo para `scripts/load-initial-data.ts`.
    InitialDataLoadModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
