import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';

import { PaginationWithoutSearchQueryDto } from './pagination-without-search.dto';
import { AGENDA_STATUS_GROUPS, type AgendaStatusGroup } from '../agenda-status';
import { AGENDA_KINDS, AGENDA_SORT_FIELDS, type AgendaKind, type AgendaSortField } from '../ports/agenda-read-model.port';

import { CommercialCustomerRefDto, CommercialProjectRefDto, CommercialStatusRefDto, CommercialUserRefDto } from './commercial-refs.dto';
import { INSTANT_MESSAGE, ISO_INSTANT, MAX_FILTER_VALUES, toArray } from './dto-transforms';

/** Filtros comunes del listado y del calendario (04 F.3). */
class AgendaFilterFields {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: responsables' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  ownerId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: país del cliente' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  countryId?: string[];

  @ApiPropertyOptional({ enum: AGENDA_KINDS, isArray: true, description: 'Repetible. Sin `kind` pero con `activityTypeId`: solo actividades; sin ninguno: ambas' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(AGENDA_KINDS.length)
  @IsIn(AGENDA_KINDS, { each: true })
  kind?: AgendaKind[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.tipo_actividad` (solo actividades)' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  activityTypeId?: string[];

  @ApiPropertyOptional({ enum: AGENDA_STATUS_GROUPS, isArray: true, description: 'Repetible: grupo derivado (RN-04.35)' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(AGENDA_STATUS_GROUPS.length)
  @IsIn(AGENDA_STATUS_GROUPS, { each: true })
  statusGroup?: AgendaStatusGroup[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: estado de `crm.estado_visita` o `crm.estado_actividad`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  statusId?: string[];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
}

export class AgendaListQueryDto extends IntersectionType(PaginationWithoutSearchQueryDto, AgendaFilterFields) {
  @ApiPropertyOptional({ enum: AGENDA_SORT_FIELDS, description: 'Por defecto `date` ascendente' })
  @IsOptional()
  @IsIn(AGENDA_SORT_FIELDS)
  override sortBy?: AgendaSortField = undefined;

  @ApiPropertyOptional({ format: 'date-time', description: 'Desde (fecha de agenda, RN-04.36)' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `from ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Hasta (incluido)' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `to ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  to?: string;
}

export class AgendaCalendarQueryDto extends AgendaFilterFields {
  @ApiProperty({ format: 'date-time', description: 'Obligatorio. Rango ≤ 42 días (`400 RANGE_TOO_WIDE`, D-04.12)' })
  @Matches(ISO_INSTANT, { message: `from ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'Obligatorio (incluido)' })
  @Matches(ISO_INSTANT, { message: `to ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  to!: string;
}

export class AgendaStatusDto extends CommercialStatusRefDto {}

export class AgendaItemDto {
  @ApiProperty({ enum: AGENDA_KINDS }) kind!: AgendaKind;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) code!: string;
  @ApiProperty({ format: 'date-time', description: 'RN-04.36: visita = real si realizada/confirmada, si no la vigente; actividad = `scheduledAt` o `dueAt`' })
  date!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'Visita: fin real, fin planificado o inicio + duración por defecto; actividad: `scheduledAt` + duración' })
  endDate!: string | null;
  @ApiProperty({ description: '"Visita" o la etiqueta del tipo de actividad' }) typeLabel!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'Tipo de actividad; `null` en visitas' }) typeId!: string | null;
  @ApiProperty({ description: 'Objetivo de la visita o asunto de la actividad' }) subject!: string;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: AgendaStatusDto }) status!: AgendaStatusDto;
  @ApiProperty({ description: 'Visita en estado "Reprogramada" (D-04.3)' }) isRescheduled!: boolean;
  @ApiProperty({ description: 'Visita pendiente cuya hora ya pasó (RN-04.22)' }) isUnregistered!: boolean;
  @ApiProperty({ description: 'Visita con recordatorio (no se envía nada, DM-27)' }) hasReminder!: boolean;
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({ example: '/actividad/visitas/0f6c…', description: 'Ruta del detalle en el frontend' }) detailPath!: string;
}

export class PaginatedAgendaDto {
  @ApiProperty({ type: [AgendaItemDto] }) data!: AgendaItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class AgendaCalendarDto {
  @ApiProperty({ type: [AgendaItemDto], description: 'Por fecha ascendente, como mucho 500' }) data!: AgendaItemDto[];
  @ApiProperty({ description: 'Había más de 500 eventos en el rango: acotar los filtros (D-04.12)' }) truncated!: boolean;
}
