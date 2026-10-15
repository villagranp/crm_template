import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { toOptionalBoolean } from '@/common/dto/dto-transforms';
import { MAX_FILTER_VALUES, toList } from '@/modules/projects/dto/dto-helpers';

import { IMPORT_ROW_STATUSES, IMPORT_STATUSES, type ImportRowStatus, type ImportStatus } from '../import-status';
import { IMPORT_SORT_FIELDS, type ImportSortField } from '../ports/customer-imports.repository.port';

const FORMATS = ['CSV', 'XLSX'] as const;
const LIST_NOTE = 'Repetible: valores separados por comas (`a,b`) o el parámetro repetido';

export class ImportColumnDto {
  @ApiProperty({ example: 'legalName' }) key!: string;
  @ApiProperty({ example: 'Razón social' }) header!: string;
  @ApiProperty({ description: 'Debe traer valor según `crm.campos_obligatorios` y las reglas del Módulo 2' }) isRequired!: boolean;
  @ApiProperty({ type: Number, nullable: true, example: 200 }) maxLength!: number | null;
  @ApiProperty({ example: 'Nombre legal de la empresa.' }) description!: string;
}

/** 06 F.2 `CustomerImportSettingsResponseDto`. */
export class CustomerImportSettingsResponseDto {
  @ApiProperty({ description: '`crm.importaciones.habilitada` (RN-06.1)' }) enabled!: boolean;
  @ApiProperty({ example: 10, description: 'Efectivo: nunca por encima del tope duro de 10 MB (RN-06.7)' }) maxFileSizeMb!: number;
  @ApiProperty({ example: 5000, description: 'Efectivo: nunca por encima del tope duro de 10 000 (RN-06.7)' }) maxRows!: number;
  @ApiProperty({ enum: FORMATS, isArray: true }) formats!: string[];
  @ApiProperty({ example: '1' }) templateVersion!: string;
  @ApiProperty({ type: [ImportColumnDto] }) columns!: ImportColumnDto[];
}

/** 06 F.2 `CustomerImportTemplateQueryDto`. */
export class CustomerImportTemplateQueryDto {
  @ApiProperty({ enum: FORMATS })
  @IsIn(FORMATS)
  format!: (typeof FORMATS)[number];
}

/** 06 F.1 §4 `CustomerImportQueryDto`. */
export class CustomerImportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IMPORT_SORT_FIELDS, description: 'Por defecto `createdAt desc`; desempate por `id`' })
  @IsOptional()
  @IsIn(IMPORT_SORT_FIELDS)
  override sortBy?: ImportSortField = undefined;

  @ApiPropertyOptional({ type: String, example: 'VALIDATED,FAILED', description: `Estado(s) de la carga. ${LIST_NOTE}` })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(IMPORT_STATUSES.length)
  @IsIn(IMPORT_STATUSES, { each: true })
  status?: ImportStatus[];

  @ApiPropertyOptional({ description: 'Desde (ISO 8601, incluido)', example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Hasta (ISO 8601, incluido)', example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdTo?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo tiene efecto con alcance `ORGANIZATION` de `importaciones.ver`' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID('all')
  startedById?: string;
}

/** 06 F.1 §6 `CustomerImportRowQueryDto`. Orden fijo por `rowNumber`. */
export class CustomerImportRowQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ type: String, example: 'INVALID,DUPLICATE_EXISTING', description: `Estado(s) de fila. ${LIST_NOTE}` })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsIn(IMPORT_ROW_STATUSES, { each: true })
  status?: ImportRowStatus[];

  @ApiPropertyOptional({ description: 'Solo filas con (`true`) o sin (`false`) advertencias' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  hasWarnings?: boolean;
}

/** 06 F.2 `ConfirmCustomerImportDto`. */
export class ConfirmCustomerImportDto {
  @ApiProperty({ minimum: 1, example: 42, description: 'Filas válidas que mostraba la pantalla; si no coincide → `409 IMPORT_CHANGED`' })
  @IsInt()
  @Min(1)
  expectedValidRows!: number;

  @ApiPropertyOptional({ default: false, description: 'Importar también las filas válidas con advertencias (RN-06.18, D-06.6)' })
  @IsOptional()
  @IsBoolean()
  includeRowsWithWarnings: boolean = false;
}

export class ImportUserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ana Pérez' }) displayName!: string;
}

/** 06 F.2 `CustomerImportListItemDto`. */
export class CustomerImportListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'IMP-2026-0007' }) code!: string;
  @ApiProperty({ enum: FORMATS }) format!: string;
  @ApiProperty({ example: 'clientes-octubre.xlsx' }) originalFileName!: string;
  @ApiProperty({ enum: IMPORT_STATUSES }) status!: string;
  @ApiProperty() totalRows!: number;
  @ApiProperty() validRows!: number;
  @ApiProperty({ description: '`INVALID` + `DUPLICATE_IN_FILE` + `DUPLICATE_EXISTING`' }) invalidRows!: number;
  @ApiProperty() importedRows!: number;
  @ApiProperty({ type: ImportUserRefDto }) startedBy!: ImportUserRefDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}

/** 06 F.2 `CustomerImportResponseDto`. Los `can*`/`has*` se calculan para el usuario actual. */
export class CustomerImportResponseDto extends CustomerImportListItemDto {
  @ApiProperty({ type: String, nullable: true, example: '1' }) templateVersion!: string | null;
  @ApiProperty({ description: 'Rechazadas al confirmar' }) rejectedRows!: number;
  @ApiProperty({ description: 'Filas con al menos una advertencia' }) warningRows!: number;
  @ApiProperty({ type: String, nullable: true, example: 'MISSING_COLUMN: Razón social' }) failureReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) validatedAt!: string | null;
  @ApiProperty({ type: ImportUserRefDto, nullable: true }) confirmedBy!: ImportUserRefDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) confirmedAt!: string | null;
  @ApiProperty({ description: 'Los datos de las filas se purgaron por retención (RN-06.29)' }) isPurged!: boolean;
  @ApiProperty() canConfirm!: boolean;
  @ApiProperty() canCancel!: boolean;
  @ApiProperty() hasErrorFile!: boolean;
}

export class ImportRowValuesDto {
  @ApiProperty({ type: String, nullable: true }) customerCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) legalName!: string | null;
  @ApiProperty({ type: String, nullable: true }) tradeName!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) address!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) companyType!: string | null;
  @ApiProperty({ type: String, nullable: true }) status!: string | null;
  @ApiProperty({ type: String, nullable: true }) rating!: string | null;
  @ApiProperty({ type: String, nullable: true }) salesOwner!: string | null;
  @ApiProperty({ type: String, nullable: true }) taxId!: string | null;
}

export class ImportRowIssueDto {
  @ApiProperty({ example: 'taxId', description: 'Columna de la plantilla (`legalName`, `country`…) o `row`' }) field!: string;
  @ApiProperty({ example: 'DUPLICATE_TAX_ID' }) code!: string;
  @ApiProperty({ description: 'En español; nunca repite el valor de la celda' }) message!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING'] }) severity!: string;
}

export class ImportRowCustomerRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CLI-000123' }) crmCode!: string;
}

export class ImportRowDuplicateCustomerDto extends ImportRowCustomerRefDto {
  @ApiProperty() legalName!: string;
}

/** 06 F.2 `CustomerImportRowDto`. */
export class CustomerImportRowDto {
  @ApiProperty({ description: '1 = primera fila de datos' }) rowNumber!: number;
  @ApiProperty({ description: '`rowNumber + 1`: la fila que el usuario ve en Excel' }) fileRowNumber!: number;
  @ApiProperty({ enum: IMPORT_ROW_STATUSES }) status!: string;
  @ApiProperty({ type: ImportRowValuesDto, nullable: true, description: '`null` si los datos se purgaron' }) values!: ImportRowValuesDto | null;
  @ApiProperty({ type: [ImportRowIssueDto] }) issues!: ImportRowIssueDto[];
  @ApiProperty({ type: Number, nullable: true }) duplicateOfRowNumber!: number | null;
  @ApiProperty({ type: ImportRowDuplicateCustomerDto, nullable: true, description: 'Solo si el usuario ve ese cliente (H.4)' })
  duplicateOfCustomer!: ImportRowDuplicateCustomerDto | null;
  @ApiProperty({ type: ImportRowCustomerRefDto, nullable: true, description: 'Cliente creado (filas `IMPORTED`)' }) customer!: ImportRowCustomerRefDto | null;
}

export class PaginatedCustomerImportsDto {
  @ApiProperty({ type: [CustomerImportListItemDto] }) data!: CustomerImportListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class PaginatedCustomerImportRowsDto {
  @ApiProperty({ type: [CustomerImportRowDto] }) data!: CustomerImportRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
