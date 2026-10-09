import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

import { MAX_PAGE_SIZE } from '@/common/dto/pagination-query.dto';
import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';

import { AUDIT_SORTABLE_FIELDS, type AuditSortField } from '../ports/audit-query.repository.port';

/** Filtros comunes a la consulta y a la exportación. */
export class AuditLogFilterQueryDto {
  @ApiPropertyOptional({
    example: 'auth.',
    description: 'Evento exacto (`role.updated`) o prefijo si termina en `.` o `*` (`auth.`, `user.*`)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  event?: string;

  @ApiPropertyOptional({ description: 'Actor: contenido en el correo o igual al identificador del sujeto' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;

  @ApiPropertyOptional({ description: 'Identificador exacto del actor' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  subjectId?: string;

  @ApiPropertyOptional({ example: 'role' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  correlationId?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Desde (inclusivo). ISO 8601: fecha o fecha y hora' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-08', description: 'Hasta (inclusivo; una fecha sin hora incluye el día entero en UTC)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ListAuditLogsQueryDto extends AuditLogFilterQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = 20;

  @ApiPropertyOptional({ enum: AUDIT_SORTABLE_FIELDS, default: 'occurredAt' })
  @IsOptional()
  @IsIn(AUDIT_SORTABLE_FIELDS)
  sortBy: AuditSortField = 'occurredAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ example: 'role.updated' })
  event!: string;

  @ApiProperty()
  correlationId!: string;

  @ApiProperty({ nullable: true, type: String })
  subjectId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  subjectEmail!: string | null;

  @ApiProperty({ nullable: true, type: String })
  resourceType!: string | null;

  @ApiProperty({ nullable: true, type: String })
  resourceId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  ipAddress!: string | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Diferencia `{ campo: { before, after } }`, tal como se guardó',
  })
  changes!: unknown;

  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  metadata!: unknown;
}

export class AuditLogPageResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data!: AuditLogResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMetaDto;
}

export class AuditEventNamesResponseDto {
  @ApiProperty({ type: [String], example: ['auth.login.succeeded', 'role.updated'] })
  data!: string[];
}
