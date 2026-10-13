import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { toOptionalBoolean } from '@/modules/customers/dto/dto-transforms';

const UNIT_DIMENSIONS = ['MASS', 'LENGTH', 'AREA', 'VOLUME', 'COUNT', 'OTHER'] as const;
const CONVERSION_SCOPES = ['GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE'] as const;
export const PRODUCT_SORT_FIELDS = ['sku'] as const;

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, description: 'Siempre por `sku` ascendente' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  override sortBy?: (typeof PRODUCT_SORT_FIELDS)[number] = undefined;

  @ApiPropertyOptional({ format: 'uuid', description: 'Familia del producto' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  familyId?: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: '`true` (defecto) solo activos; `false` solo inactivos' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;
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

export class ProductFamiliesDto {
  @ApiProperty({ type: [ProductFamilyDto] }) data!: ProductFamilyDto[];
}

export class UnitsOfMeasureDto {
  @ApiProperty({ type: [UnitOfMeasureDto] }) data!: UnitOfMeasureDto[];
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
