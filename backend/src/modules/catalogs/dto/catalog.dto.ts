import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { CATALOG_SORT_FIELDS, type CatalogItemMetadata, type CatalogSortField } from '../ports/catalogs.repository.port';

/** Clave de catálogo: minúsculas, dígitos, punto, guion y guion bajo. */
export const CATALOG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
/** Código de elemento: letras, dígitos, punto, guion y guion bajo. */
export const CATALOG_ITEM_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Tamaño máximo de `metadata` serializado (bytes UTF-8). */
export const MAX_METADATA_BYTES = 4096;
/** Profundidad máxima de anidamiento de `metadata`. */
export const MAX_METADATA_DEPTH = 5;
const MAX_SORT_ORDER = 1_000_000;

function depthOf(value: unknown): number {
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  return 1 + children.reduce<number>((max, child) => Math.max(max, depthOf(child)), 0);
}

/**
 * `metadata` válido: objeto JSON plano (no array, no instancia de clase),
 * de como mucho `MAX_METADATA_BYTES` serializado y `MAX_METADATA_DEPTH` niveles.
 */
export function isCatalogMetadata(value: unknown): value is CatalogItemMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(serialized, 'utf8') <= MAX_METADATA_BYTES && depthOf(value) <= MAX_METADATA_DEPTH;
}

function IsCatalogMetadata(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCatalogMetadata',
      validator: {
        validate: (value: unknown) => isCatalogMetadata(value),
        defaultMessage: () =>
          `metadata debe ser un objeto JSON de como mucho ${MAX_METADATA_BYTES} bytes y ${MAX_METADATA_DEPTH} niveles`,
      },
    },
    options,
  );
}

function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function trimToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Campo no anulable de un PATCH: omitirlo es "sin cambio", pero `null` no se admite. */
function isPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}

const METADATA_DESCRIPTION = `Objeto JSON (no array) de como mucho ${MAX_METADATA_BYTES} bytes y ${MAX_METADATA_DEPTH} niveles; \`null\` lo quita`;

export class ListCatalogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CATALOG_SORT_FIELDS, description: 'Por defecto `name` ascendente' })
  @IsOptional()
  @IsIn(CATALOG_SORT_FIELDS)
  override sortBy?: CatalogSortField = undefined;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isSystem?: boolean;
}

export class CreateCatalogDto {
  @ApiProperty({ example: 'tipos-cliente', maxLength: 80, description: 'Única' })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  @Matches(CATALOG_KEY_PATTERN, { message: 'key solo admite minúsculas, dígitos, punto, guion y guion bajo' })
  key!: string;

  @ApiProperty({ example: 'Tipos de cliente', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 400, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(400)
  description?: string | null;
}

export class UpdateCatalogDto {
  @ApiPropertyOptional({ maxLength: 80, description: 'No se puede cambiar en catálogos de sistema' })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  @Matches(CATALOG_KEY_PATTERN, { message: 'key solo admite minúsculas, dígitos, punto, guion y guion bajo' })
  key?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 400, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(400)
  description?: string | null;
}

export class CreateCatalogItemDto {
  @ApiProperty({ example: 'MAYORISTA', maxLength: 60, description: 'Único en el catálogo e inmutable' })
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  @Matches(CATALOG_ITEM_CODE_PATTERN, { message: 'code solo admite letras, dígitos, punto, guion y guion bajo' })
  code!: string;

  @ApiProperty({ example: 'Mayorista', maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  label!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true, description: METADATA_DESCRIPTION })
  @IsOptional()
  @IsCatalogMetadata()
  metadata?: CatalogItemMetadata | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER, description: 'Por defecto, al final (máximo + 10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** `code` no se acepta: es inmutable (un campo no declarado es `400`). */
export class UpdateCatalogItemDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  label?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true, description: METADATA_DESCRIPTION })
  @IsOptional()
  @IsCatalogMetadata()
  metadata?: CatalogItemMetadata | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_SORT_ORDER })
  @ValidateIf(isPresent)
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '`false` desactiva el elemento (no se borra nunca)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() itemCount!: number;
  @ApiProperty() activeItemCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CatalogItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) catalogId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) metadata!: CatalogItemMetadata | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CatalogDetailResponseDto extends CatalogResponseDto {
  @ApiProperty({ type: [CatalogItemResponseDto], description: 'Todos los elementos, activos e inactivos, por `sortOrder`' })
  items!: CatalogItemResponseDto[];
}

export class PaginatedCatalogsResponseDto {
  @ApiProperty({ type: [CatalogResponseDto] }) data!: CatalogResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
