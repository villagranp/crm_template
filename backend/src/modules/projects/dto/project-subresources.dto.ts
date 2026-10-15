import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { ATTACHMENT_DESCRIPTION_MAX_LENGTH } from '@/modules/attachments/attachment-policy';
import { ATTACHMENT_SORT_FIELDS, type AttachmentSortField } from '@/modules/attachments/ports/attachments.repository.port';
import { CatalogValueDto, UserRefDto } from '@/modules/customers/dto/customer.dto';
import { isPresent, trim, trimToNull } from '@/common/dto/dto-transforms';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ProductFamilyRefDto, UnitRefDto } from '@/modules/products/dto/product.dto';

import { PROJECT_HISTORY_KINDS } from '../ports/projects.repository.port';

import { IsCalendarDateString, PROGRESS_PATTERN, QUANTITY_PATTERN } from './dto-helpers';

const TONNAGE_MODES = ['RULE', 'MANUAL', 'NONE'] as const;
const CONVERSION_SCOPES = ['GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE'] as const;
const QUANTITY_NOTE = 'Cadena decimal (hasta 15 enteros y 4 decimales). Negativa → `422 INVALID_QUANTITY`';

// ---------------------------------------------------------------------------
// Fase del cliente (F-16)
// ---------------------------------------------------------------------------

export class CreatePhaseChangeDto {
  @ApiProperty({ format: 'uuid', description: 'Elemento activo de `crm.fase_cliente` (o la fase actual aunque esté desactivada)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  phaseId!: string;

  @ApiPropertyOptional({
    example: '30.00',
    description:
      'Cadena decimal 0–100 con hasta 2 decimales (`422 INVALID_PROGRESS`). Omitido al cambiar de fase: `metadata.defaultProgress` de la destino o el actual (RN-03.34)',
  })
  @IsOptional()
  @IsString()
  @Matches(PROGRESS_PATTERN)
  progress?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}

export class PhaseHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: CatalogValueDto, nullable: true, description: '`null` en la fila del alta' }) fromPhase!: CatalogValueDto | null;
  @ApiProperty({ type: CatalogValueDto }) toPhase!: CatalogValueDto;
  @ApiProperty({ nullable: true, type: String, example: '10.00' }) fromProgress!: string | null;
  @ApiProperty({ example: '30.00' }) toProgress!: string;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ type: UserRefDto }) changedBy!: UserRefDto;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}

export class PaginatedPhaseHistoryDto {
  @ApiProperty({ type: [PhaseHistoryItemDto] }) data!: PhaseHistoryItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Clasificación (F-15)
// ---------------------------------------------------------------------------

/** PUT: reemplaza la clasificación; un campo omitido equivale a `null`. */
export class UpdateClassificationDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.tipo_proyecto`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  projectTypeId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.sector_proyecto`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  sectorId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Unidad activa (`/units-of-measure`); obligatoria con `RULE`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  measureUnitId?: string | null;

  @ApiPropertyOptional({ example: '1200', nullable: true, description: `${QUANTITY_NOTE}. Obligatoria con \`RULE\`` })
  @IsOptional()
  @IsString()
  @Matches(QUANTITY_PATTERN)
  estimatedQuantity?: string | null;

  @ApiProperty({ enum: TONNAGE_MODES, description: '`RULE` (regla vigente PROJECT_TYPE > GLOBAL), `MANUAL` (solo en el proyecto, DM-24) o `NONE`' })
  @IsIn(TONNAGE_MODES)
  tonnageMode!: (typeof TONNAGE_MODES)[number];

  @ApiPropertyOptional({ example: '50', nullable: true, description: `${QUANTITY_NOTE}. Solo y obligatorio con \`MANUAL\` (con otro modo → \`400\`)` })
  @IsOptional()
  @IsString()
  @Matches(QUANTITY_PATTERN)
  manualTonnage?: string | null;
}

// ---------------------------------------------------------------------------
// Productos asociados (F-19)
// ---------------------------------------------------------------------------

export class CreateProjectProductDto {
  @ApiProperty({ format: 'uuid', description: 'Producto activo del catálogo (`/products`)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Oportunidad no eliminada del mismo proyecto (`422 OPPORTUNITY_NOT_IN_PROJECT`)' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  opportunityId?: string | null;

  @ApiProperty({ example: '120', description: QUANTITY_NOTE })
  @IsString()
  @Matches(QUANTITY_PATTERN)
  quantity!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Unidad activa. Omitida: la unidad base del producto (D-03.14)' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Elemento activo de `crm.estado_producto_asociado`. Omitido: el primero activo por orden (`PROPUESTO`)' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

/** PATCH: omitido = sin cambio. El producto no cambia (se quita y se asocia otro). */
export class UpdateProjectProductDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '`null` = sin oportunidad' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  opportunityId?: string | null;

  @ApiPropertyOptional({ example: '150', description: QUANTITY_NOTE })
  @ValidateIf(isPresent)
  @IsString()
  @Matches(QUANTITY_PATTERN)
  quantity?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class ProjectProductProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ description: 'Del maestro, al consultar (RN-03.54)' }) description!: string;
  @ApiProperty({ type: ProductFamilyRefDto }) family!: ProductFamilyRefDto;
  @ApiProperty({ description: '`false` = producto desactivado (la asociación se conserva marcada, RN-03.55)' }) isActive!: boolean;
}

export class OpportunityRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OPO-2026-00012' }) code!: string;
}

export class LineConversionDto {
  @ApiProperty({ format: 'uuid' }) ruleId!: string;
  @ApiProperty({ enum: CONVERSION_SCOPES }) scope!: string;
  @ApiProperty({ example: '0.00100000' }) factor!: string;
}

export class ProductStatusDto extends CatalogValueDto {
  @ApiProperty({ description: '`metadata.isActive`: la línea suma en los totales (RN-03.60)' }) isActive!: boolean;
}

export class ProjectProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ProjectProductProductDto }) product!: ProjectProductProductDto;
  @ApiProperty({ type: OpportunityRefDto, nullable: true }) opportunity!: OpportunityRefDto | null;
  @ApiProperty({ example: '120.0000' }) quantity!: string;
  @ApiProperty({ type: UnitRefDto }) unit!: UnitRefDto;
  @ApiProperty({ type: LineConversionDto, nullable: true, description: '`null` = "sin conversión"' }) conversion!: LineConversionDto | null;
  @ApiProperty({ example: '0.4000', nullable: true, type: String, description: 'Toneladas; `null` sin regla (no suma en el total)' }) tonnage!: string | null;
  @ApiProperty({ type: ProductStatusDto }) status!: ProductStatusDto;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
}

export class QuantityByUnitDto {
  @ApiProperty({ type: UnitRefDto }) unit!: UnitRefDto;
  @ApiProperty({ example: '480.0000' }) quantity!: string;
}

export class ProjectProductTotalsDto {
  @ApiProperty({ example: '123.4500', description: 'Suma de toneladas de las líneas con estado activo y conversión' }) tonnage!: string;
  @ApiProperty({ type: [QuantityByUnitDto], description: 'Cantidades de las líneas con estado activo, por unidad (nunca mezcladas)' })
  quantitiesByUnit!: QuantityByUnitDto[];
  @ApiProperty({ description: 'Líneas con estado activo sin conversión' }) linesWithoutConversion!: number;
}

export class ProjectProductsDto {
  @ApiProperty({ type: [ProjectProductDto] }) data!: ProjectProductDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
  @ApiProperty({ type: ProjectProductTotalsDto, description: 'Sobre todas las líneas del proyecto, no solo la página' }) totals!: ProjectProductTotalsDto;
}

// ---------------------------------------------------------------------------
// Duplicado (F-12)
// ---------------------------------------------------------------------------

export class DuplicateCopyOptionsDto {
  @ApiPropertyOptional({ default: true, description: 'País, ciudad y dirección' })
  @IsOptional()
  @IsBoolean()
  location: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  description: boolean = true;

  @ApiPropertyOptional({ default: true, description: 'Tipo, sector, unidad y cantidad; tonelaje con la regla vigente (manual se copia)' })
  @IsOptional()
  @IsBoolean()
  classification: boolean = true;

  @ApiPropertyOptional({ default: false, description: 'Asociaciones activas, sin oportunidad, con el estado inicial y tonelaje recalculado' })
  @IsOptional()
  @IsBoolean()
  products: boolean = false;
}

export class DuplicateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omitido: el del origen. Visible y activo (RN-03.2)' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Omitido: el del origen con `proyectos.administrar`; si no, el propio usuario. Otro usuario exige `administrar` (RN-03.6)',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Código manual: `proyectos.administrar` (DM-17)' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  code?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: 'Omitida: la del origen; `null` = sin fecha' })
  @IsOptional()
  @IsCalendarDateString()
  estimatedStartDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsCalendarDateString()
  estimatedEndDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional()
  @IsCalendarDateString()
  estimatedDecisionDate?: string | null;

  @ApiPropertyOptional({ type: DuplicateCopyOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DuplicateCopyOptionsDto)
  copy: DuplicateCopyOptionsDto = new DuplicateCopyOptionsDto();
}

// ---------------------------------------------------------------------------
// Historial de la ficha (F-11)
// ---------------------------------------------------------------------------

export class HistorySubjectDto {
  @ApiProperty({ enum: ['OPPORTUNITY', 'PROJECT_PRODUCT', 'FORECAST_LINE'] }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Código de la oportunidad, SKU o `SKU AAAA-MM`' }) label!: string;
}

export class HistoryChangeDto {
  @ApiProperty() field!: string;
  @ApiProperty({ nullable: true, description: 'Valor anterior (texto libre enmascarado `***`)', oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] })
  before!: string | number | boolean | null;
  @ApiProperty({ nullable: true, oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }) after!: string | number | boolean | null;
}

export class ProjectHistoryEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) actor!: UserRefDto | null;
  @ApiProperty({ enum: PROJECT_HISTORY_KINDS }) kind!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Evento de auditoría (`crm.project.updated`…); `null` en historiales funcionales' }) event!: string | null;
  @ApiProperty({ type: HistorySubjectDto, nullable: true }) subject!: HistorySubjectDto | null;
  @ApiProperty({ type: [HistoryChangeDto] }) changes!: HistoryChangeDto[];
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
}

export class PaginatedProjectHistoryDto {
  @ApiProperty({ type: [ProjectHistoryEntryDto] }) data!: ProjectHistoryEntryDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Adjuntos del proyecto (ADR-021)
// ---------------------------------------------------------------------------

export class ListProjectAttachmentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_SORT_FIELDS, description: 'Por defecto `createdAt` descendente' })
  @IsOptional()
  @IsIn(ATTACHMENT_SORT_FIELDS)
  override sortBy?: AttachmentSortField = undefined;
}

/** Campos de texto del `multipart/form-data` (además de `file`). */
export class UploadProjectAttachmentDto {
  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(ATTACHMENT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

/** Esquema OpenAPI del cuerpo de la subida (multer lo procesa). */
export class UploadProjectAttachmentBodyDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Un archivo: PDF, JPEG, PNG, DOCX o XLSX (por firma), hasta `crm.adjuntos.max_mb`' })
  file!: unknown;

  @ApiPropertyOptional({ maxLength: ATTACHMENT_DESCRIPTION_MAX_LENGTH })
  description?: string;
}
