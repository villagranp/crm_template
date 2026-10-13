import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { AGENDA_KINDS } from '../ports/agenda-read-model.port';
import {
  FOLLOW_UP_GROUPS,
  FOLLOW_UP_SORT_FIELDS,
  type FollowUpGroup,
  type FollowUpSortField,
  type InteractionSourceType,
} from '../ports/interaction-read-model.port';

import { AgendaItemDto } from './agenda.dto';
import {
  CommercialCatalogRefDto,
  CommercialCustomerRefDto,
  CommercialOpportunityRefDto,
  CommercialProjectRefDto,
  CommercialUserRefDto,
} from './commercial-refs.dto';
import { INSTANT_MESSAGE, ISO_INSTANT, MAX_FILTER_VALUES, toArray, toOptionalBoolean } from './dto-transforms';

// ---------------------------------------------------------------------------
// Historial de interacciones (F.3, F-24)
// ---------------------------------------------------------------------------

export class ListInteractionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['occurredAt'], description: 'Único orden: `occurredAt` (por defecto descendente, invertible con `sortOrder`)' })
  @IsOptional()
  @IsIn(['occurredAt'])
  override sortBy?: 'occurredAt' = undefined;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `from ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `to ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() opportunityId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: usuario responsable del registro' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  userId?: string[];

  @ApiPropertyOptional({ enum: AGENDA_KINDS, isArray: true, description: 'Repetible. Sin `sourceType` pero con `typeId`: solo actividades' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(AGENDA_KINDS.length)
  @IsIn(AGENDA_KINDS, { each: true })
  sourceType?: InteractionSourceType[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.tipo_actividad`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  typeId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.resultado_interaccion`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  resultId?: string[];
}

export class InteractionDto {
  @ApiProperty({ enum: AGENDA_KINDS }) sourceType!: InteractionSourceType;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) sourceCode!: string;
  @ApiProperty({ format: 'date-time', description: 'Visita: fecha real; actividad: finalización (o programada/vencimiento)' }) occurredAt!: string;
  @ApiProperty({ description: '"Visita" o la etiqueta del tipo de actividad' }) typeLabel!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) typeId!: string | null;
  @ApiProperty({ type: CommercialUserRefDto }) user!: CommercialUserRefDto;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: CommercialOpportunityRefDto, nullable: true }) opportunity!: CommercialOpportunityRefDto | null;
  @ApiProperty({ description: 'Objetivo de la visita o asunto de la actividad' }) subject!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Visita: resumen de confirmación o de resultado; actividad: resumen o notas de resultado' })
  summary!: string | null;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) result!: CommercialCatalogRefDto | null;
  @ApiProperty({ nullable: true, type: String }) nextAction!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextActionDate!: string | null;
  @ApiProperty({ example: '/actividad/visitas/0f6c…', description: 'Ruta del registro de origen en el frontend' }) sourcePath!: string;
}

export class PaginatedInteractionsDto {
  @ApiProperty({ type: [InteractionDto] }) data!: InteractionDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Seguimiento comercial (F.3, F-23)
// ---------------------------------------------------------------------------

export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FOLLOW_UP_SORT_FIELDS, description: 'Por defecto `lastInteractionAt` descendente' })
  @IsOptional()
  @IsIn(FOLLOW_UP_SORT_FIELDS)
  override sortBy?: FollowUpSortField = undefined;

  @ApiPropertyOptional({ enum: FOLLOW_UP_GROUPS, default: 'CUSTOMER' })
  @IsOptional()
  @IsIn(FOLLOW_UP_GROUPS)
  groupBy?: FollowUpGroup;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: responsable de la fila (RN-04.34)' })
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

  @ApiPropertyOptional({ type: Boolean, description: 'Solo filas sin próxima acción' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  withoutNextAction?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `lastInteractionFrom ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  lastInteractionFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `lastInteractionTo ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  lastInteractionTo?: string;
}

export class FollowUpTraceQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Exactamente uno de `customerId` o `projectId`' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
}

export class FollowUpSourceRefDto {
  @ApiProperty({ enum: AGENDA_KINDS }) sourceType!: InteractionSourceType;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
  @ApiProperty() sourceCode!: string;
}

export class FollowUpLastInteractionDto extends FollowUpSourceRefDto {
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
}

export class FollowUpRowDto {
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true, description: 'Solo en la vista por proyecto' }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: FollowUpLastInteractionDto, nullable: true }) lastInteraction!: FollowUpLastInteractionDto | null;
  @ApiProperty({ nullable: true, type: String }) nextAction!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextActionDate!: string | null;
  @ApiProperty({ type: FollowUpSourceRefDto, nullable: true }) nextActionSource!: FollowUpSourceRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) responsible!: CommercialUserRefDto | null;
  @ApiProperty({ nullable: true, type: String, description: 'Resumen de la última interacción' }) notes!: string | null;
  @ApiProperty() attachmentCount!: number;
}

export class PaginatedFollowUpsDto {
  @ApiProperty({ type: [FollowUpRowDto] }) data!: FollowUpRowDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class TraceAttachmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() contentType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) createdBy!: CommercialUserRefDto | null;
  @ApiProperty({ enum: ['VISIT', 'VISIT_EVENT', 'ACTIVITY'] }) ownerType!: 'VISIT' | 'VISIT_EVENT' | 'ACTIVITY';
  @ApiProperty({ format: 'uuid', description: 'Visita (también para un adjunto de evento) o actividad' }) sourceId!: string;
  @ApiProperty() sourceCode!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) eventId!: string | null;
  @ApiProperty({ description: 'Ruta de descarga por el dueño (F.4)' }) contentPath!: string;
  @ApiProperty({ description: 'Ruta del registro de origen en el frontend' }) sourcePath!: string;
}

export class FollowUpTraceDto {
  @ApiProperty({ type: FollowUpRowDto }) row!: FollowUpRowDto;
  @ApiProperty({ type: [InteractionDto], description: 'Las 50 más recientes (el resto en `/interactions`)' }) interactions!: InteractionDto[];
  @ApiProperty({ type: [AgendaItemDto], description: 'Visitas pendientes y actividades abiertas desde ahora (máx. 20)' }) upcoming!: AgendaItemDto[];
  @ApiProperty({ type: [TraceAttachmentDto], description: 'Adjuntos de visitas, eventos y actividades (máx. 50)' }) attachments!: TraceAttachmentDto[];
}
