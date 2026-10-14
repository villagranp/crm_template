import { ApiProperty } from '@nestjs/swagger';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { ACTIVITY_CATEGORIES, type ActivityCategory, VISIT_CATEGORIES, type VisitCategory } from '@/modules/commercial-metrics/metric-definitions';
import { FORECAST_GROUP_BY, type ForecastGroupBy } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import { LOCAL_REFERENCE_UNAVAILABLE_REASONS, type LocalReferenceUnavailableReason } from '../local-currency-reference';

// ---------------------------------------------------------------------------
// Referencias comunes
// ---------------------------------------------------------------------------

export class ReportNamedRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ReportLabelRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
}

export class ReportUserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class ReportProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
}

export class ReportUnitRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'KG' }) code!: string;
  @ApiProperty({ example: 'kg' }) symbol!: string;
}

// ---------------------------------------------------------------------------
// F-34 Proyectos
// ---------------------------------------------------------------------------

export class ReportPhaseDto extends ReportLabelRefDto {
  @ApiProperty({ description: '`metadata.isFinal` (RN-05.16)' }) isFinal!: boolean;
}

export class ReportCommercialStatusDto {
  @ApiProperty({ enum: ['OPEN_STAGE', 'WON', 'LOST', 'NO_OPPORTUNITIES'], description: 'DEF-B / RN-05.17' })
  kind!: 'OPEN_STAGE' | 'WON' | 'LOST' | 'NO_OPPORTUNITIES';
  @ApiProperty({ description: 'Etiqueta de la etapa en `OPEN_STAGE`; "Ganado", "Perdido" o "Sin oportunidades" en el resto' }) label!: string;
  @ApiProperty({ type: ReportLabelRefDto, nullable: true, description: 'Solo en `OPEN_STAGE`' }) stage!: ReportLabelRefDto | null;
}

export class ProjectReportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: ReportNamedRefDto }) customer!: ReportNamedRefDto;
  @ApiProperty({ type: ReportNamedRefDto }) country!: ReportNamedRefDto;
  @ApiProperty({ type: String, nullable: true, description: 'Ubicación' }) city!: string | null;
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty({ type: ReportLabelRefDto, nullable: true }) projectType!: ReportLabelRefDto | null;
  @ApiProperty({ type: ReportPhaseDto }) phase!: ReportPhaseDto;
  @ApiProperty({ example: '45.00', description: '% de avance (2 decimales)' }) phaseProgress!: string;
  @ApiProperty({ type: ReportCommercialStatusDto }) commercialStatus!: ReportCommercialStatusDto;
  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2026-11-30' }) estimatedDecisionDate!: string | null;
  @ApiProperty({ format: 'date-time', description: 'Última actualización (`last_activity_at`, DEF-C)' }) lastActivityAt!: string;
}

export class PaginatedProjectReportDto {
  @ApiProperty({ type: [ProjectReportRowDto] }) data!: ProjectReportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// F-35 Oportunidades
// ---------------------------------------------------------------------------

export class ReportStageDto extends ReportLabelRefDto {
  @ApiProperty({ description: '`metadata.isClosed` (DEF-A)' }) isClosed!: boolean;
}

export class OpportunityReportResultDto {
  @ApiProperty({ enum: ['WON', 'LOST', 'PARTIAL'] }) outcome!: 'WON' | 'LOST' | 'PARTIAL';
  @ApiProperty({ type: ReportLabelRefDto, nullable: true, description: 'Motivo' }) reason!: ReportLabelRefDto | null;
  @ApiProperty({ type: String, nullable: true, example: '60.00', description: '% adjudicado (solo `PARTIAL`)' }) awardedPercent!: string | null;
}

export class OpportunityReportEstimateDto {
  @ApiProperty({ type: String, nullable: true, example: '7750.0000', description: 'Monto original' }) amount!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'GTQ' }) currencyCode!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '7.75000000', description: 'Unidades por 1 USD (foto al registrar)' }) exchangeRate!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2026-10-01', description: '`null` en USD' }) exchangeRateDate!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '1000.0000', description: 'Equivalente en USD guardado (`estimated_amount_usd`)' }) amountUsd!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '12.5000', description: 'Toneladas estimadas' }) tonnage!: string | null;
}

export class OpportunityReportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OPO-2026-00042' }) code!: string;
  @ApiProperty({ type: ReportProjectRefDto }) project!: ReportProjectRefDto;
  @ApiProperty({ type: ReportNamedRefDto }) customer!: ReportNamedRefDto;
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty({ type: ReportStageDto }) stage!: ReportStageDto;
  @ApiProperty({ type: OpportunityReportResultDto, nullable: true }) result!: OpportunityReportResultDto | null;
  @ApiProperty({ type: OpportunityReportEstimateDto }) estimate!: OpportunityReportEstimateDto;
  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'RN-05.28: la del resultado; sin resultado, la estimada del proyecto' }) decisionDate!: string | null;
  @ApiProperty({ enum: ['ACTUAL', 'ESTIMATED'], nullable: true }) decisionDateKind!: 'ACTUAL' | 'ESTIMATED' | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedOpportunityReportDto {
  @ApiProperty({ type: [OpportunityReportRowDto] }) data!: OpportunityReportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class ReportStageCountStageDto extends ReportLabelRefDto {
  @ApiProperty({ example: 'COTIZANDO' }) code!: string;
  @ApiProperty({ description: '`metadata.order`' }) order!: number;
  @ApiProperty() isClosed!: boolean;
  @ApiProperty({ description: 'Una etapa inactiva solo aparece si aún tiene oportunidades' }) isActive!: boolean;
}

export class ReportStageCountDto {
  @ApiProperty({ type: ReportStageCountStageDto }) stage!: ReportStageCountStageDto;
  @ApiProperty() count!: number;
}

export class ReportOwnerCountDto {
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty() total!: number;
  @ApiProperty() open!: number;
  @ApiProperty({ description: 'WON + PARTIAL (DM-15)' }) won!: number;
  @ApiProperty() partial!: number;
  @ApiProperty() lost!: number;
}

export class LocalCurrencyReferenceDto {
  @ApiProperty({ example: 'GTQ' }) currencyCode!: string;
  @ApiProperty({ example: '968750.0000', description: 'Total USD × tasa, 4 decimales HALF_UP' }) amount!: string;
  @ApiProperty({ example: '7.75000000' }) exchangeRate!: string;
  @ApiProperty({ format: 'date', example: '2026-10-01', description: 'Vigencia de la tasa usada' }) exchangeRateDate!: string;
  @ApiProperty({ format: 'date', description: '`to` del período o hoy en la zona del negocio' }) cutDate!: string;
  @ApiProperty({ enum: ['referencial'] }) label!: 'referencial';
}

export class OpportunityEstimateTotalsDto {
  @ApiProperty({ example: '125000.0000', description: 'Σ `estimated_amount_usd` (RN-05.13): **el único total**' }) amountUsd!: string;
  @ApiProperty({ example: 'USD', description: '`crm.moneda_base`' }) currencyCode!: string;
  @ApiProperty({ example: '340.5000', description: 'Σ toneladas estimadas no nulas' }) tonnage!: string;
  @ApiProperty({ type: LocalCurrencyReferenceDto, nullable: true, description: 'RN-05.58: solo presentación, con un único país efectivo' })
  localReference!: LocalCurrencyReferenceDto | null;
  @ApiProperty({ enum: LOCAL_REFERENCE_UNAVAILABLE_REASONS, nullable: true }) localReferenceUnavailableReason!: LocalReferenceUnavailableReason | null;
}

export class OpportunityReportSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() open!: number;
  @ApiProperty({ description: 'Ganadas = WON + PARTIAL (DM-15)' }) won!: number;
  @ApiProperty({ description: 'Solo WON (100 %)' }) wonFull!: number;
  @ApiProperty({ description: '"de las cuales parciales" y "Resultados parciales"' }) partial!: number;
  @ApiProperty() lost!: number;
  @ApiProperty({ description: 'Cerradas sin resultado (RN-05.26); `open + won + lost + closedWithoutResult = total`' }) closedWithoutResult!: number;
  @ApiProperty({ type: [ReportStageCountDto], description: 'Etapas activas en `metadata.order`, también con 0 (RN-05.30)' }) byStage!: ReportStageCountDto[];
  @ApiProperty({ type: [ReportOwnerCountDto], description: 'Por asesor de la oportunidad (RN-05.31)' }) byOwner!: ReportOwnerCountDto[];
  @ApiProperty({ type: OpportunityEstimateTotalsDto }) estimateTotals!: OpportunityEstimateTotalsDto;
}

// ---------------------------------------------------------------------------
// F-36 Forecast
// ---------------------------------------------------------------------------

export class ForecastReportProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() description!: string;
}

export class ForecastReportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ReportProjectRefDto }) project!: ReportProjectRefDto;
  @ApiProperty({ type: ReportNamedRefDto }) customer!: ReportNamedRefDto;
  @ApiProperty({ type: ForecastReportProductDto }) product!: ForecastReportProductDto;
  @ApiProperty({ type: ReportNamedRefDto }) family!: ReportNamedRefDto;
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 11 }) month!: number;
  @ApiProperty({ example: '10.0000' }) quantity!: string;
  @ApiProperty({ type: ReportUnitRefDto }) unit!: ReportUnitRefDto;
  @ApiProperty({ type: String, nullable: true, example: '3.3600', description: '`null` = sin conversión (DM-24)' }) tonnage!: string | null;
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedForecastReportDto {
  @ApiProperty({ type: [ForecastReportRowDto] }) data!: ForecastReportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class ForecastUnitQuantityDto {
  @ApiProperty({ type: ReportUnitRefDto }) unit!: ReportUnitRefDto;
  @ApiProperty({ example: '120.0000', description: 'Suma dentro de la unidad; nunca entre unidades (RN-05.12)' }) quantity!: string;
}

export class ForecastUnitQuantityCumulativeDto extends ForecastUnitQuantityDto {
  @ApiProperty({ example: '240.0000', description: 'Acumulado de la unidad en el rango' }) cumulative!: string;
}

export class ForecastMonthSummaryDto {
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
  @ApiProperty({ example: '210.0000', description: 'Σ toneladas de las líneas con conversión' }) tonnage!: string;
  @ApiProperty({ example: '420.0000', description: 'Acumulado cronológico (RN-05.35)' }) cumulativeTonnage!: string;
  @ApiProperty({ type: [ForecastUnitQuantityCumulativeDto] }) quantities!: ForecastUnitQuantityCumulativeDto[];
  @ApiProperty() lineCount!: number;
  @ApiProperty({ description: 'Líneas sin conversión (fuera del total de toneladas)' }) linesWithoutConversion!: number;
}

export class ForecastTotalsDto {
  @ApiProperty({ example: '1250.5000' }) tonnage!: string;
  @ApiProperty({ type: [ForecastUnitQuantityDto] }) quantities!: ForecastUnitQuantityDto[];
  @ApiProperty() lineCount!: number;
  @ApiProperty() linesWithoutConversion!: number;
}

export class ForecastMonthRefDto {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 11 }) month!: number;
}

export class ForecastRangeDto {
  @ApiProperty({ type: ForecastMonthRefDto }) from!: ForecastMonthRefDto;
  @ApiProperty({ type: ForecastMonthRefDto }) to!: ForecastMonthRefDto;
}

export class ForecastReportSummaryDto {
  @ApiProperty({ type: ForecastRangeDto, description: 'Rango aplicado (por defecto M+1…M+6 en la zona del negocio)' }) range!: ForecastRangeDto;
  @ApiProperty({ type: [ForecastMonthSummaryDto], description: 'Un elemento por **cada** mes del rango' }) months!: ForecastMonthSummaryDto[];
  @ApiProperty({ type: ForecastTotalsDto }) totals!: ForecastTotalsDto;
  @ApiProperty({ example: 'TON', description: '`crm.forecast.unidad_tonelaje`' }) tonnageUnit!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'MAX(updated_at) de las líneas filtradas (RN-05.37)' }) lastUpdatedAt!: string | null;
  @ApiProperty() lineCount!: number;
}

export class ForecastGroupKeyDto {
  @ApiProperty({ enum: FORECAST_GROUP_BY }) type!: ForecastGroupBy;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '`null` en `MONTH`' }) id!: string | null;
  @ApiProperty({ example: '2026-11' }) label!: string;
}

export class ForecastGroupMonthDto extends ForecastTotalsDto {
  @ApiProperty() year!: number;
  @ApiProperty() month!: number;
}

export class ForecastSubgroupDto {
  @ApiProperty({ type: ForecastGroupKeyDto }) key!: ForecastGroupKeyDto;
  @ApiProperty({ type: [ForecastGroupMonthDto], description: 'Cada mes del rango' }) months!: ForecastGroupMonthDto[];
  @ApiProperty({ type: ForecastTotalsDto }) total!: ForecastTotalsDto;
}

export class ForecastGroupDto extends ForecastSubgroupDto {
  @ApiProperty({ type: [ForecastSubgroupDto], nullable: true, description: 'Solo con `thenBy`' }) subgroups!: ForecastSubgroupDto[] | null;
}

export class PaginatedForecastGroupDto {
  @ApiProperty({ type: [ForecastGroupDto] }) data!: ForecastGroupDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// F-37 Visitas
// ---------------------------------------------------------------------------

export class VisitReportStatusDto extends ReportLabelRefDto {
  @ApiProperty({ enum: VISIT_CATEGORIES, description: 'RN-05.38' }) category!: VisitCategory;
}

export class VisitReportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) code!: string;
  @ApiProperty({ type: ReportNamedRefDto }) customer!: ReportNamedRefDto;
  @ApiProperty({ type: ReportProjectRefDto, nullable: true }) project!: ReportProjectRefDto | null;
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty({ format: 'date-time', description: 'Fecha planificada **vigente**' }) scheduledStartAt!: string;
  @ApiProperty({ format: 'date-time' }) originalScheduledAt!: string;
  @ApiProperty({ description: 'Veces reprogramada (la visita es una sola fila, RN-05.39)' }) rescheduleCount!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) actualStartAt!: string | null;
  @ApiProperty({ type: VisitReportStatusDto }) status!: VisitReportStatusDto;
  @ApiProperty({ type: ReportLabelRefDto, nullable: true }) result!: ReportLabelRefDto | null;
  @ApiProperty({ type: String, nullable: true }) resultSummary!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Confirmación del propio asesor (DM-20), tal cual' }) confirmedAt!: string | null;
}

export class PaginatedVisitReportDto {
  @ApiProperty({ type: [VisitReportRowDto] }) data!: VisitReportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class VisitReportSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Programadas (`isPending`, incluye REPROGRAMADA)' }) scheduled!: number;
  @ApiProperty({ description: 'Realizadas sin confirmar (`isDone`)' }) completed!: number;
  @ApiProperty() confirmed!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty({ description: 'Realizadas en total = completed + confirmed' }) completedTotal!: number;
  @ApiProperty({ description: 'Informativo: visitas con al menos una reprogramación' }) rescheduledVisits!: number;
  @ApiProperty({ description: 'Informativo: total de reprogramaciones' }) rescheduleEvents!: number;
  @ApiProperty({ description: 'Informativo: programadas con fecha pasada' }) overduePending!: number;
}

// ---------------------------------------------------------------------------
// F-38 Actividades
// ---------------------------------------------------------------------------

export class ActivityReportPriorityDto extends ReportLabelRefDto {
  @ApiProperty({ description: '`metadata.weight`' }) weight!: number;
}

export class ActivityReportStatusDto extends ReportLabelRefDto {
  @ApiProperty({ enum: ACTIVITY_CATEGORIES, description: 'RN-05.41 (VENCIDA es derivada, no un estado)' }) category!: ActivityCategory;
}

export class ActivityReportRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ACT-2026-000042' }) code!: string;
  @ApiProperty({ type: ReportLabelRefDto }) type!: ReportLabelRefDto;
  @ApiProperty() subject!: string;
  @ApiProperty({ type: ReportNamedRefDto }) customer!: ReportNamedRefDto;
  @ApiProperty({ type: ReportProjectRefDto, nullable: true }) project!: ReportProjectRefDto | null;
  @ApiProperty({ type: ReportUserRefDto }) owner!: ReportUserRefDto;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '`COALESCE(scheduled_at, due_at)`' }) activityDate!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: string | null;
  @ApiProperty({ type: ActivityReportPriorityDto }) priority!: ActivityReportPriorityDto;
  @ApiProperty({ type: ActivityReportStatusDto }) status!: ActivityReportStatusDto;
  @ApiProperty({ description: 'Abierta con vencimiento pasado' }) isOverdue!: boolean;
  @ApiProperty({ type: ReportLabelRefDto, nullable: true }) result!: ReportLabelRefDto | null;
  @ApiProperty({ type: String, nullable: true }) resultNotes!: string | null;
}

export class PaginatedActivityReportDto {
  @ApiProperty({ type: [ActivityReportRowDto] }) data!: ActivityReportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class ActivityReportSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Abiertas no vencidas (D-05.5)' }) pending!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty({ description: 'Informativo: pendientes que vencen en `[ahora, ahora + horas]`' }) dueSoon!: number;
  @ApiProperty({ example: 48, description: '`crm.alertas.actividad_por_vencer_horas`' }) dueSoonHours!: number;
}

// ---------------------------------------------------------------------------
// Opciones de filtro
// ---------------------------------------------------------------------------

export class ReportCatalogOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Los inactivos se ofrecen para consultar históricos' }) isActive!: boolean;
}

export class ReportStageOptionDto extends ReportCatalogOptionDto {
  @ApiProperty() order!: number;
  @ApiProperty() isClosed!: boolean;
  @ApiProperty() inFunnel!: boolean;
}

export class ReportPhaseOptionDto extends ReportCatalogOptionDto {
  @ApiProperty() order!: number;
  @ApiProperty() isFinal!: boolean;
}

export class ReportVisitStatusOptionDto extends ReportCatalogOptionDto {
  @ApiProperty({ enum: VISIT_CATEGORIES }) category!: VisitCategory;
}

export class ReportActivityStatusOptionDto extends ReportCatalogOptionDto {
  @ApiProperty({ enum: ['OPEN', 'COMPLETED', 'CANCELLED'] }) group!: 'OPEN' | 'COMPLETED' | 'CANCELLED';
}

export class ReportPriorityOptionDto extends ReportCatalogOptionDto {
  @ApiProperty() weight!: number;
}

export class ReportFilterCatalogsDto {
  @ApiProperty({ type: [ReportStageOptionDto], description: '`crm.etapa_oportunidad`' }) opportunityStages!: ReportStageOptionDto[];
  @ApiProperty({ type: [ReportPhaseOptionDto], description: '`crm.fase_cliente`' }) projectPhases!: ReportPhaseOptionDto[];
  @ApiProperty({ type: [ReportCatalogOptionDto], description: '`crm.tipo_proyecto`' }) projectTypes!: ReportCatalogOptionDto[];
  @ApiProperty({ type: [ReportVisitStatusOptionDto], description: '`crm.estado_visita`' }) visitStatuses!: ReportVisitStatusOptionDto[];
  @ApiProperty({ type: [ReportActivityStatusOptionDto], description: '`crm.estado_actividad`' }) activityStatuses!: ReportActivityStatusOptionDto[];
  @ApiProperty({ type: [ReportCatalogOptionDto], description: '`crm.tipo_actividad`' }) activityTypes!: ReportCatalogOptionDto[];
  @ApiProperty({ type: [ReportPriorityOptionDto], description: '`crm.prioridad`' }) priorities!: ReportPriorityOptionDto[];
  @ApiProperty({ type: [ReportCatalogOptionDto], description: '`crm.tipo_empresa` (tipo de cliente, D-05.8)' }) companyTypes!: ReportCatalogOptionDto[];
}

export class ReportFilterOptionsDto {
  @ApiProperty({ type: [ReportUserRefDto], description: 'Responsables de algún registro comercial visible' }) owners!: ReportUserRefDto[];
  @ApiProperty({ type: [ReportNamedRefDto], description: 'Países de los registros visibles y del alcance' }) countries!: ReportNamedRefDto[];
  @ApiProperty({ type: ReportFilterCatalogsDto }) catalogs!: ReportFilterCatalogsDto;
  @ApiProperty({ type: [ReportNamedRefDto], description: 'Familias de producto activas' }) productFamilies!: ReportNamedRefDto[];
  @ApiProperty({ enum: ['OWN', 'TEAM', 'COUNTRY', 'ORGANIZATION'], description: 'Alcance de `reportes.ver`' }) scope!: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';
}
