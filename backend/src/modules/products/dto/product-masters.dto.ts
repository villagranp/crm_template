import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { MAX_PAGE_SIZE } from '@/common/dto/pagination-query.dto';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { isPresent, trim, trimToNull } from '@/common/dto/dto-transforms';

import { FAMILY_CODE_PATTERN, SKU_PATTERN, UNIT_CODE_PATTERN } from '../master-data-rules';
import { FAMILY_SORT_FIELDS, RULE_SORT_FIELDS, UNIT_SORT_FIELDS } from '../ports/product-masters.repository.port';
import {
  CONVERSION_SCOPES,
  MasterListQueryDto,
  ProductDto,
  ProductFamilyDto,
  ProductFamilyRefDto,
  UNIT_DIMENSIONS,
  UnitOfMeasureDto,
  UnitRefDto,
} from './product.dto';

const MAX_SORT_ORDER = 100_000;
/** Factor > 0 como cadena decimal: hasta 11 enteros y 8 decimales y al menos un dígito distinto de cero. */
const POSITIVE_FACTOR_PATTERN = /^(?=.*[1-9])\d{1,11}(\.\d{1,8})?$/;
const FACTOR_NOTE =
  'Cadena decimal > 0 con hasta 8 decimales (`Decimal(19, 8)`): cantidad destino = cantidad origen × factor. Un número JSON, `0` o un negativo es `400`';

function toUpperCaseCode({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export class ProductFamiliesQueryDto extends MasterListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: MAX_PAGE_SIZE, description: 'Por defecto 100: catálogo pequeño que los formularios leen entero' })
  override pageSize: number = MAX_PAGE_SIZE;

  @ApiPropertyOptional({ enum: FAMILY_SORT_FIELDS, description: 'Sin `sortBy`: `sortOrder` y nombre' })
  @IsOptional()
  @IsIn(FAMILY_SORT_FIELDS)
  override sortBy?: (typeof FAMILY_SORT_FIELDS)[number] = undefined;
}

export class UnitsOfMeasureQueryDto extends MasterListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: MAX_PAGE_SIZE, description: 'Por defecto 100: catálogo pequeño que los formularios leen entero' })
  override pageSize: number = MAX_PAGE_SIZE;

  @ApiPropertyOptional({ enum: UNIT_SORT_FIELDS, description: 'Sin `sortBy`: `sortOrder` y código' })
  @IsOptional()
  @IsIn(UNIT_SORT_FIELDS)
  override sortBy?: (typeof UNIT_SORT_FIELDS)[number] = undefined;
}

export class UnitConversionRulesQueryDto extends MasterListQueryDto {
  @ApiPropertyOptional({ enum: RULE_SORT_FIELDS, description: 'Sin `sortBy`: código de la unidad de origen, ámbito y alta' })
  @IsOptional()
  @IsIn(RULE_SORT_FIELDS)
  override sortBy?: (typeof RULE_SORT_FIELDS)[number] = undefined;

  @ApiPropertyOptional({ enum: CONVERSION_SCOPES })
  @IsOptional()
  @IsIn(CONVERSION_SCOPES)
  scope?: (typeof CONVERSION_SCOPES)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Unidad de origen' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  fromUnitId?: string;
}

// ---------------------------------------------------------------------------
// Familias
// ---------------------------------------------------------------------------

export class CreateProductFamilyDto {
  @ApiProperty({ example: 'ACERO-LARGO', description: 'Único; se guarda en mayúsculas (letras, dígitos, `-`, `_`; 1–40). Inmutable' })
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(FAMILY_CODE_PATTERN, { message: 'code must be 1-40 letters, digits, "-" or "_"' })
  code!: string;

  @ApiProperty({ example: 'Aceros largos', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 400 })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(400)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}

export class UpdateProductFamilyDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 400, description: '`null` o vacía la borra' })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(400)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER })
  @ValidateIf(isPresent)
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '`false` desactiva (sin borrado)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class ProductFamilyDetailDto extends ProductFamilyDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedProductFamiliesDto {
  @ApiProperty({ type: [ProductFamilyDetailDto] }) data!: ProductFamilyDetailDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export class CreateUnitOfMeasureDto {
  @ApiProperty({ example: 'KG', description: 'Único; se guarda en mayúsculas (letras, dígitos, `_`; 1–20). Inmutable (RN-07.37)' })
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(UNIT_CODE_PATTERN, { message: 'code must be 1-20 letters, digits or "_"' })
  code!: string;

  @ApiProperty({ example: 'Kilogramo', maxLength: 80 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'kg', maxLength: 12 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  symbol!: string;

  @ApiProperty({ enum: UNIT_DIMENSIONS })
  @IsIn(UNIT_DIMENSIONS)
  dimension!: (typeof UNIT_DIMENSIONS)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}

export class UpdateUnitOfMeasureDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ maxLength: 12 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  symbol?: string;

  @ApiPropertyOptional({ enum: UNIT_DIMENSIONS, description: 'Bloqueada si la unidad ya está referenciada: `409 UNIT_DIMENSION_LOCKED`' })
  @ValidateIf(isPresent)
  @IsIn(UNIT_DIMENSIONS)
  dimension?: (typeof UNIT_DIMENSIONS)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER })
  @ValidateIf(isPresent)
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '`false` desactiva; la unidad de tonelaje no se desactiva (`409 CONVERSION_RULE_PROTECTED`)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class UnitOfMeasureDetailDto extends UnitOfMeasureDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedUnitsOfMeasureDto {
  @ApiProperty({ type: [UnitOfMeasureDetailDto] }) data!: UnitOfMeasureDetailDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export class CreateProductDto {
  @ApiProperty({ example: 'VAR-3', description: 'Código de material; único, se guarda recortado y en mayúsculas (1–60)' })
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(SKU_PATTERN, { message: 'sku must be 1-60 letters, digits, spaces or ". _ - /"' })
  sku!: string;

  @ApiProperty({ example: 'Varilla corrugada 3/8', maxLength: 300 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description!: string;

  @ApiProperty({ format: 'uuid', description: 'Familia activa' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  familyId!: string;

  @ApiProperty({ format: 'uuid', description: 'Unidad base activa' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  baseUnitId!: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Único (`409 RESOURCE_CONFLICT`, `field = sku`)' })
  @ValidateIf(isPresent)
  @Transform(toUpperCaseCode)
  @IsString()
  @Matches(SKU_PATTERN, { message: 'sku must be 1-60 letters, digits, spaces or ". _ - /"' })
  sku?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Al cambiarla, debe existir y estar activa' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  familyId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Al cambiarla, debe existir y estar activa' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  baseUnitId?: string;

  @ApiPropertyOptional({ description: '`false` desactiva (sin borrado)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class ProductDetailDto extends ProductDto {
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

// ---------------------------------------------------------------------------
// Reglas de conversión
// ---------------------------------------------------------------------------

export class CreateUnitConversionRuleDto {
  @ApiProperty({ format: 'uuid', description: 'Unidad de origen activa' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  fromUnitId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Opcional: siempre la unidad de tonelaje configurada (`crm.forecast.unidad_tonelaje`); otra → `422 INVALID_CONVERSION_TARGET`',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  toUnitId?: string;

  @ApiProperty({ example: '0.001', description: FACTOR_NOTE })
  @IsString()
  @Matches(POSITIVE_FACTOR_PATTERN, { message: 'factor must be a positive decimal string with up to 8 decimals' })
  factor!: string;

  @ApiPropertyOptional({ enum: CONVERSION_SCOPES, default: 'GLOBAL', description: 'Exige exactamente su referencia (`422 INVALID_CONVERSION_SCOPE`)' })
  @IsOptional()
  @IsIn(CONVERSION_SCOPES)
  scope?: (typeof CONVERSION_SCOPES)[number];

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Ámbito PRODUCT: producto activo' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Ámbito PRODUCT_FAMILY: familia activa' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  productFamilyId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Ámbito PROJECT_TYPE: elemento activo de `crm.tipo_proyecto`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  projectTypeId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 300 })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(300)
  description?: string | null;
}

/** Origen, destino y ámbito son inmutables: no se declaran (enviarlos es `400`). */
export class UpdateUnitConversionRuleDto {
  @ApiPropertyOptional({
    example: '0.00105',
    description: `${FACTOR_NOTE}. No reescribe líneas existentes (cada una copió su factor). Identidad → \`409 CONVERSION_RULE_PROTECTED\``,
  })
  @ValidateIf(isPresent)
  @IsString()
  @Matches(POSITIVE_FACTOR_PATTERN, { message: 'factor must be a positive decimal string with up to 8 decimals' })
  factor?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 300 })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ description: '`false` desactiva; la identidad de la unidad de tonelaje no se desactiva (`409 CONVERSION_RULE_PROTECTED`)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class RuleProductRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() description!: string;
}

export class RuleProjectTypeRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'INDUSTRIAL' }) code!: string;
  @ApiProperty({ example: 'Industrial' }) label!: string;
}

export class UnitConversionRuleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: UnitRefDto }) fromUnit!: UnitRefDto;
  @ApiProperty({ type: UnitRefDto }) toUnit!: UnitRefDto;
  @ApiProperty({ example: '0.00100000', description: 'Cadena decimal con 8 decimales' }) factor!: string;
  @ApiProperty({ enum: CONVERSION_SCOPES }) scope!: string;
  @ApiProperty({ type: RuleProductRefDto, nullable: true }) product!: RuleProductRefDto | null;
  @ApiProperty({ type: ProductFamilyRefDto, nullable: true }) productFamily!: ProductFamilyRefDto | null;
  @ApiProperty({ type: RuleProjectTypeRefDto, nullable: true }) projectType!: RuleProjectTypeRefDto | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Origen = destino (factor 1 fijo)' }) isIdentity!: boolean;
  @ApiProperty({ description: 'Identidad GLOBAL de la unidad de tonelaje: no se desactiva ni cambia de factor' }) isProtected!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedUnitConversionRulesDto {
  @ApiProperty({ type: [UnitConversionRuleDto] }) data!: UnitConversionRuleDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
