import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { IsCalendarDateString } from '@/modules/projects/dto/dto-helpers';

export const DASHBOARD_PERIODS = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** 01 F.1: período de K3, K4 y K9 (D-01.3). `from`/`to` anulan `period`; rango ≤ 366 días. */
export class DashboardPeriodQueryDto {
  @ApiPropertyOptional({ enum: DASHBOARD_PERIODS, default: 'MONTH', description: 'Calendario de `crm.zona_horaria_negocio`' })
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  period?: DashboardPeriod;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Fecha de calendario; exige `to` y anula `period`' })
  @IsOptional()
  @IsCalendarDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: '`from ≤ to`, rango ≤ 366 días' })
  @IsOptional()
  @IsCalendarDateString()
  to?: string;
}

export class PeriodDto {
  @ApiProperty({ example: '2026-10-01' }) from!: string;
  @ApiProperty({ example: '2026-10-31' }) to!: string;
  @ApiProperty({ enum: [...DASHBOARD_PERIODS, 'CUSTOM'] }) kind!: string;
}

export class ProjectIndicatorsResponseDto {
  @ApiProperty({ example: 42, description: 'KPI-01' }) activeProjects!: number;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class StageCountDto {
  @ApiProperty({ format: 'uuid' }) stageId!: string;
  @ApiProperty({ example: 'COTIZANDO' }) code!: string;
  @ApiProperty({ example: 'Cotizando' }) label!: string;
  @ApiProperty({ example: 2 }) order!: number;
  @ApiProperty({ example: 11 }) count!: number;
}

export class OpenOpportunitiesDto {
  @ApiProperty({ description: 'KPI-02' }) count!: number;
  @ApiProperty({ type: [StageCountDto] }) byStage!: StageCountDto[];
}

export class WonOpportunitiesDto {
  @ApiProperty({ description: 'KPI-03 = WON + PARTIAL' }) count!: number;
  @ApiProperty() wonCount!: number;
  @ApiProperty() partialCount!: number;
}

export class LostOpportunitiesDto {
  @ApiProperty({ description: 'KPI-04' }) count!: number;
}

export class OpportunityIndicatorsResponseDto {
  @ApiProperty({ type: OpenOpportunitiesDto }) open!: OpenOpportunitiesDto;
  @ApiProperty({ type: WonOpportunitiesDto }) won!: WonOpportunitiesDto;
  @ApiProperty({ type: LostOpportunitiesDto }) lost!: LostOpportunitiesDto;
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class YearMonthDto {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 11 }) month!: number;
}

export class ForecastWindowDto {
  @ApiProperty({ type: YearMonthDto }) from!: YearMonthDto;
  @ApiProperty({ type: YearMonthDto }) to!: YearMonthDto;
}

export class UnitDto {
  @ApiProperty({ example: 'TON' }) code!: string;
  @ApiProperty({ example: 't' }) symbol!: string;
}

export class ForecastMonthDto extends YearMonthDto {
  @ApiProperty({ example: '210.0000' }) tonnage!: string;
  @ApiProperty({ example: 8 }) lineCount!: number;
}

export class UnitQuantityDto {
  @ApiProperty({ example: 'VAR' }) unitCode!: string;
  @ApiProperty({ example: 'var' }) unitSymbol!: string;
  @ApiProperty({ example: '1200.0000' }) quantity!: string;
}

export class ForecastIndicatorsResponseDto {
  @ApiProperty({ type: ForecastWindowDto, description: 'M+1…M+H (DEF-G)' }) window!: ForecastWindowDto;
  @ApiProperty({ type: UnitDto, nullable: true }) tonnageUnit!: UnitDto | null;
  @ApiProperty({ type: String, nullable: true, example: '1250.5000', description: '`null` sin toneladas en la ventana ("Sin proyección")' })
  totalTonnage!: string | null;
  @ApiProperty({ type: [ForecastMonthDto] }) months!: ForecastMonthDto[];
  @ApiProperty({ description: 'Líneas con cantidad y sin conversión (no entran en el total)' }) unconvertedLines!: number;
  @ApiProperty({ type: [UnitQuantityDto], description: 'Cantidades por unidad; nunca se suman entre unidades' }) quantitiesByUnit!: UnitQuantityDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class PendingVisitsDto {
  @ApiProperty({ description: 'KPI-06' }) count!: number;
  @ApiProperty({ description: 'Pendientes con fecha pasada' }) overdueCount!: number;
}

export class UpcomingVisitsCountDto {
  @ApiProperty({ description: 'KPI-07' }) count!: number;
  @ApiProperty({ description: '`crm.inicio.visitas_proximas_dias`' }) days!: number;
}

export class VisitIndicatorsResponseDto {
  @ApiProperty({ type: PendingVisitsDto }) pending!: PendingVisitsDto;
  @ApiProperty({ type: UpcomingVisitsCountDto }) upcoming!: UpcomingVisitsCountDto;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class PendingActivitiesDto {
  @ApiProperty({ description: 'KPI-08: abiertas no vencidas' }) count!: number;
  @ApiProperty() dueSoonCount!: number;
  @ApiProperty({ description: '`crm.alertas.actividad_por_vencer_horas`' }) dueSoonHours!: number;
}

export class OverdueActivitiesDto {
  @ApiProperty({ description: 'KPI-09' }) count!: number;
}

export class ActivityIndicatorsResponseDto {
  @ApiProperty({ type: PendingActivitiesDto }) pending!: PendingActivitiesDto;
  @ApiProperty({ type: OverdueActivitiesDto }) overdue!: OverdueActivitiesDto;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class TargetSubjectDto {
  @ApiProperty({ enum: ['USER', 'TEAM', 'COUNTRY', 'ORGANIZATION'] }) type!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) id!: string | null;
  @ApiProperty({ example: 'Nombre visible' }) label!: string;
}

export class TargetItemDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '`null` si agrupa varias metas' }) targetId!: string | null;
  @ApiProperty({ enum: ['TONNAGE', 'AMOUNT', 'WON_OPPORTUNITIES', 'VISITS', 'ACTIVITIES'] }) metric!: string;
  @ApiProperty({ type: TargetSubjectDto }) subject!: TargetSubjectDto;
  @ApiProperty({ example: '500.0000' }) targetValue!: string;
  @ApiProperty({ example: '320.0000' }) achievedValue!: string;
  @ApiProperty({ type: String, nullable: true, example: '64.00', description: '`null` si el objetivo es 0' }) compliancePercent!: string | null;
  @ApiProperty({ type: UnitDto, nullable: true }) unit!: UnitDto | null;
  @ApiProperty({ type: String, nullable: true, example: null, description: '`USD` en `AMOUNT` (DM-36)' }) currencyCode!: string | null;
}

export class TargetIndicatorsResponseDto {
  @ApiProperty({ description: '`false` → "Sin metas configuradas"' }) hasTargets!: boolean;
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: [TargetItemDto] }) items!: TargetItemDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
