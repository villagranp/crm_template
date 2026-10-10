import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { ROLE_SORT_FIELDS, type RoleSortField } from '../ports/access.repository.port';

export const DATA_SCOPES = ['OWN', 'TEAM', 'TERRITORY', 'ORGANIZATION'] as const;
export type DataScopeValue = (typeof DATA_SCOPES)[number];

/** Código de rol: minúsculas, dígitos y guiones; empieza por letra. Inmutable. */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9-]{1,58}[a-z0-9]$/;

export class ListRolesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ROLE_SORT_FIELDS, description: 'Campo de orden (lista blanca); por defecto, nombre' })
  @IsOptional()
  @IsIn(ROLE_SORT_FIELDS)
  declare sortBy?: RoleSortField;

  @ApiPropertyOptional({ description: 'Sólo roles de sistema (true) o sólo propios (false)' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isSystem?: boolean;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'supervisor-ventas', pattern: ROLE_CODE_PATTERN.source, description: 'Inmutable' })
  @IsString()
  @Matches(ROLE_CODE_PATTERN, { message: 'code must be lowercase letters, digits and hyphens' })
  code!: string;

  @ApiProperty({ example: 'Supervisor de ventas' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'Supervisa el equipo comercial de su zona.' })
  @IsOptional()
  @IsString()
  @Length(1, 400)
  description?: string;

  @ApiProperty({ enum: DATA_SCOPES })
  @IsEnum(DATA_SCOPES)
  dataScope!: DataScopeValue;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  menuOptionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 400)
  description?: string | null;

  @ApiPropertyOptional({ enum: DATA_SCOPES })
  @IsOptional()
  @IsEnum(DATA_SCOPES)
  dataScope?: DataScopeValue;

  @ApiPropertyOptional({ description: 'Un rol inactivo deja de conceder acceso sin desasignarlo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Copia editable de un rol (D1). Copia permisos, opciones y alcance; no copia usuarios. */
export class DuplicateRoleDto {
  @ApiProperty({ example: 'administrador-regional', pattern: ROLE_CODE_PATTERN.source })
  @IsString()
  @Matches(ROLE_CODE_PATTERN, { message: 'code must be lowercase letters, digits and hyphens' })
  code!: string;

  @ApiProperty({ example: 'Administrador regional' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 400)
  description?: string;
}

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'administrador' })
  code!: string;

  @ApiProperty({ example: 'Administrador' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: DATA_SCOPES })
  dataScope!: DataScopeValue;

  @ApiProperty({ description: 'Rol del sistema: nombre, permisos y opciones de solo lectura (D1)' })
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: [String], example: ['usuarios.ver'] })
  permissionCodes!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  menuOptionIds!: string[];

  @ApiProperty({ example: 4 })
  userCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class PermissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'usuarios.crear' })
  code!: string;

  @ApiProperty({ example: 'usuarios' })
  resource!: string;

  @ApiProperty({ example: 'crear' })
  action!: string;

  @ApiProperty({ example: 'Crear usuarios' })
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: 'administracion' })
  moduleKey!: string | null;
}
