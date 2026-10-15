import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
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
import { canonicalEmployeeCode } from '@/modules/access/access-rules';

import { USER_SORT_FIELDS, type UserSortField } from '../ports/access.repository.port';

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Código de colaborador ya normalizado: letras, dígitos, `-` y `_` (RN-07.1). */
export const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9_-]+$/;
export const EMPLOYEE_CODE_MAX_LENGTH = 40;

/**
 * RN-07.1: el código se guarda recortado y en mayúsculas, así que la unicidad
 * no distingue mayúsculas ni espacios alrededor. Una cadena vacía (o sólo
 * espacios) equivale a `null`: en la edición, quitar el código.
 */
export function normalizeEmployeeCode({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = canonicalEmployeeCode(value);
  return normalized === '' ? null : normalized;
}

function hasValue(_object: object, value: unknown): boolean {
  return value !== null && value !== undefined;
}

const EMPLOYEE_CODE_DOC = {
  example: 'E-001',
  maxLength: EMPLOYEE_CODE_MAX_LENGTH,
  pattern: EMPLOYEE_CODE_PATTERN.source,
  description:
    'Código de colaborador, único en todo el sistema. Se guarda recortado y en mayúsculas (1–40: letras, dígitos, `-`, `_`). Repetido → 409 `RESOURCE_CONFLICT` con `details[].field = "employeeCode"`.',
} as const;

/**
 * Filtros de la lista de usuarios. `search` busca en nombre, correo y código
 * de colaborador. Sin `sortBy`, la lista sale por nombre ascendente.
 */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: USER_SORT_FIELDS, description: 'Campo de orden (lista blanca)' })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS)
  declare sortBy?: UserSortField;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'administrador' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  roleCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuarios de este país (07 F.1)' })
  @IsOptional()
  @IsUUID()
  countryId?: string;
}

/** Mismos filtros que la lista, sin paginación: exporta todo lo filtrado (D13). */
export class ExportUsersQueryDto extends OmitType(ListUsersQueryDto, ['page', 'pageSize'] as const) {}

export class CreateUserDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  @Length(5, 320)
  email!: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Beltrán' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Administradora del sistema' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobTitle?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiPropertyOptional({ ...EMPLOYEE_CODE_DOC, type: String, nullable: true })
  @Transform(normalizeEmployeeCode)
  @ValidateIf(hasValue)
  @IsString()
  @Length(1, EMPLOYEE_CODE_MAX_LENGTH)
  @Matches(EMPLOYEE_CODE_PATTERN, { message: 'employeeCode solo admite letras, dígitos, guion y guion bajo' })
  employeeCode?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    type: String,
    nullable: true,
    description:
      'País del usuario: existente y activo (422 `UNKNOWN_REFERENCE`). Fijarlo es asignación de acceso: sólo un administrador (403 `ADMIN_ONLY`, RN-07.5)',
  })
  @IsOptional()
  @IsUUID()
  countryId?: string | null;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Roles iniciales; al menos uno' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Equipos iniciales; el primero queda como principal. No vacío exige `equipos.editar` y ser administrador (403 `ADMIN_ONLY`, RN-07.10)',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  teamIds?: string[];
}

/**
 * Datos editables del usuario. El estado **no** se cambia aquí (PLAN-ADMIN §3):
 * sólo con `POST /users/{id}/suspend` y `/reactivate`, que aplican D3 y D4.
 * Enviar `status` responde `400` (propiedad no permitida).
 */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiPropertyOptional({
    ...EMPLOYEE_CODE_DOC,
    type: String,
    nullable: true,
    description: `${EMPLOYEE_CODE_DOC.description} \`null\` o vacío lo quita, salvo a un usuario comercial (422 \`CRM_PROFILE_INCOMPLETE\`).`,
  })
  @Transform(normalizeEmployeeCode)
  @ValidateIf(hasValue)
  @IsString()
  @Length(1, EMPLOYEE_CODE_MAX_LENGTH)
  @Matches(EMPLOYEE_CODE_PATTERN, { message: 'employeeCode solo admite letras, dígitos, guion y guion bajo' })
  employeeCode?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    type: String,
    nullable: true,
    description:
      'Cambiarlo es asignación de acceso: sólo un administrador (403 `ADMIN_ONLY`, RN-07.5); enviar el valor actual no es un cambio. Existente y activo (422 `UNKNOWN_REFERENCE`). `null` lo quita, salvo a un usuario comercial (422 `CRM_PROFILE_INCOMPLETE`).',
  })
  @IsOptional()
  @IsUUID()
  countryId?: string | null;
}

/** País del usuario en la lista y el detalle. */
export class UserCountryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'GT' })
  isoCode!: string;

  @ApiProperty({ example: 'Guatemala' })
  name!: string;
}

class UserTeamDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ventas Norte' })
  name!: string;

  @ApiProperty()
  isPrimary!: boolean;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  jobTitle!: string | null;

  @ApiProperty({ enum: USER_STATUSES })
  status!: UserStatus;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [UserTeamDto] })
  teams!: UserTeamDto[];
}

export class UserListItemDto extends UserResponseDto {
  @ApiProperty({ nullable: true, type: String, example: 'E-001' })
  employeeCode!: string | null;

  @ApiProperty({ nullable: true, type: UserCountryDto })
  country!: UserCountryDto | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

class UserRoleAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'administrador' })
  code!: string;

  @ApiProperty({ example: 'Administrador' })
  name!: string;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expiresAt!: Date | null;
}

class DirectAssignmentResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Permiso u opción de menú' })
  targetId!: string;

  @ApiProperty({ enum: ['GRANT', 'DENY'] })
  effect!: 'GRANT' | 'DENY';

  @ApiProperty()
  reason!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expiresAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

class DirectPermissionResponseDto extends DirectAssignmentResponseDto {
  @ApiProperty({ example: 'usuarios.exportar' })
  code!: string;

  @ApiProperty({ example: 'Exportar usuarios' })
  name!: string;
}

class DirectMenuOptionResponseDto extends DirectAssignmentResponseDto {
  @ApiProperty({ example: 'admin-usuarios' })
  key!: string;

  @ApiProperty({ example: 'Usuarios' })
  label!: string;
}

/** Detalle para la pantalla de administración: roles, equipos y excepciones directas. */
export class UserDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ nullable: true, type: String })
  jobTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'E-001' })
  employeeCode!: string | null;

  @ApiProperty({ nullable: true, type: UserCountryDto })
  country!: UserCountryDto | null;

  @ApiProperty({ enum: USER_STATUSES })
  status!: UserStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    type: [UserTeamDto],
    description: 'Se cambian con `PUT /users/{id}/teams` o desde Equipos (`PUT /teams/{id}/members`), sólo un administrador',
  })
  teams!: UserTeamDto[];

  @ApiProperty({ type: [UserRoleAssignmentDto] })
  roles!: UserRoleAssignmentDto[];

  @ApiProperty({ type: [DirectPermissionResponseDto] })
  directPermissions!: DirectPermissionResponseDto[];

  @ApiProperty({ type: [DirectMenuOptionResponseDto] })
  directMenuOptions!: DirectMenuOptionResponseDto[];
}

class AssignmentOriginDto {
  @ApiProperty()
  reason!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expiresAt!: Date | null;
}

/** De dónde sale un permiso: roles que lo traen, concesión y denegación directas (D5). */
export class PermissionOriginDto {
  @ApiProperty({ example: 'usuarios.ver' })
  code!: string;

  @ApiProperty({ description: 'El permiso está concedido tras aplicar DENY' })
  effective!: boolean;

  @ApiProperty({ type: [String], example: ['administrador'], description: 'Códigos de los roles que lo conceden' })
  roles!: string[];

  @ApiProperty({ type: AssignmentOriginDto, nullable: true })
  grant!: AssignmentOriginDto | null;

  @ApiProperty({ type: AssignmentOriginDto, nullable: true })
  deny!: AssignmentOriginDto | null;
}

export class UserAccessResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String], description: 'Permisos efectivos, ya con DENY aplicado' })
  permissions!: string[];

  @ApiProperty({ type: [UserTeamDto] })
  teams!: { id: string; name: string }[];

  @ApiProperty({ enum: ['OWN', 'TEAM', 'COUNTRY', 'ORGANIZATION'] })
  dataScope!: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';

  @ApiProperty({ type: [PermissionOriginDto] })
  origins!: PermissionOriginDto[];
}

/** Cuerpo opcional de suspender/reactivar: el motivo queda en la bitácora. */
export class UserStatusChangeDto {
  @ApiPropertyOptional({ example: 'Baja temporal mientras se revisa un incidente.' })
  @IsOptional()
  @IsString()
  @Length(10, 300)
  reason?: string;
}
