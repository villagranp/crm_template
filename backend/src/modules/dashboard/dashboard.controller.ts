import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtension,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import type { AlertType } from './alert-rules';
import { DashboardActivityService } from './dashboard-activity.service';
import { DashboardAlertsService } from './dashboard-alerts.service';
import { DASHBOARD_PERMISSIONS, DashboardContextFactory } from './dashboard-context';
import { DashboardIndicatorsService } from './dashboard-indicators.service';
import {
  toActivityIndicators,
  toAlerts,
  toAlertsSummary,
  toForecastIndicators,
  toOpportunityIndicators,
  toProjectIndicators,
  toRecentActivity,
  toTargetIndicators,
  toUpcomingVisits,
  toVisitIndicators,
} from './dashboard.mapper';
import {
  PaginatedRecentActivityDto,
  PaginatedUpcomingVisitsDto,
  RecentActivityQueryDto,
  UpcomingVisitsQueryDto,
} from './dto/dashboard-activity.dto';
import { AlertsSummaryResponseDto, DashboardAlertsQueryDto, PaginatedDashboardAlertsDto } from './dto/dashboard-alerts.dto';
import {
  ActivityIndicatorsResponseDto,
  DashboardPeriodQueryDto,
  ForecastIndicatorsResponseDto,
  OpportunityIndicatorsResponseDto,
  ProjectIndicatorsResponseDto,
  TargetIndicatorsResponseDto,
  VisitIndicatorsResponseDto,
} from './dto/dashboard-indicators.dto';

/** Fuentes de la actividad reciente y de las alertas (D-01.1): basta con una. */
const MIXED_SOURCE_PERMISSIONS = [
  DASHBOARD_PERMISSIONS.activities,
  DASHBOARD_PERMISSIONS.visits,
  DASHBOARD_PERMISSIONS.opportunities,
  DASHBOARD_PERMISSIONS.projects,
] as const;
const ANY_OF = { 'x-require-any-permission': [...MIXED_SOURCE_PERMISSIONS] };
const ANY_OF_403 = 'PERMISSION_DENIED: no tiene ninguno de `actividades.ver`, `visitas.ver`, `oportunidades.ver`, `proyectos.ver` (D-01.1)';
const PERIOD_400 =
  'VALIDATION_FAILED: `period` desconocido, `from` sin `to` (o al revés), `from > to` o rango > 366 días (`details[0]`: `{ field, issue }`)';

/**
 * Inicio / Panel de control (01 F.1, F-01…F-04). Solo lectura: no hay `404`, `409`
 * ni `422`. Cada indicador exige el `.ver` de su fuente; la actividad reciente y
 * las alertas aceptan cualquiera (`@RequireAnyPermission`, addendum de ADR-008) y
 * el caso de uso filtra cada fuente por su propio permiso y alcance (RN-01.4, RN-01.5).
 */
@ApiTags('Inicio')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly indicators: DashboardIndicatorsService,
    private readonly activity: DashboardActivityService,
    private readonly alerts: DashboardAlertsService,
    private readonly context: DashboardContextFactory,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('indicators/projects')
  @RequirePermission(DASHBOARD_PERMISSIONS.projects)
  @ApiOperation({ summary: 'F-02 · K1 Proyectos activos (KPI-01)', description: 'Proyectos vigentes de fase no final, en el alcance de `proyectos.ver`.' })
  @ApiOkResponse({ type: ProjectIndicatorsResponseDto })
  async projects(@Req() request: AppRequest): Promise<ProjectIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectIndicators(await this.indicators.projects(actor), this.context.now());
  }

  @Get('indicators/opportunities')
  @RequirePermission(DASHBOARD_PERMISSIONS.opportunities)
  @ApiOperation({
    summary: 'F-02 · K2–K4 Oportunidades abiertas, ganadas y perdidas (KPI-02…04)',
    description: 'Ganadas = WON + PARTIAL (DM-15) y perdidas = LOST, por fecha de decisión en el período (mes en curso por defecto).',
  })
  @ApiOkResponse({ type: OpportunityIndicatorsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PERIOD_400 })
  async opportunities(@Query() query: DashboardPeriodQueryDto, @Req() request: AppRequest): Promise<OpportunityIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toOpportunityIndicators(await this.indicators.opportunities(actor, query), this.context.now());
  }

  @Get('indicators/forecast')
  @RequirePermission(DASHBOARD_PERMISSIONS.forecast)
  @ApiOperation({ summary: 'F-02 · K5 Forecast M+1…M+H (KPI-05)', description: 'Solo toneladas; cantidades por unidad sin sumar entre unidades (RN-01.16).' })
  @ApiOkResponse({ type: ForecastIndicatorsResponseDto })
  async forecast(@Req() request: AppRequest): Promise<ForecastIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toForecastIndicators(await this.indicators.forecast(actor), this.context.now());
  }

  @Get('indicators/visits')
  @RequirePermission(DASHBOARD_PERMISSIONS.visits)
  @ApiOperation({ summary: 'F-02 · K6 Visitas pendientes y próximas (KPI-06/07)' })
  @ApiOkResponse({ type: VisitIndicatorsResponseDto })
  async visits(@Req() request: AppRequest): Promise<VisitIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toVisitIndicators(await this.indicators.visits(actor), this.context.now());
  }

  @Get('indicators/activities')
  @RequirePermission(DASHBOARD_PERMISSIONS.activities)
  @ApiOperation({ summary: 'F-02 · K7–K8 Actividades pendientes y vencidas (KPI-08/09)', description: 'Disjuntas: pendiente = abierta no vencida (RN-01.17).' })
  @ApiOkResponse({ type: ActivityIndicatorsResponseDto })
  async activities(@Req() request: AppRequest): Promise<ActivityIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toActivityIndicators(await this.indicators.activities(actor), this.context.now());
  }

  @Get('indicators/targets')
  @RequirePermission(DASHBOARD_PERMISSIONS.targets)
  @ApiOperation({ summary: 'F-02 · K9 Metas y cumplimiento (KPI-10)', description: 'Sin metas aplicables → `hasTargets = false` (DM-9); importes `AMOUNT` en USD (DM-36).' })
  @ApiOkResponse({ type: TargetIndicatorsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: PERIOD_400 })
  async targets(@Query() query: DashboardPeriodQueryDto, @Req() request: AppRequest): Promise<TargetIndicatorsResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toTargetIndicators(await this.indicators.targets(actor, query), this.context.now());
  }

  @Get('upcoming-visits')
  @RequirePermission(DASHBOARD_PERMISSIONS.visits)
  @ApiOperation({ summary: 'F-03 · Próximas visitas', description: 'Pendientes en los próximos `crm.inicio.visitas_proximas_dias` días, orden ascendente; `reminderDue` (RN-01.25).' })
  @ApiOkResponse({ type: PaginatedUpcomingVisitsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `pageSize` > 50' })
  async upcomingVisits(@Query() query: UpcomingVisitsQueryDto, @Req() request: AppRequest): Promise<PaginatedUpcomingVisitsDto> {
    const actor = await this.actors.fromRequest(request);
    return toUpcomingVisits(await this.activity.upcomingVisits(actor, { page: query.page, pageSize: query.pageSize }));
  }

  @Get('recent-activity')
  @RequireAnyPermission(...MIXED_SOURCE_PERMISSIONS)
  @ApiExtension('x-permissions', ANY_OF)
  @ApiOperation({
    summary: 'F-03 · Actividad reciente',
    description: 'Basta con uno de los permisos de fuente; cada tipo de evento solo se incluye con el permiso de su fuente (D.5). Orden descendente.',
  })
  @ApiOkResponse({ type: PaginatedRecentActivityDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `sinceDays` fuera de 1–90, `types` desconocido o `pageSize` > 50' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ANY_OF_403 })
  async recentActivity(@Query() query: RecentActivityQueryDto, @Req() request: AppRequest): Promise<PaginatedRecentActivityDto> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.activity.recentActivity(actor, {
      page: query.page,
      pageSize: query.pageSize,
      sinceDays: query.sinceDays,
      types: query.types ?? [],
    });
    return toRecentActivity(page);
  }

  @Get('alerts')
  @RequireAnyPermission(...MIXED_SOURCE_PERMISSIONS)
  @ApiExtension('x-permissions', ANY_OF)
  @ApiOperation({
    summary: 'F-04 · Alertas y pendientes',
    description: 'Calculadas en cada consulta con `crm.alertas.*` (RN-01.26); cada tipo solo con el permiso de su fuente. Orden por prioridad y fecha (RN-01.27).',
  })
  @ApiOkResponse({ type: PaginatedDashboardAlertsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `type` desconocido, `sortBy` fuera de la lista blanca o `pageSize` > 100' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ANY_OF_403 })
  async alertsList(@Query() query: DashboardAlertsQueryDto, @Req() request: AppRequest): Promise<PaginatedDashboardAlertsDto> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.alerts.list(actor, {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.type ? { types: query.type as AlertType[] } : {}),
      ...(query.priority ? { priorities: query.priority } : {}),
      ...(query.mine !== undefined ? { mine: query.mine } : {}),
      ...(query.sortBy ? { sortBy: query.sortBy } : {}),
      ...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
    });
    return toAlerts(page);
  }

  @Get('alerts/summary')
  @RequireAnyPermission(...MIXED_SOURCE_PERMISSIONS)
  @ApiExtension('x-permissions', ANY_OF)
  @ApiOperation({ summary: 'F-04 · Resumen de alertas por tipo', description: 'Solo los tipos que el usuario puede ver; los desactivados con su motivo (RN-01.30).' })
  @ApiOkResponse({ type: AlertsSummaryResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: ANY_OF_403 })
  async alertsSummary(@Req() request: AppRequest): Promise<AlertsSummaryResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toAlertsSummary(await this.alerts.summary(actor), this.context.now());
  }
}
