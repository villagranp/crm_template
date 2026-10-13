import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import {
  CONTACT_SORT_FIELDS,
  CONTACT_STATUS_FILTERS,
  type ContactSortField,
  type ContactStatusFilter,
} from '../ports/contacts.repository.port';

import { isPresent, MAX_ACKNOWLEDGED_DUPLICATES, toOptionalBoolean, trim, trimToNull } from './dto-transforms';

export class ListContactsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CONTACT_SORT_FIELDS, description: 'Por defecto `lastName` ascendente' })
  @IsOptional()
  @IsIn(CONTACT_SORT_FIELDS)
  override sortBy?: ContactSortField = undefined;

  @ApiPropertyOptional({ enum: CONTACT_STATUS_FILTERS, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(CONTACT_STATUS_FILTERS)
  status?: ContactStatusFilter;

  @ApiPropertyOptional({ type: Boolean, description: '`true` = solo eliminados; exige `contactos.eliminar` (D-02.6)' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  deleted?: boolean;
}

export class CreateContactDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, description: 'Patrón del país del cliente, o la regla genérica (RN-02.6)' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 320, nullable: true, format: 'email', description: 'Único por cliente, incluidos eliminados (RN-02.16)' })
  @IsOptional()
  @Transform(trimToNull)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  comments?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Lo marca como principal y sustituye al anterior. Inactivo + principal = `422 CONTACT_INACTIVE`' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: MAX_ACKNOWLEDGED_DUPLICATES, description: 'Confirmación de un `409 POSSIBLE_DUPLICATE` (todos los candidatos)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACKNOWLEDGED_DUPLICATES)
  @Transform(toLowerCaseUuid)
  @IsUUID('all', { each: true })
  acknowledgedDuplicateIds?: string[];
}

/** Campo omitido = sin cambio; `null` = quitar un opcional. El principal se cambia con F13/F14. */
export class UpdateContactDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 320, nullable: true, format: 'email' })
  @IsOptional()
  @Transform(trimToNull)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @ApiPropertyOptional({ description: 'Desactivar el principal deja al cliente sin principal (RN-02.26)' })
  @ValidateIf(isPresent)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  comments?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: MAX_ACKNOWLEDGED_DUPLICATES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACKNOWLEDGED_DUPLICATES)
  @Transform(toLowerCaseUuid)
  @IsUUID('all', { each: true })
  acknowledgedDuplicateIds?: string[];
}

export class SetPrimaryContactDto {
  @ApiProperty({ format: 'uuid', description: 'Contacto activo y no eliminado de este cliente' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  contactId!: string;
}

export class ContactResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) customerId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true, type: String }) jobTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Es `customers.primary_contact_id`' }) isPrimary!: boolean;
  @ApiProperty({ nullable: true, type: String }) comments!: string | null;
  @ApiProperty({ description: 'Participa en visitas o actividades: no se puede eliminar, solo desactivar' }) hasHistory!: boolean;
  @ApiProperty() isDeleted!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedContactsResponseDto {
  @ApiProperty({ type: [ContactResponseDto] }) data!: ContactResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class PrimaryContactResponseDto {
  @ApiProperty({ example: { id: '018f0000-0000-7000-8000-000000000000', fullName: 'Ana López' } })
  primaryContact!: { id: string; fullName: string };
}
