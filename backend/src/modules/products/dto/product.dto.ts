import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export const UNIT_DIMENSIONS = ['MASS', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'OTHER'] as const;
export const CONVERSION_SCOPES = ['GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE'] as const;
/** `description` no es ordenable (03 F.4 lo fija en `400`). */
export const PRODUCT_SORT_FIELDS = ['sku', 'createdAt', 'updatedAt'] as const;

/**
 * Filtro de estado de los maestros (07 F.7): `true` (defecto, compatible con las
 * lecturas del Módulo 3) solo activos, `false` solo inactivos, `all` todos (`null`).
 * Otro valor llega tal cual y falla `IsBoolean` (`400`).
 */
export function toActiveFilter({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'all') return null;
  return value;
}

export const ACTIVE_FILTER_DOC = {
  enum: ['true', 'false', 'all'],
  default: 'true',
  description: '`true` (defecto) solo activos; `false` solo inactivos; `all` todos',
} as const;

/**
 * Query común de las listas de maestros (07 F.7): paginación, `search`, `isActive` y
 * orden por lista blanca (cada DTO hijo declara su `sortBy`). Sin `sortBy`, orden
 * natural de la lista; con él, `sortOrder` (defecto `asc`).
 */
export class MasterListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional(ACTIVE_FILTER_DOC)
  @IsOptional()
  @Transform(toActiveFilter)
  @IsBoolean()
  isActive?: boolean | null;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override sortOrder: 'asc' | 'desc' = 'asc';
}

export class ProductsQueryDto extends MasterListQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, description: 'Sin `sortBy`: por `sku` ascendente' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  override sortBy?: (typeof PRODUCT_SORT_FIELDS)[number] = undefined;

  @ApiPropertyOptional({ format: 'uuid', description: 'Familia del producto' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  familyId?: string;
}

export class UnitRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'TON' }) code!: string;
  @ApiProperty({ example: 't' }) symbol!: string;
  @ApiProperty({ enum: UNIT_DIMENSIONS }) dimension!: string;
}

export class UnitOfMeasureDto extends UnitRefDto {
  @ApiProperty({ example: 'Tonelada' }) name!: string;
}

export class ProductFamilyRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class ProductFamilyDto extends ProductFamilyRefDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VAR-3' }) sku!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: ProductFamilyRefDto }) family!: ProductFamilyRefDto;
  @ApiProperty({ type: UnitRefDto }) baseUnit!: UnitRefDto;
  @ApiProperty() isActive!: boolean;
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductDto] }) data!: ProductDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class ResolveConversionQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Unidad de la cantidad (la del proyecto o de la línea)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  fromUnitId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Con producto: precedencia de línea PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Tipo de proyecto (`crm.tipo_proyecto`) para el ámbito PROJECT_TYPE' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  projectTypeId?: string;
}

export class ConversionUnitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() symbol!: string;
}

export class ConversionRulePreviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CONVERSION_SCOPES }) scope!: string;
  @ApiProperty({ example: '0.03500000', description: 'Factor con 8 decimales (cantidad destino = cantidad × factor)' }) factor!: string;
  @ApiProperty({ type: ConversionUnitDto }) fromUnit!: ConversionUnitDto;
  @ApiProperty({ type: ConversionUnitDto }) toUnit!: ConversionUnitDto;
}

export class ConversionPreviewDto {
  @ApiProperty({ type: ConversionRulePreviewDto, nullable: true, description: '`null` = sin regla aplicable ("sin conversión")' })
  rule!: ConversionRulePreviewDto | null;
}
