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
import { UserRefDto } from '@/common/dto/user-ref.dto';

import { CUSTOMER_EDITABLE_FIELDS, CUSTOMER_RESERVED_FIELDS } from '../customer-access-policy';
import { CUSTOMER_DUPLICATE_RULE_KEYS } from '../duplicate-rules';
import { CUSTOMER_SORT_FIELDS, type CustomerSortField } from '../ports/customers.repository.port';

import { isPresent, MAX_ACKNOWLEDGED_DUPLICATES, toOptionalBoolean, trimToNull } from './dto-transforms';

const FORMULA_NOTE =
  'No puede empezar (tras espacios) por `=`, `@`, tabulador o retorno de carro: `422 FORMULA_NOT_ALLOWED` (RN-02.32). Se guarda recortado.';

// ---------------------------------------------------------------------------
// Consulta (F1, F3)
// ---------------------------------------------------------------------------

export class ListCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CUSTOMER_SORT_FIELDS, description: 'Por defecto `legalName` ascendente' })
  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS)
  override sortBy?: CustomerSortField = undefined;

  @ApiPropertyOptional({ maxLength: 40, description: 'Prefijo del código de cliente normalizado' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerCode?: string;

  @ApiPropertyOptional({ maxLength: 30, description: 'Prefijo del código CRM, sin distinguir mayúsculas' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  crmCode?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Contenido en la razón social normalizada' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ maxLength: 120, description: 'Contenido en la ciudad normalizada (texto libre, DM-19)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Elemento de `crm.estado_cliente`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  salesOwnerId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Solo estados con `metadata.isActive = true` (selector de clientes)' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: '`true` = solo eliminados; exige `clientes.eliminar` (D-02.6)' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  deleted?: boolean;
}

/** `search`: contenido en el nombre o prefijo del código de colaborador. */
export class SalesOwnerOptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['displayName'], description: 'Único orden admitido: `displayName` ascendente' })
  @IsOptional()
  @IsIn(['displayName'])
  override sortBy?: 'displayName' = undefined;
}

// ---------------------------------------------------------------------------
// Entrada (F5, F6)
// ---------------------------------------------------------------------------

export class CreateCustomerDto {
  @ApiPropertyOptional({
    maxLength: 40,
    nullable: true,
    description: 'Código de cliente (DM-18): opcional, único por país (o global con `unicidad_codigo = GLOBAL`). Se normaliza a mayúsculas sin espacios ni guiones.',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(40)
  customerCode?: string | null;

  @ApiProperty({ maxLength: 200, example: 'Constructora Ejemplo S.A.', description: FORMULA_NOTE })
  @IsString()
  @Length(1, 200)
  legalName!: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true, description: FORMULA_NOTE })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string | null;

  @ApiPropertyOptional({
    maxLength: 30,
    nullable: true,
    description: 'NIT (etiqueta `country.taxIdLabel`). Se valida normalizado (sin espacios, guiones ni puntos). No es único: repetido en el país = aviso (DM-4).',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(30)
  taxId?: string | null;

  @ApiProperty({ format: 'uuid', description: 'País activo (`form-options.countries`)' })
  @Transform(toLowerCaseUuid)
  @IsUUID()
  countryId!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, description: `Texto libre (DM-19). ${FORMULA_NOTE}` })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true, description: FORMULA_NOTE })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, description: 'Patrón del país, o 7–20 dígitos con `+ - ( )` y espacios (RN-02.6)' })
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

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.tipo_empresa`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  companyTypeId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Elemento activo de `crm.estado_cliente`. Omitido: `crm.valores_por_defecto["customer.statusId"]`',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.calificacion_cliente`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  ratingId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Responsable elegible (D-02.2). Omitido: el actor. Otro usuario exige `clientes.administrar` (`403 FIELD_NOT_EDITABLE`).',
  })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  salesOwnerId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_ACKNOWLEDGED_DUPLICATES,
    description:
      'Confirmación de un `409 POSSIBLE_DUPLICATE`: su presencia (aunque sea `[]`) confirma; debe incluir el `id` de todos los candidatos visibles (los no visibles, `id = null`, quedan confirmados por la presencia).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACKNOWLEDGED_DUPLICATES)
  @Transform(toLowerCaseUuid)
  @IsUUID('all', { each: true })
  acknowledgedDuplicateIds?: string[];
}

/** Campo omitido = sin cambio; `null` = quitar un opcional. `crmCode` no existe (`400`). */
export class UpdateCustomerDto {
  @ApiPropertyOptional({ maxLength: 40, nullable: true, description: 'Exige `clientes.administrar` si cambia (DM-18)' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(40)
  customerCode?: string | null;

  @ApiPropertyOptional({ maxLength: 200, description: FORMULA_NOTE })
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 200)
  legalName?: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true, description: FORMULA_NOTE })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string | null;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(30)
  taxId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Exige `clientes.administrar` si cambia (D-02.5); revalida formatos, código y avisos con el país nuevo' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, description: FORMULA_NOTE })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true, description: FORMULA_NOTE })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  companyTypeId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Desactivar = un estado con `metadata.isActive = false` (RN-02.21). Un valor ya desactivado se conserva si no cambia.',
  })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  ratingId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reasignar exige `clientes.administrar` (DM-34)' })
  @ValidateIf(isPresent)
  @Transform(toLowerCaseUuid)
  @IsUUID()
  salesOwnerId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: MAX_ACKNOWLEDGED_DUPLICATES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACKNOWLEDGED_DUPLICATES)
  @Transform(toLowerCaseUuid)
  @IsUUID('all', { each: true })
  acknowledgedDuplicateIds?: string[];
}

// ---------------------------------------------------------------------------
// Respuesta (F.3)
// ---------------------------------------------------------------------------

// Definida en `common` (la usan varios módulos); se reexporta por compatibilidad.
export { UserRefDto };

export class SalesOwnerRefDto extends UserRefDto {
  @ApiProperty({ description: 'Usuario ACTIVE y no eliminado' }) isActive!: boolean;
}

export class CountryRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'GT' }) isoCode!: string;
  @ApiProperty({ example: 'Guatemala' }) name!: string;
}

export class CustomerCountryDto extends CountryRefDto {
  @ApiProperty({ example: 'NIT', description: 'Cómo se llama el identificador fiscal en el país' }) taxIdLabel!: string;
}

export class CatalogValueDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
}

export class CatalogValueWithStateDto extends CatalogValueDto {
  @ApiProperty({ description: 'El elemento del catálogo sigue activo (un valor desactivado se conserva en el cliente)' })
  isActive!: boolean;
}

export class CustomerStatusDto extends CatalogValueDto {
  @ApiProperty({ description: 'Semántica `metadata.isActive` del estado: `false` = cliente desactivado (RN-02.21)' })
  isActive!: boolean;
}

export class CustomerListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CLI-000123' }) crmCode!: string;
  @ApiProperty({ nullable: true, type: String }) customerCode!: string | null;
  @ApiProperty() legalName!: string;
  @ApiProperty({ nullable: true, type: String }) tradeName!: string | null;
  @ApiProperty({ type: CountryRefDto }) country!: CountryRefDto;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ type: CustomerStatusDto }) status!: CustomerStatusDto;
  @ApiProperty({ type: CatalogValueDto, nullable: true }) rating!: CatalogValueDto | null;
  @ApiProperty({ type: UserRefDto }) salesOwner!: UserRefDto;
  @ApiProperty({ enum: ['DIRECT', 'INHERITED'], description: '`INHERITED`: visible solo por un proyecto (solo lectura, DM-13)' })
  access!: 'DIRECT' | 'INHERITED';
  @ApiProperty() isDeleted!: boolean;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaginatedCustomersResponseDto {
  @ApiProperty({ type: [CustomerListItemDto] }) data!: CustomerListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class PrimaryContactRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

export class SourceImportRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'IMP-2026-0007' }) code!: string;
}

export class CustomerCapabilitiesDto {
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canDelete!: boolean;
  @ApiProperty() canRestore!: boolean;
  @ApiProperty() canManageAttachments!: boolean;
  @ApiProperty({ description: 'Puede crear o editar contactos y elegir el principal (D-02.7)' }) canManageContacts!: boolean;
  @ApiProperty() canReassignOwner!: boolean;
  @ApiProperty({ enum: [...CUSTOMER_EDITABLE_FIELDS, ...CUSTOMER_RESERVED_FIELDS], isArray: true }) editableFields!: string[];
}

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CLI-000123' }) crmCode!: string;
  @ApiProperty({ nullable: true, type: String }) customerCode!: string | null;
  @ApiProperty() legalName!: string;
  @ApiProperty({ nullable: true, type: String }) tradeName!: string | null;
  @ApiProperty({ nullable: true, type: String }) taxId!: string | null;
  @ApiProperty({ type: CustomerCountryDto }) country!: CustomerCountryDto;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ type: CatalogValueWithStateDto, nullable: true }) companyType!: CatalogValueWithStateDto | null;
  @ApiProperty({ type: CustomerStatusDto }) status!: CustomerStatusDto;
  @ApiProperty({ type: CatalogValueWithStateDto, nullable: true }) rating!: CatalogValueWithStateDto | null;
  @ApiProperty({ type: SalesOwnerRefDto }) salesOwner!: SalesOwnerRefDto;
  @ApiProperty({ type: PrimaryContactRefDto, nullable: true, description: 'Solo con `contactos.ver` (H.5); sin él, siempre `null`' })
  primaryContact!: PrimaryContactRefDto | null;
  @ApiProperty({ type: SourceImportRefDto, nullable: true }) sourceImport!: SourceImportRefDto | null;
  @ApiProperty({ enum: ['DIRECT', 'INHERITED'] }) access!: 'DIRECT' | 'INHERITED';
  @ApiProperty() isDeleted!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) createdBy!: UserRefDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: UserRefDto, nullable: true }) updatedBy!: UserRefDto | null;
  @ApiProperty({ type: CustomerCapabilitiesDto }) capabilities!: CustomerCapabilitiesDto;
}

export class CountryOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() isoCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String, example: '+502' }) phonePrefix!: string | null;
  @ApiProperty({ example: 'NIT' }) taxIdLabel!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Expresión regular sobre el NIT normalizado' }) taxIdPattern!: string | null;
  @ApiProperty({ nullable: true, type: String }) phonePattern!: string | null;
}

export class CatalogOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty() sortOrder!: number;
}

export class StatusOptionDto extends CatalogOptionDto {
  @ApiProperty({ description: 'Semántica `metadata.isActive` del estado' }) isActive!: boolean;
}

export class CustomerDefaultsDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) statusId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) companyTypeId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) ratingId!: string | null;
}

export class AttachmentOptionsDto {
  @ApiProperty({ description: 'Almacenamiento de ADR-021 disponible' }) enabled!: boolean;
  @ApiProperty({ example: 10 }) maxMb!: number;
  @ApiProperty({ type: [String], example: ['application/pdf', 'image/png'] }) allowedTypes!: string[];
}

export class CustomerFormOptionsDto {
  @ApiProperty({ type: [CountryOptionDto], description: 'Países activos' }) countries!: CountryOptionDto[];
  @ApiProperty({ type: [CatalogOptionDto], description: 'Activos de `crm.tipo_empresa`' }) companyTypes!: CatalogOptionDto[];
  @ApiProperty({ type: [StatusOptionDto], description: 'Activos de `crm.estado_cliente`' }) statuses!: StatusOptionDto[];
  @ApiProperty({ type: [CatalogOptionDto], description: 'Activos de `crm.calificacion_cliente`' }) ratings!: CatalogOptionDto[];
  @ApiProperty({ type: CustomerDefaultsDto, description: 'De `crm.valores_por_defecto`' }) defaults!: CustomerDefaultsDto;
  @ApiProperty({ type: [String], description: 'Base + `crm.campos_obligatorios.customer` (nombres de campo del DTO)' })
  requiredFields!: string[];
  @ApiProperty({ type: AttachmentOptionsDto }) attachments!: AttachmentOptionsDto;
}

export class SalesOwnerCountryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class SalesOwnerOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) employeeCode!: string | null;
  @ApiProperty({ type: SalesOwnerCountryDto, nullable: true }) country!: SalesOwnerCountryDto | null;
}

export class PaginatedSalesOwnerOptionsDto {
  @ApiProperty({ type: [SalesOwnerOptionDto] }) data!: SalesOwnerOptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// --- Documentación de los `details` de error (no se usan como entrada) ---

export class DuplicateCandidateDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`null` si no es visible para el actor (RN-02.15)' })
  id!: string | null;
  @ApiProperty() crmCode!: string;
  @ApiProperty({ nullable: true, type: String }) customerCode!: string | null;
  @ApiProperty() legalName!: string;
  @ApiProperty({ example: { isoCode: 'GT', name: 'Guatemala' } }) country!: { isoCode: string; name: string };
  @ApiProperty() salesOwnerName!: string;
  @ApiProperty() isVisible!: boolean;
  @ApiProperty() isDeleted!: boolean;
}

export class PossibleDuplicateDetailDto {
  @ApiProperty({ enum: CUSTOMER_DUPLICATE_RULE_KEYS }) rule!: string;
  @ApiProperty({ enum: ['LEGAL_NAME', 'TRADE_NAME', 'EMAIL', 'PHONE', 'TAX_ID'] }) reason!: string;
  @ApiProperty({ type: DuplicateCandidateDto }) candidate!: DuplicateCandidateDto;
}

