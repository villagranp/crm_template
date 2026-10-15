import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { TEAM_SORT_FIELDS, type TeamSortField } from '../ports/teams.repository.port';

/** Letras, dígitos, punto, guion y guion bajo; empieza por letra o dígito. */
export const TEAM_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Tope de miembros por petición: un PUT reemplaza el conjunto completo. */
export const MAX_TEAM_MEMBERS = 500;

/** `'true'`/`'false'` de la query a booleano; cualquier otro valor llega tal cual y falla `IsBoolean`. */
export function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Texto opcional recortado; una cadena vacía equivale a `null` (quitar el valor). */
function trimToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Campo no anulable de un PATCH: omitirlo es "sin cambio", pero `null` no se admite. */
export function isPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListTeamsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TEAM_SORT_FIELDS, description: 'Por defecto `name` ascendente' })
  @IsOptional()
  @IsIn(TEAM_SORT_FIELDS)
  override sortBy?: TeamSortField = undefined;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo los subequipos directos de este equipo' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTeamDto {
  @ApiProperty({
    example: 'ventas-norte',
    maxLength: 40,
    description: 'Único (también frente a equipos eliminados) e inmutable tras el alta',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  @Matches(TEAM_CODE_PATTERN, { message: 'code solo admite letras, dígitos, punto, guion y guion bajo' })
  code!: string;

  @ApiProperty({ example: 'Ventas Norte', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Equipo padre; `null` = equipo raíz' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Responsable: usuario existente no eliminado' })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** `code` no se acepta: es inmutable (un campo no declarado es `400`). */
export class UpdateTeamDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '`null` lo convierte en equipo raíz' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '`null` quita el responsable' })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;
}

export class TeamMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Equipo principal del usuario. Al marcarlo, se desmarca en sus otros equipos.' })
  @IsBoolean()
  isPrimary!: boolean;
}

export class ReplaceTeamMembersDto {
  @ApiProperty({ type: [TeamMembershipDto], maxItems: MAX_TEAM_MEMBERS, description: 'Conjunto completo de miembros' })
  @IsArray()
  @ArrayMaxSize(MAX_TEAM_MEMBERS)
  @ArrayUnique((member: TeamMembershipDto) => member.userId, { message: 'members no puede repetir userId' })
  @ValidateNested({ each: true })
  @Type(() => TeamMembershipDto)
  members!: TeamMembershipDto[];
}

export class TeamManagerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class TeamResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) parentId!: string | null;
  @ApiProperty({ nullable: true, type: String }) parentName!: string | null;
  @ApiProperty({ nullable: true, type: TeamManagerDto }) manager!: TeamManagerDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() memberCount!: number;
  @ApiProperty({ description: 'Subequipos directos no eliminados' }) childCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class TeamMemberResponseDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class TeamDetailResponseDto extends TeamResponseDto {
  @ApiProperty({ type: [TeamMemberResponseDto] }) members!: TeamMemberResponseDto[];
}

export class PaginatedTeamsResponseDto {
  @ApiProperty({ type: [TeamResponseDto] }) data!: TeamResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

/** Tope de equipos por usuario en `PUT /users/{id}/teams` (07 F.2). */
export const MAX_USER_TEAMS = 50;

export class UserTeamAssignmentDto {
  @ApiProperty({ format: 'uuid', description: 'Equipo existente y no eliminado' })
  @IsUUID()
  teamId!: string;

  @ApiProperty({ description: 'Equipo principal del usuario; como mucho uno (409 si hay dos)' })
  @IsBoolean()
  isPrimary!: boolean;
}

export class ReplaceUserTeamsDto {
  @ApiProperty({
    type: [UserTeamAssignmentDto],
    maxItems: MAX_USER_TEAMS,
    description: 'Conjunto completo de equipos del usuario; vacío lo deja sin equipos',
  })
  @IsArray()
  @ArrayMaxSize(MAX_USER_TEAMS)
  @ArrayUnique((team: UserTeamAssignmentDto) => team.teamId, { message: 'teams no puede repetir teamId' })
  @ValidateNested({ each: true })
  @Type(() => UserTeamAssignmentDto)
  teams!: UserTeamAssignmentDto[];
}

export class UserTeamResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ventas Norte' }) name!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class UserTeamsResponseDto {
  @ApiProperty({ type: [UserTeamResponseDto] }) teams!: UserTeamResponseDto[];
}
