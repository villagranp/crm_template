import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const MENU_OPTION_KINDS = ['LINK', 'GROUP'] as const;
export type MenuOptionKindValue = (typeof MENU_OPTION_KINDS)[number];

/** Clave de opción: minúsculas, dígitos y guiones. Inmutable (D7). */
export const MENU_OPTION_KEY_PATTERN = /^[a-z][a-z0-9-]{1,78}[a-z0-9]$/;
/** Nombre de glifo de Material Symbols. */
const ICON_PATTERN = /^[a-z0-9_]{1,60}$/;
const MAX_SORT_ORDER = 100_000;
const MAX_REORDER_ITEMS = 500;

const isPresent = (_: unknown, value: unknown) => value !== null && value !== undefined;

export class CreateMenuOptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  moduleId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Opción GROUP del mismo módulo' })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsUUID()
  parentId?: string | null;

  @ApiProperty({ example: 'ventas-cotizaciones', pattern: MENU_OPTION_KEY_PATTERN.source })
  @IsString()
  @Matches(MENU_OPTION_KEY_PATTERN, { message: 'key must be lowercase letters, digits and hyphens' })
  key!: string;

  @ApiProperty({ example: 'Cotizaciones' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 400)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'request_quote' })
  @IsOptional()
  @ValidateIf(isPresent)
  @Matches(ICON_PATTERN)
  icon?: string | null;

  @ApiProperty({ enum: MENU_OPTION_KINDS })
  @IsEnum(MENU_OPTION_KINDS)
  kind!: MenuOptionKindValue;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '/administracion/usuarios',
    description: 'Obligatoria en LINK y debe estar registrada (GET /menu-options/routes); prohibida en GROUP',
  })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 200)
  path?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Permiso que exige la opción' })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsUUID()
  requiredPermissionId?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Visible sin asignación explícita' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** `key` y `moduleId` no son editables: enviarlos responde 400. */
export class UpdateMenuOptionDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 400)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf(isPresent)
  @Matches(ICON_PATTERN)
  icon?: string | null;

  @ApiPropertyOptional({ enum: MENU_OPTION_KINDS })
  @IsOptional()
  @IsEnum(MENU_OPTION_KINDS)
  kind?: MenuOptionKindValue;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 200)
  path?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf(isPresent)
  @IsUUID()
  requiredPermissionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MenuOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @ValidateIf(isPresent)
  @IsUUID()
  parentId!: string | null;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder!: number;
}

export class ReorderMenuOptionsDto {
  @ApiProperty({ type: [MenuOrderItemDto], description: 'Opciones a mover; las no incluidas no cambian' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MenuOrderItemDto)
  items!: MenuOrderItemDto[];
}

class MenuOptionModuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'administracion' })
  key!: string;

  @ApiProperty({ example: 'Administración' })
  name!: string;
}

/** Opción tal como la ve la pantalla de administración (incluye las inactivas). */
export class MenuOptionAdminResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId!: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String })
  icon!: string | null;

  @ApiProperty({ enum: MENU_OPTION_KINDS })
  kind!: MenuOptionKindValue;

  @ApiProperty({ nullable: true, type: String })
  path!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  requiredPermissionId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  requiredPermissionCode!: string | null;

  @ApiProperty()
  isPublic!: boolean;

  @ApiProperty({ description: 'Opción sembrada: no se elimina ni cambia de ruta (D7)' })
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: MenuOptionModuleDto })
  module!: MenuOptionModuleDto;
}

export class ModuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'administracion' })
  key!: string;

  @ApiProperty({ example: 'Administración' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  icon!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;
}

export class RegisteredRouteDto {
  @ApiProperty({ example: '/administracion/usuarios' })
  path!: string;

  @ApiProperty({ example: 'Usuarios' })
  label!: string;
}
