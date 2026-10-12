import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { CatalogValueDto, CountryRefDto, UserRefDto } from '@/modules/customers/dto/customer.dto';
import { isPresent, trim } from '@/modules/customers/dto/dto-transforms';
import { UnitRefDto } from '@/modules/products/dto/product.dto';

import { IsCalendarDateString } from './dto-helpers';

const COMMERCIAL_STATUS_KINDS = ['OPEN_STAGE', 'WON', 'LOST', 'NO_OPPORTUNITIES'] as const;
const TONNAGE_MODES = ['RULE', 'MANUAL', 'NONE'] as const;
const CONVERSION_SCOPES = ['GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE'] as const;
const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD` (DM-31)';

// ---------------------------------------------------------------------------
// Entrada (F-10, F-11)
// ---------------------------------------------------------------------------

export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'Cliente visible, no eliminado y con estado activo (`CustomerReferenceGuard`, RN-03.2)' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'País activo. Omitido: el del cliente (RN-03.5)' })
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, description: 'Ciudad o ubicación (texto libre, DM-19)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  estimatedStartDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: `${DATE_NOTE}. ≥ inicio (RN-03.4, \`422 INVALID_DATE_RANGE\`)` })
  @IsOptional()
  @IsCalendarDateString()
  estimatedEndDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: `${DATE_NOTE}. Sin restricción respecto a inicio/fin (DM-16)` })
  @IsOptional()
  @IsCalendarDateString()
  estimatedDecisionDate?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Asesor. Omitido: el actor. Otro usuario exige `proyectos.administrar` (`403 FIELD_NOT_EDITABLE`) y ser ACTIVE, con `proyectos.ver` y de su alcance (`422 INVALID_OWNER`)',
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Código manual (se guarda en mayúsculas). Exige `proyectos.administrar` (DM-17). Omitido: `PRY-AAAA-nnnnn`' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  code?: string;
}

/** PATCH: omitido = sin cambio; `null` = borrar un opcional. `ownerId` y `code` exigen `proyectos.administrar` si cambian. */
export class UpdateProjectDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo sin visitas ni actividades vinculadas (`409 PROJECT_CUSTOMER_LOCKED`, RN-03.10); cliente activo' })
  @ValidateIf(isPresent)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'País activo' })
  @ValidateIf(isPresent)
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  estimatedStartDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  estimatedEndDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  estimatedDecisionDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reasignar asesor: `proyectos.administrar` con el proyecto en su alcance' })
  @ValidateIf(isPresent)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Cambiar el código: `proyectos.administrar` (DM-17)' })
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 30)
  code?: string;
}

// ---------------------------------------------------------------------------
// Respuesta
// ---------------------------------------------------------------------------

export class CustomerRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() legalName!: string;
}

export class ProjectCapabilitiesDto {
  @ApiProperty({ description: '`proyectos.editar` y (propio, o ajeno en el alcance de `proyectos.administrar`)' }) canEdit!: boolean;
  @ApiProperty({ description: 'Además puede reasignar asesor y cambiar el código' }) canAdminister!: boolean;
  @ApiProperty({ description: '`proyectos.eliminar` en su alcance y (propio, o `administrar`). Los bloqueos (`409`) se deciden al eliminar' })
  canDelete!: boolean;
  @ApiProperty({ description: '`proyectos.crear`' }) canDuplicate!: boolean;
  @ApiProperty({ description: '`oportunidades.crear` y (propio, o `oportunidades.administrar` en su alcance)' }) canCreateOpportunity!: boolean;
  @ApiProperty({ description: '`forecast.editar` y (propio, o `forecast.administrar` en su alcance)' }) canEditForecast!: boolean;
}

export class CommercialStatusDto {
  @ApiProperty({ enum: COMMERCIAL_STATUS_KINDS, description: 'DEF-B (RN-03.14)' }) kind!: string;
  @ApiProperty({ example: 'Cotizando', description: 'Etiqueta de la etapa en `OPEN_STAGE`; `Ganado`, `Perdido` o `Sin oportunidades`' }) label!: string;
  @ApiProperty({ type: CatalogValueDto, nullable: true, description: 'Solo en `OPEN_STAGE`' }) stage!: CatalogValueDto | null;
}

export class ProjectListPhaseDto extends CatalogValueDto {
  @ApiProperty({ example: '75.00', description: 'Porcentaje de avance (cadena decimal, 2 decimales)' }) progress!: string;
}

export class ProjectListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: CustomerRefDto }) customer!: CustomerRefDto;
  @ApiProperty({ type: CountryRefDto }) country!: CountryRefDto;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ type: UserRefDto }) owner!: UserRefDto;
  @ApiProperty({ type: CatalogValueDto, nullable: true }) projectType!: CatalogValueDto | null;
  @ApiProperty({ type: ProjectListPhaseDto }) phase!: ProjectListPhaseDto;
  @ApiProperty({ type: CommercialStatusDto }) commercialStatus!: CommercialStatusDto;
  @ApiProperty({ description: 'Oportunidades no eliminadas' }) opportunityCount!: number;
  @ApiProperty({ format: 'date', nullable: true, type: String }) estimatedDecisionDate!: string | null;
  @ApiProperty({ format: 'date-time', description: 'Última actualización (DEF-C, RN-03.9)' }) lastActivityAt!: string;
  @ApiProperty({ type: ProjectCapabilitiesDto }) capabilities!: ProjectCapabilitiesDto;
}

export class PaginatedProjectsDto {
  @ApiProperty({ type: [ProjectListItemDto] }) data!: ProjectListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class TeamRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class TeamProjectItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: CustomerRefDto }) customer!: CustomerRefDto;
  @ApiProperty({ type: UserRefDto }) owner!: UserRefDto;
  @ApiProperty({ type: TeamRefDto, nullable: true, description: 'Equipo principal del responsable (00 §4.2)' }) team!: TeamRefDto | null;
  @ApiProperty({ type: ProjectListPhaseDto }) phase!: ProjectListPhaseDto;
  @ApiProperty({ type: CommercialStatusDto }) commercialStatus!: CommercialStatusDto;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ type: ProjectCapabilitiesDto, description: '`canEdit = false` = "Solo lectura" (AC-03.28)' }) capabilities!: ProjectCapabilitiesDto;
}

export class PaginatedTeamProjectsDto {
  @ApiProperty({ type: [TeamProjectItemDto] }) data!: TeamProjectItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class MeasureUnitDto extends UnitRefDto {}

export class ConversionToUnitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'TON' }) code!: string;
}

export class ProjectConversionDto {
  @ApiProperty({ format: 'uuid' }) ruleId!: string;
  @ApiProperty({ enum: CONVERSION_SCOPES }) scope!: string;
  @ApiProperty({ example: '0.03500000', description: 'Foto del factor (8 decimales, RN-03.29)' }) factor!: string;
  @ApiProperty({ type: ConversionToUnitDto }) toUnit!: ConversionToUnitDto;
}

export class CatalogValueWithStateRefDto extends CatalogValueDto {
  @ApiProperty({ description: 'El elemento sigue activo (un valor desactivado se conserva en el registro)' }) isActive!: boolean;
}

export class ProjectClassificationDto {
  @ApiProperty({ type: CatalogValueWithStateRefDto, nullable: true }) projectType!: CatalogValueWithStateRefDto | null;
  @ApiProperty({ type: CatalogValueWithStateRefDto, nullable: true }) sector!: CatalogValueWithStateRefDto | null;
  @ApiProperty({ type: MeasureUnitDto, nullable: true }) measureUnit!: MeasureUnitDto | null;
  @ApiProperty({ example: '1200.0000', nullable: true, type: String }) estimatedQuantity!: string | null;
  @ApiProperty({ enum: TONNAGE_MODES, description: 'Derivado: `RULE` con regla, `MANUAL` con tonelaje sin regla, `NONE` sin tonelaje' }) tonnageMode!: string;
  @ApiProperty({ type: ProjectConversionDto, nullable: true }) conversion!: ProjectConversionDto | null;
  @ApiProperty({ example: '42.0000', nullable: true, type: String }) estimatedTonnage!: string | null;
}

export class PhaseRefDto extends CatalogValueDto {
  @ApiProperty({ description: '`metadata.order`' }) order!: number;
  @ApiProperty({ description: 'Fase final (RN-03.15)' }) isFinal!: boolean;
}

export class ProjectPhaseDto {
  @ApiProperty({ type: PhaseRefDto }) phase!: PhaseRefDto;
  @ApiProperty({ example: '30.00' }) progress!: string;
  @ApiProperty({ format: 'date-time', description: '`phaseUpdatedAt`' }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
}

export class ProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class ProjectSummaryDto {
  @ApiProperty() openOpportunities!: number;
  @ApiProperty({ description: 'Resultado `WON`' }) wonOpportunities!: number;
  @ApiProperty({ description: 'Resultado `PARTIAL` (cuenta como ganada, DM-15)' }) partialOpportunities!: number;
  @ApiProperty() lostOpportunities!: number;
  @ApiProperty({ description: 'Asociaciones de producto no eliminadas' }) productLines!: number;
  @ApiProperty() attachments!: number;
}

/** 03 F.1: `ProjectListItemDto` + detalle. `phase` aquí es `ProjectPhaseDto`. */
export class ProjectDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: CustomerRefDto }) customer!: CustomerRefDto;
  @ApiProperty({ type: CountryRefDto }) country!: CountryRefDto;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ type: UserRefDto }) owner!: UserRefDto;
  @ApiProperty({ type: CatalogValueDto, nullable: true }) projectType!: CatalogValueDto | null;
  @ApiProperty({ type: ProjectPhaseDto }) phase!: ProjectPhaseDto;
  @ApiProperty({ type: CommercialStatusDto }) commercialStatus!: CommercialStatusDto;
  @ApiProperty() opportunityCount!: number;
  @ApiProperty({ format: 'date', nullable: true, type: String }) estimatedDecisionDate!: string | null;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ type: ProjectCapabilitiesDto }) capabilities!: ProjectCapabilitiesDto;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) estimatedStartDate!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) estimatedEndDate!: string | null;
  @ApiProperty({ type: ProjectClassificationDto }) classification!: ProjectClassificationDto;
  @ApiProperty({ type: ProjectRefDto, nullable: true, description: 'Origen si es duplicado; `null` si no lo es o el origen no es visible' })
  duplicatedFrom!: ProjectRefDto | null;
  @ApiProperty({ type: ProjectSummaryDto }) summary!: ProjectSummaryDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) createdBy!: UserRefDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
}
