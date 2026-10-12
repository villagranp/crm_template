import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { CatalogValueDto, UserRefDto } from '@/modules/customers/dto/customer.dto';
import { isPresent, trimToNull } from '@/modules/customers/dto/dto-transforms';
import { IsCalendarDateString, isNotNull } from '@/modules/projects/dto/dto-helpers';
import { CustomerRefDto } from '@/modules/projects/dto/project.dto';

import { OpportunityResultDto, OpportunityResultSummaryDto, ResultHistoryItemDto } from './opportunity-result.dto';

const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD` (DM-31)';
/** Montos y tonelajes ≥ 0: hasta 15 enteros y 4 decimales (03 H.3). Un negativo es `400 VALIDATION_FAILED`. */
export const NON_NEGATIVE_DECIMAL = /^\d{1,15}(\.\d{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const AMOUNT_NOTE =
  'Monto ≥ 0 (hasta 4 decimales) en `currencyCode`. Exige moneda (`422 CURRENCY_REQUIRED`). El servidor resuelve la tasa vigente a `opportunityDate` y calcula el equivalente en USD (RN-03.79, RN-03.80)';
const CURRENCY_NOTE =
  'ISO 4217: `USD` (moneda base) o la moneda del país del proyecto (`422 CURRENCY_NOT_ALLOWED`); ver `GET /opportunities/form-options?projectId=`';

// ---------------------------------------------------------------------------
// Entrada (F-17)
// ---------------------------------------------------------------------------

/**
 * 03 F.2 `CreateOpportunityDto`. `exchangeRate`, `exchangeRateDate` y
 * `estimatedAmountUsd` **no** se aceptan (`400 VALIDATION_FAILED`, RN-03.82).
 */
export class CreateOpportunityDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Etapa inicial **abierta** (`422 INVALID_INITIAL_STAGE` si es cerrada). Por defecto `crm.valores_por_defecto["opportunity.stageId"]`',
  })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Fecha de identificación (DM-35); por defecto hoy en \`crm.zona_horaria_negocio\`` })
  @IsOptional()
  @IsCalendarDateString()
  opportunityDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Por defecto el usuario. Otro asesor exige `oportunidades.administrar` (`403 FIELD_NOT_EDITABLE`)' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ example: '7750.0000', description: AMOUNT_NOTE })
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, { message: 'estimatedAmount must be a non-negative decimal with up to 4 decimals' })
  estimatedAmount?: string;

  @ApiPropertyOptional({ example: 'GTQ', minLength: 3, maxLength: 3, description: CURRENCY_NOTE })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_PATTERN, { message: 'currencyCode must be a 3-letter ISO 4217 code' })
  currencyCode?: string;

  @ApiPropertyOptional({ example: '120.5000', description: 'Tonelaje estimado ≥ 0, independiente del monto (no se convierte)' })
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, { message: 'estimatedTonnage must be a non-negative decimal with up to 4 decimals' })
  estimatedTonnage?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 300, description: 'Siguiente acción (su ausencia en una abierta genera alerta en Inicio)' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(300)
  nextAction?: string | null;

  @ApiPropertyOptional({ format: 'date', description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  nextActionDate?: string;
}

/**
 * 03 F.2 `UpdateOpportunityDto` (sin etapa: se cambia con `stage-changes`). Omitido =
 * sin cambio; `null` borra (campos anulables). `estimatedAmount` y `currencyCode` a
 * `null` borran los cinco campos de la estimación.
 */
export class UpdateOpportunityDto {
  @ApiPropertyOptional({ format: 'date', description: `${DATE_NOTE}. Cambiarla vuelve a resolver la tasa (RN-03.82)` })
  @ValidateIf(isPresent)
  @IsCalendarDateString()
  opportunityDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reasignar: `oportunidades.administrar` con la oportunidad en su alcance' })
  @ValidateIf(isPresent)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ example: '7750.0000', nullable: true, description: AMOUNT_NOTE })
  @IsOptional()
  @ValidateIf(isNotNull)
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, { message: 'estimatedAmount must be a non-negative decimal with up to 4 decimals' })
  estimatedAmount?: string | null;

  @ApiPropertyOptional({ example: 'GTQ', nullable: true, description: CURRENCY_NOTE })
  @IsOptional()
  @ValidateIf(isNotNull)
  @IsString()
  @Matches(CURRENCY_PATTERN, { message: 'currencyCode must be a 3-letter ISO 4217 code' })
  currencyCode?: string | null;

  @ApiPropertyOptional({ example: '120.5000', nullable: true })
  @IsOptional()
  @ValidateIf(isNotNull)
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, { message: 'estimatedTonnage must be a non-negative decimal with up to 4 decimals' })
  estimatedTonnage?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf(isNotNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf(isNotNull)
  @IsString()
  @MaxLength(300)
  nextAction?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: DATE_NOTE })
  @IsOptional()
  @ValidateIf(isNotNull)
  @IsCalendarDateString()
  nextActionDate?: string | null;
}

// ---------------------------------------------------------------------------
// Respuesta
// ---------------------------------------------------------------------------

export class OpportunityStageDto extends CatalogValueDto {
  @ApiProperty({ description: '`metadata.order` (columnas del tablero)' }) order!: number;
  @ApiProperty({ description: 'DEF-A: etapa cerrada' }) isClosed!: boolean;
  @ApiProperty({ enum: ['WON', 'LOST'], nullable: true, type: String, description: 'Resultado que admite una etapa cerrada' }) outcome!: string | null;
}

export class OpportunityProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
}

export class OpportunityCapabilitiesDto {
  @ApiProperty({ description: '`oportunidades.editar` y (propia, o `oportunidades.administrar` en su alcance): editar datos y pasar a etapas abiertas' })
  canEdit!: boolean;
  @ApiProperty({ description: 'Además `oportunidades.cerrar`: pasar a etapas cerradas y modificar el resultado' }) canClose!: boolean;
  @ApiProperty({ description: 'Cerrada y `oportunidades.administrar` en su alcance (RN-03.42)' }) canReopen!: boolean;
  @ApiProperty({ description: 'Abierta y `oportunidades.eliminar` en su alcance. Los bloqueos por dependencias (`409`) se deciden al eliminar' })
  canDelete!: boolean;
}

export class OpportunityCoreDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OPO-2026-00042' }) code!: string;
  @ApiProperty({ type: OpportunityProjectRefDto }) project!: OpportunityProjectRefDto;
  @ApiProperty({ type: CustomerRefDto }) customer!: CustomerRefDto;
  @ApiProperty({ type: OpportunityStageDto }) stage!: OpportunityStageDto;
  @ApiProperty({ format: 'date' }) opportunityDate!: string;
  @ApiProperty({ type: UserRefDto }) owner!: UserRefDto;
  @ApiProperty({ example: '7750.0000', nullable: true, type: String, description: 'DM-36: los cinco campos van juntos o ninguno' }) estimatedAmount!: string | null;
  @ApiProperty({ example: 'GTQ', nullable: true, type: String }) currencyCode!: string | null;
  @ApiProperty({ example: '7.75000000', nullable: true, type: String, description: 'Unidades de la moneda por 1 USD; `1.00000000` en USD' })
  exchangeRate!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'Vigencia de la tasa aplicada; nula en USD' }) exchangeRateDate!: string | null;
  @ApiProperty({ example: '1000.0000', nullable: true, type: String, description: 'Equivalente en USD (base de todo total, RN-03.83)' })
  estimatedAmountUsd!: string | null;
  @ApiProperty({ example: '120.5000', nullable: true, type: String }) estimatedTonnage!: string | null;
  @ApiProperty({ nullable: true, type: String }) nextAction!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextActionDate!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: OpportunityCapabilitiesDto }) capabilities!: OpportunityCapabilitiesDto;
}

export class OpportunityListItemDto extends OpportunityCoreDto {
  @ApiProperty({ type: OpportunityResultSummaryDto, nullable: true, description: 'Resultado vigente (solo cerradas)' }) result!: OpportunityResultSummaryDto | null;
}

export class PaginatedOpportunitiesDto {
  @ApiProperty({ type: [OpportunityListItemDto] }) data!: OpportunityListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class OpportunityDetailDto extends OpportunityCoreDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) stageChangedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) closedAt!: string | null;
  @ApiProperty({ type: OpportunityResultDto, nullable: true, description: 'Resultado vigente (solo cerradas)' }) result!: OpportunityResultDto | null;
  @ApiProperty({
    type: [OpportunityStageDto],
    description: 'Destinos válidos para este usuario ahora (mapa del parámetro, regla de respaldo, `cerrar` para las cerradas, `administrar` para reabrir)',
  })
  allowedTransitions!: OpportunityStageDto[];
  @ApiProperty({ description: 'Productos asociados activos con esta oportunidad' }) productLines!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) createdBy!: UserRefDto | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
}

export class ExchangeRateStaleDetailsDto {
  @ApiProperty({ example: 'GTQ' }) currencyCode!: string;
  @ApiProperty({ format: 'date' }) exchangeRateDate!: string;
  @ApiProperty({ format: 'date', description: '`opportunityDate`' }) referenceDate!: string;
  @ApiProperty({ example: 45 }) ageDays!: number;
  @ApiProperty({ example: 31, description: '`crm.tipos_cambio.dias_aviso_antiguedad`' }) thresholdDays!: number;
}

export class OpportunityWarningDto {
  @ApiProperty({ enum: ['EXCHANGE_RATE_STALE'] }) code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: ExchangeRateStaleDetailsDto, description: 'Objeto (no lista): aviso no bloqueante (RN-03.81)' }) details!: ExchangeRateStaleDetailsDto;
}

export class OpportunityMutationResponseDto extends OpportunityDetailDto {
  @ApiPropertyOptional({
    type: [OpportunityWarningDto],
    description: 'Solo en POST/PATCH cuando la tasa aplicada es más antigua que el umbral; no cambia el status (RN-03.81)',
  })
  warnings?: OpportunityWarningDto[];
}

export class StageHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: CatalogValueDto, nullable: true, description: 'Nulo en el alta' }) fromStage!: CatalogValueDto | null;
  @ApiProperty({ type: CatalogValueDto }) toStage!: CatalogValueDto;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ type: UserRefDto }) changedBy!: UserRefDto;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}

export class StageCountDto {
  @ApiProperty({ type: OpportunityStageDto }) stage!: OpportunityStageDto;
  @ApiProperty() count!: number;
}

export class StageSummaryDto {
  @ApiProperty({ type: [StageCountDto], description: 'Etapas activas por `metadata.order` (conteo 0 incluido) y etapas inactivas con oportunidades' })
  stages!: StageCountDto[];
}

export class OpportunityHistoryDto {
  @ApiProperty({ type: [StageHistoryItemDto], description: 'Del más reciente al más antiguo; la primera fila (alta) tiene `fromStage` nulo' })
  stages!: StageHistoryItemDto[];
  @ApiProperty({ type: [ResultHistoryItemDto], description: 'Del más reciente al más antiguo (`RECORDED`, `CHANGED`, `CLEARED`)' })
  results!: ResultHistoryItemDto[];
}

// ---------------------------------------------------------------------------
// Opciones de formulario (D-03.1)
// ---------------------------------------------------------------------------

export class OutcomeOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['WON', 'LOST', 'PARTIAL'] }) code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['WON', 'LOST'], description: '`outcome` de la etapa cerrada que admite' }) stageOutcome!: string;
  @ApiProperty() requiresReason!: boolean;
  @ApiProperty() requiresAwardedPercent!: boolean;
}

export class ReasonOptionDto extends CatalogValueDto {
  @ApiProperty({ enum: ['WON', 'LOST', 'PARTIAL'], isArray: true, description: '`metadata.appliesTo`' }) appliesTo!: string[];
}

export class CurrencyOptionDto {
  @ApiProperty({ example: 'GTQ' }) code!: string;
  @ApiProperty({ example: 'Quetzal' }) name!: string;
  @ApiProperty({ example: 'Q' }) symbol!: string;
  @ApiProperty({ example: 2 }) decimals!: number;
}

export class AllowedCurrenciesDto {
  @ApiProperty({ type: [CurrencyOptionDto], description: 'USD (base) y la moneda del país del proyecto, sin repetir; solo activas' })
  allowed!: CurrencyOptionDto[];
  @ApiProperty({ example: 'GTQ', description: 'Moneda del país del proyecto (USD si no está admitida)' }) defaultCode!: string;
}

export class OpportunityFormDefaultsDto {
  @ApiProperty({ format: 'uuid', description: 'Etapa inicial por defecto (`crm.valores_por_defecto`)' }) stageId!: string;
  @ApiProperty({ format: 'date', description: 'Hoy en `crm.zona_horaria_negocio`' }) opportunityDate!: string;
}

export class OpportunityFormOptionsDto {
  @ApiProperty({ type: [OpportunityStageDto], description: 'Etapas activas por `metadata.order`' }) stages!: OpportunityStageDto[];
  @ApiProperty({ type: [OutcomeOptionDto] }) outcomes!: OutcomeOptionDto[];
  @ApiProperty({ type: [ReasonOptionDto], description: 'Motivos activos' }) reasons!: ReasonOptionDto[];
  @ApiProperty({ example: 'USD', description: '`crm.moneda_base`' }) baseCurrencyCode!: string;
  @ApiProperty({ type: OpportunityFormDefaultsDto }) defaults!: OpportunityFormDefaultsDto;
  @ApiPropertyOptional({ type: AllowedCurrenciesDto, description: 'Solo con `?projectId=` (RN-03.78)' }) currencies?: AllowedCurrenciesDto;
}
