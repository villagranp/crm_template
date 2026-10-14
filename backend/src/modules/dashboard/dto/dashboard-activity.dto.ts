import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { toList } from '@/modules/projects/dto/dto-helpers';

export const RECENT_ACTIVITY_EVENT_TYPES = [
  'ACTIVIDAD_REGISTRADA',
  'ACTIVIDAD_COMPLETADA',
  'INTERACCION',
  'OPORTUNIDAD_ETAPA',
  'OPORTUNIDAD_CERRADA',
  'OPORTUNIDAD_RESULTADO',
  'OPORTUNIDAD_CREADA',
  'OPORTUNIDAD_ACTUALIZADA',
  'PROYECTO_CREADO',
  'PROYECTO_FASE',
] as const;
export type RecentActivityEventType = (typeof RECENT_ACTIVITY_EVENT_TYPES)[number];

export const SOURCE_TYPES = ['ACTIVITY', 'VISIT', 'OPPORTUNITY', 'PROJECT'] as const;

/** 01 F.1 §7: próximas visitas, orden fijo `scheduledStartAt` ascendente. */
export class UpcomingVisitsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 5;
}

/** 01 F.1 §8: actividad reciente (RN-01.24). */
export class RecentActivityQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;

  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  sinceDays: number = 30;

  @ApiPropertyOptional({ type: String, example: 'INTERACCION,OPORTUNIDAD_ETAPA', description: 'Tipos de evento (D.5), separados por comas' })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(RECENT_ACTIVITY_EVENT_TYPES.length)
  @IsIn(RECENT_ACTIVITY_EVENT_TYPES, { each: true })
  types?: RecentActivityEventType[];
}

export class UserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class CustomerRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CLI-000123' }) crmCode!: string;
  @ApiProperty({ description: 'Razón social' }) name!: string;
}

export class ProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PRY-2026-00042' }) code!: string;
  @ApiProperty() name!: string;
}

export class CatalogValueDto {
  @ApiProperty({ example: 'PROGRAMADA' }) code!: string;
  @ApiProperty({ example: 'Programada' }) label!: string;
}

export class UpcomingVisitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) code!: string;
  @ApiProperty({ format: 'date-time' }) scheduledStartAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) scheduledEndAt!: string | null;
  @ApiProperty({ type: CatalogValueDto }) status!: CatalogValueDto;
  @ApiProperty({ description: '≤ 200 caracteres' }) objective!: string;
  @ApiProperty({ type: UserRefDto }) owner!: UserRefDto;
  @ApiProperty({ type: CustomerRefDto }) customer!: CustomerRefDto;
  @ApiProperty({ type: ProjectRefDto, nullable: true }) project!: ProjectRefDto | null;
  @ApiProperty({ description: '`ahora ≥ inicio − recordatorio` (RN-01.25)' }) reminderDue!: boolean;
}

export class SourceRefDto {
  @ApiProperty({ enum: SOURCE_TYPES }) type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OPO-2026-00042' }) code!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Proyecto padre (oportunidades)' }) projectId!: string | null;
}

export class RecentActivityItemDto {
  @ApiProperty({ example: 'OPORTUNIDAD_ETAPA:uuid', description: '`{tipo}:{id del hecho}`, estable' }) id!: string;
  @ApiProperty({ enum: RECENT_ACTIVITY_EVENT_TYPES }) eventType!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ description: '≤ 200 caracteres; sin datos de contactos' }) summary!: string;
  @ApiProperty({ type: UserRefDto }) responsible!: UserRefDto;
  @ApiProperty({ type: CustomerRefDto, nullable: true }) customer!: CustomerRefDto | null;
  @ApiProperty({ type: ProjectRefDto, nullable: true }) project!: ProjectRefDto | null;
  @ApiProperty({ type: SourceRefDto }) source!: SourceRefDto;
}

export class PaginatedUpcomingVisitsDto {
  @ApiProperty({ type: [UpcomingVisitDto] }) data!: UpcomingVisitDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class PaginatedRecentActivityDto {
  @ApiProperty({ type: [RecentActivityItemDto] }) data!: RecentActivityItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}
