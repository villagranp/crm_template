import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { toOptionalBoolean } from '@/modules/customers/dto/dto-transforms';
import { ALERT_TYPES } from '@/modules/parameters/parameter-rules.registry';
import { MAX_FILTER_VALUES, toList } from '@/modules/projects/dto/dto-helpers';

import { CustomerRefDto, ProjectRefDto, SourceRefDto, UserRefDto } from './dashboard-activity.dto';

export const ALERT_SORT_FIELDS = ['priority', 'referenceDate'] as const;
export type AlertSortField = (typeof ALERT_SORT_FIELDS)[number];

/** 01 F.1 §9: bandeja de alertas (RN-01.27, RN-01.31). */
export class DashboardAlertsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @ApiPropertyOptional({ type: String, example: 'ACTIVIDAD_VENCIDA,VISITA_SIN_CONFIRMAR', description: 'Tipos, separados por comas' })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(ALERT_TYPES.length)
  @IsIn(ALERT_TYPES, { each: true })
  type?: string[];

  @ApiPropertyOptional({ type: String, example: 'ALTA', description: 'Códigos de `crm.prioridad`, separados por comas' })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @Matches(/^[A-Z0-9_]+$/, { each: true })
  priority?: string[];

  @ApiPropertyOptional({ description: 'Solo las del usuario (`owner_id = yo`)' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ enum: ALERT_SORT_FIELDS, default: 'priority', description: '`priority`: peso desc y fecha asc (RN-01.27)' })
  @IsOptional()
  @IsIn(ALERT_SORT_FIELDS)
  sortBy?: AlertSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class PriorityDto {
  @ApiProperty({ example: 'ALTA' }) code!: string;
  @ApiProperty({ example: 'Alta' }) label!: string;
  @ApiProperty({ example: 3 }) weight!: number;
}

export class DashboardAlertDto {
  @ApiProperty({ example: 'ACTIVIDAD_VENCIDA:uuid', description: '`{tipo}:{id del origen}` (RN-01.28)' }) id!: string;
  @ApiProperty({ enum: ALERT_TYPES }) type!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: PriorityDto }) priority!: PriorityDto;
  @ApiProperty({ type: UserRefDto }) responsible!: UserRefDto;
  @ApiProperty({ format: 'date-time' }) referenceDate!: string;
  @ApiProperty({ type: CustomerRefDto, nullable: true }) customer!: CustomerRefDto | null;
  @ApiProperty({ type: ProjectRefDto, nullable: true }) project!: ProjectRefDto | null;
  @ApiProperty({ type: SourceRefDto }) source!: SourceRefDto;
}

export class PaginatedDashboardAlertsDto {
  @ApiProperty({ type: [DashboardAlertDto] }) data!: DashboardAlertDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class AlertSummaryItemDto {
  @ApiProperty({ enum: ALERT_TYPES }) type!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true, enum: ['DISABLED_BY_PARAMETER', 'PARAMETER_INVALID'] }) disabledReason!: string | null;
  @ApiProperty() count!: number;
  @ApiProperty({ type: PriorityDto, nullable: true }) priority!: PriorityDto | null;
}

export class AlertsSummaryResponseDto {
  @ApiProperty({ type: [AlertSummaryItemDto], description: 'Solo los tipos que el usuario puede ver' }) items!: AlertSummaryItemDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
