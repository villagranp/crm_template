import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PaginationMetaDto } from '@/common/dto/paginated-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

import { VISIT_SORT_FIELDS, type VisitEventType, type VisitSortField } from '../ports/visit.repository.port';
import { SCHEDULE_CONFLICT_MODES, type ScheduleConflictMode } from '../schedule-conflict';
import { VISIT_OPERATIONS, type VisitOperation, type VisitStatusGroup } from '../visit-lifecycle';

import {
  CommercialCatalogRefDto,
  CommercialCustomerRefDto,
  CommercialFormContextDto,
  CommercialProjectDetailRefDto,
  CommercialProjectRefDto,
  CommercialStatusRefDto,
  CommercialUserRefDto,
} from './commercial-refs.dto';
import {
  CALENDAR_DATE,
  DATE_MESSAGE,
  INSTANT_MESSAGE,
  ISO_INSTANT,
  isPresent,
  MAX_FILTER_VALUES,
  toArray,
  toOptionalBoolean,
} from './dto-transforms';
import { IsParticipantList, MAX_PARTICIPANTS, ParticipantDto, ParticipantInputDto } from './participant.dto';

/** Grupos de estado de visita filtrables (RN-04.35; una visita nunca está "vencida"). */
export const VISIT_STATUS_GROUPS = ['PENDING', 'DONE', 'CONFIRMED', 'CANCELLED'] as const satisfies readonly VisitStatusGroup[];

/** Recordatorio máximo: 30 días (límite técnico, 04 F.1). */
export const MAX_REMINDER_MINUTES = 43_200;

const VISIT_EVENT_TYPES = ['PLANNED', 'RESCHEDULED', 'COMPLETED', 'CONFIRMED', 'CANCELLED'] as const satisfies readonly VisitEventType[];

// ---------------------------------------------------------------------------
// Consultas (F.1)
// ---------------------------------------------------------------------------

export class ListVisitsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VISIT_SORT_FIELDS, description: 'Por defecto `scheduledStartAt` ascendente (fecha vigente)' })
  @IsOptional()
  @IsIn(VISIT_SORT_FIELDS)
  override sortBy?: VisitSortField = undefined;

  @ApiPropertyOptional({ format: 'date-time', description: 'Desde (fecha de agenda, RN-04.36: real si está realizada o confirmada, si no la vigente)' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `from ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Hasta (incluido), sobre la misma fecha' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `to ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.estado_visita`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  statusId?: string[];

  @ApiPropertyOptional({ enum: VISIT_STATUS_GROUPS, isArray: true, description: 'Repetible: grupo semántico (RN-04.35); destino de la tarjeta K6 de Inicio' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(VISIT_STATUS_GROUPS.length)
  @IsIn(VISIT_STATUS_GROUPS, { each: true })
  statusGroup?: VisitStatusGroup[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: responsables' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  ownerId?: string[];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'País del cliente' }) @IsOptional() @IsUUID() countryId?: string;

  @ApiPropertyOptional({ type: Boolean, description: '"Sin registrar" (RN-04.22): pendientes cuya hora planificada ya pasó' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  unregistered?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Realizadas pendientes de confirmar' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  pendingConfirmation?: boolean;
}

export class ScheduleConflictsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Responsable; por defecto el usuario. Otro exige `visitas.administrar` y que sea asignable (`422 OWNER_NOT_ELIGIBLE`)' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiProperty({ format: 'date-time' })
  @Matches(ISO_INSTANT, { message: `start ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  start!: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Sin fin: inicio + `crm.visitas.duracion_por_defecto_minutos`' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `end ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  end?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Visita que se edita o reprograma (no compite consigo misma)' })
  @IsOptional()
  @IsUUID()
  excludeVisitId?: string;
}

// ---------------------------------------------------------------------------
// Entrada (F.1)
// ---------------------------------------------------------------------------

export class CreateVisitDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente visible y activo (`404` / `422 CUSTOMER_INACTIVE`, 02 F.6.3)' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Proyecto visible, no eliminado y **del cliente** (`422 PROJECT_CUSTOMER_MISMATCH`)' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Responsable; por defecto el usuario. Otro exige `visitas.administrar` (`403`) y ser elegible (`422 OWNER_NOT_ELIGIBLE`)',
  })
  @ValidateIf(isPresent)
  @IsUUID()
  ownerId?: string;

  @ApiProperty({ format: 'date-time', description: 'Se admite en el pasado (registro tardío, D-04.5)' })
  @Matches(ISO_INSTANT, { message: `scheduledStartAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledStartAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: '≥ inicio (`422 INVALID_DATE_RANGE`). Sin fin, la duración por defecto solo se usa para mostrar y para conflictos' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `scheduledEndAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledEndAt?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  objective!: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_REMINDER_MINUTES, nullable: true, description: 'Se guarda y se muestra; no envía ninguna notificación (DM-27)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMINDER_MINUTES)
  reminderMinutesBefore?: number | null;

  @ApiPropertyOptional({ type: [ParticipantInputDto], maxItems: MAX_PARTICIPANTS, description: 'Invitados' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PARTICIPANTS)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInputDto)
  @IsParticipantList()
  participants?: ParticipantInputDto[];
}

/** Campo omitido = sin cambio; `null` = quitar un opcional. Sin `customerId` (`400`). */
export class UpdateVisitDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reasignar exige `visitas.administrar`; evalúa conflictos del nuevo responsable' })
  @ValidateIf(isPresent)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'No se edita: cualquier valor responde `422 USE_RESCHEDULE` (se cambia reprogramando, RN-04.15)',
  })
  @IsOptional()
  @IsString()
  scheduledStartAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `scheduledEndAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledEndAt?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 1000)
  objective?: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_REMINDER_MINUTES, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_REMINDER_MINUTES)
  reminderMinutesBefore?: number | null;

  @ApiPropertyOptional({ type: [ParticipantInputDto], maxItems: MAX_PARTICIPANTS, description: 'Reemplaza la lista de invitados' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PARTICIPANTS)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInputDto)
  @IsParticipantList()
  participants?: ParticipantInputDto[];
}

/** Realización (RN-04.16). En `PUT` (corrección, RN-04.17) sustituye a la guardada: lo omitido queda vacío. */
export class VisitCompletionDto {
  @ApiProperty({ format: 'date-time', description: 'Fecha real; no futura (`422 ACTUAL_DATE_IN_FUTURE`)' })
  @Matches(ISO_INSTANT, { message: `actualStartAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  actualStartAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: '≥ fecha real y no futura' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `actualEndAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  actualEndAt?: string | null;

  @ApiPropertyOptional({ type: [ParticipantInputDto], maxItems: MAX_PARTICIPANTS, description: 'Asistentes (`ATTENDED`); reemplaza la lista' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PARTICIPANTS)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInputDto)
  @IsParticipantList()
  attendees?: ParticipantInputDto[];

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true }) @IsOptional() @IsString() @MaxLength(10_000) topics?: string | null;
  @ApiPropertyOptional({ maxLength: 10_000, nullable: true }) @IsOptional() @IsString() @MaxLength(10_000) agreements?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.resultado_interaccion`' })
  @IsOptional()
  @IsUUID()
  resultId?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @IsString() @MaxLength(2000) resultSummary?: string | null;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @IsString() @MaxLength(2000) comments?: string | null;
  @ApiPropertyOptional({ maxLength: 300, nullable: true }) @IsOptional() @IsString() @MaxLength(300) nextAction?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, example: '2026-10-20' })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: `nextActionDate ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  nextActionDate?: string | null;
}

export class VisitConfirmationDto {
  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description: 'Obligatorio si la realización no tiene `resultSummary` ni `comments` (`422 CONFIRMATION_SUMMARY_REQUIRED`)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  confirmationSummary?: string | null;
}

export class VisitReschedulingDto {
  @ApiProperty({ format: 'date-time', description: 'Distinta de la vigente (`RESCHEDULE_SAME_DATE`) y no pasada (`DATE_IN_PAST`)' })
  @Matches(ISO_INSTANT, { message: `newScheduledStartAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  newScheduledStartAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: 'Sin fin nuevo se conserva la duración planificada' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `newScheduledEndAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  newScheduledEndAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.motivo_reprogramacion`. Al menos uno de `reasonId` / `reasonText` (`422 REASON_REQUIRED`)' })
  @IsOptional()
  @IsUUID()
  reasonId?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @IsOptional() @IsString() @MaxLength(1000) reasonText?: string | null;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @IsString() @MaxLength(2000) comment?: string | null;
}

export class VisitCancellationDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.motivo_cancelacion`. Al menos uno de `reasonId` / `reasonText` (`422 REASON_REQUIRED`)' })
  @IsOptional()
  @IsUUID()
  reasonId?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true }) @IsOptional() @IsString() @MaxLength(1000) reasonText?: string | null;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true }) @IsOptional() @IsString() @MaxLength(2000) comment?: string | null;
}

// ---------------------------------------------------------------------------
// Respuesta (F.1)
// ---------------------------------------------------------------------------

export class VisitStatusRefDto extends CommercialStatusRefDto {
  @ApiProperty({ description: '`metadata.isRescheduled` (D-04.3): la interfaz muestra "Reprogramada"' }) isRescheduled!: boolean;
}

export class ScheduleConflictDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`null` si el usuario no ve esa visita (no se revelan sus datos)' })
  visitId!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'VIS-2026-00031' }) code!: string | null;
  @ApiProperty({ format: 'date-time' }) scheduledStartAt!: string;
  @ApiProperty({ format: 'date-time', description: 'Fin o inicio + duración por defecto' }) effectiveEndAt!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Razón social; `null` fuera del alcance ("Otra visita del responsable")' }) customerName!: string | null;
  @ApiProperty() isVisible!: boolean;
}

export class ScheduleConflictsResponseDto {
  @ApiProperty({ enum: SCHEDULE_CONFLICT_MODES, description: '`crm.visitas.validar_conflicto_horario`; con `NO` la lista va vacía' }) mode!: ScheduleConflictMode;
  @ApiProperty({ type: [ScheduleConflictDto] }) conflicts!: ScheduleConflictDto[];
}

export class VisitListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) code!: string;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: VisitStatusRefDto }) status!: VisitStatusRefDto;
  @ApiProperty({ format: 'date-time', description: 'Fecha y hora vigente' }) scheduledStartAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) scheduledEndAt!: string | null;
  @ApiProperty({ format: 'date-time' }) effectiveEndAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) actualStartAt!: string | null;
  @ApiProperty({ description: 'Reprogramaciones ("Reprogramada ×N")' }) rescheduleCount!: number;
  @ApiProperty() objective!: string;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) result!: CommercialCatalogRefDto | null;
  @ApiProperty({ description: '"Sin registrar" (RN-04.22)' }) isUnregistered!: boolean;
  @ApiProperty() hasReminder!: boolean;
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({ enum: VISIT_OPERATIONS, isArray: true }) allowedActions!: VisitOperation[];
}

export class PaginatedVisitsDto {
  @ApiProperty({ type: [VisitListItemDto] }) data!: VisitListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class VisitCompletionInfoDto {
  @ApiProperty({ format: 'date-time' }) actualStartAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) actualEndAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) topics!: string | null;
  @ApiProperty({ nullable: true, type: String }) agreements!: string | null;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) result!: CommercialCatalogRefDto | null;
  @ApiProperty({ nullable: true, type: String }) resultSummary!: string | null;
  @ApiProperty({ nullable: true, type: String }) comments!: string | null;
  @ApiProperty({ nullable: true, type: String }) nextAction!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextActionDate!: string | null;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) recordedBy!: CommercialUserRefDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) recordedAt!: string | null;
}

export class VisitConfirmationInfoDto {
  @ApiProperty({ format: 'date-time' }) confirmedAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true, description: 'Siempre el dueño (DM-20)' }) confirmedBy!: CommercialUserRefDto | null;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
}

export class VisitDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VIS-2026-00042' }) code!: string;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectDetailRefDto, nullable: true }) project!: CommercialProjectDetailRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: VisitStatusRefDto }) status!: VisitStatusRefDto;
  @ApiProperty({ format: 'date-time' }) scheduledStartAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) scheduledEndAt!: string | null;
  @ApiProperty({ format: 'date-time', description: 'Calculado: fin o inicio + duración por defecto' }) effectiveEndAt!: string;
  @ApiProperty({ format: 'date-time' }) originalScheduledAt!: string;
  @ApiProperty() rescheduleCount!: number;
  @ApiProperty() objective!: string;
  @ApiProperty({ nullable: true, type: String }) location!: string | null;
  @ApiProperty({ nullable: true, type: Number }) reminderMinutesBefore!: number | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'Calculado: inicio − minutos. No se envía ninguna notificación (DM-27)' })
  reminderAt!: string | null;
  @ApiProperty({ type: [ParticipantDto], description: 'Invitados (`INVITED`) y asistentes (`ATTENDED`)' }) participants!: ParticipantDto[];
  @ApiProperty({ type: VisitCompletionInfoDto, nullable: true }) completion!: VisitCompletionInfoDto | null;
  @ApiProperty({ type: VisitConfirmationInfoDto, nullable: true }) confirmation!: VisitConfirmationInfoDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) cancelledAt!: string | null;
  @ApiProperty({ description: '"Sin registrar" (RN-04.22)' }) isUnregistered!: boolean;
  @ApiProperty({ description: 'Adjuntos activos de la visita (sin los de sus eventos)' }) attachmentCount!: number;
  @ApiProperty({ enum: ['DIRECT', 'INHERITED'], description: '`INHERITED`: visible solo por su proyecto (solo lectura, DM-13)' })
  access!: 'DIRECT' | 'INHERITED';
  @ApiProperty({
    enum: VISIT_OPERATIONS,
    isArray: true,
    description: 'Estado + permisos + propiedad. `CONFIRM` solo para el dueño con `visitas.cerrar` (DM-20); el backend vuelve a decidir',
  })
  allowedActions!: VisitOperation[];
  @ApiPropertyOptional({ type: [ScheduleConflictDto], description: 'Solo tras planificar, reprogramar o cambiar responsable/fin con el modo `AVISAR`' })
  scheduleConflicts?: ScheduleConflictDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) createdBy!: CommercialUserRefDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) updatedBy!: CommercialUserRefDto | null;
}

export class VisitEventStatusDto extends CommercialCatalogRefDto {}

export class VisitEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: VISIT_EVENT_TYPES }) eventType!: VisitEventType;
  @ApiProperty({ type: VisitEventStatusDto, nullable: true }) fromStatus!: VisitEventStatusDto | null;
  @ApiProperty({ type: VisitEventStatusDto }) toStatus!: VisitEventStatusDto;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) previousScheduledStartAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) newScheduledStartAt!: string | null;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) reason!: CommercialCatalogRefDto | null;
  @ApiProperty({ nullable: true, type: String }) reasonText!: string | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ type: CommercialUserRefDto }) performedBy!: CommercialUserRefDto;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({
    description: 'D-04.18: el usuario ejecutó el evento, tiene `visitas.editar` o `visitas.cerrar` y no han pasado 15 minutos (`occurredAt`). La subida lo vuelve a decidir',
  })
  canAttachFiles!: boolean;
}

// --- Opciones del formulario (F.3, D-04.10) ---

export class VisitStatusOptionDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ enum: VISIT_STATUS_GROUPS }) group!: VisitStatusGroup;
  @ApiProperty() isRescheduled!: boolean;
}

export class VisitCatalogOptionDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
}

export class VisitFormOptionsDto extends CommercialFormContextDto {
  @ApiProperty({ type: [VisitStatusOptionDto], description: 'Activos de `crm.estado_visita` (filtros)' }) statuses!: VisitStatusOptionDto[];
  @ApiProperty({ type: [VisitCatalogOptionDto], description: 'Activos de `crm.motivo_reprogramacion`' }) rescheduleReasons!: VisitCatalogOptionDto[];
  @ApiProperty({ type: [VisitCatalogOptionDto], description: 'Activos de `crm.motivo_cancelacion`' }) cancellationReasons!: VisitCatalogOptionDto[];
  @ApiProperty({ type: [VisitCatalogOptionDto], description: 'Activos de `crm.resultado_interaccion`' }) results!: VisitCatalogOptionDto[];
  @ApiProperty({ enum: SCHEDULE_CONFLICT_MODES }) conflictMode!: ScheduleConflictMode;
  @ApiProperty({ description: '`crm.visitas.duracion_por_defecto_minutos`' }) defaultDurationMinutes!: number;
  @ApiProperty({ type: [String], description: 'Base + `crm.campos_obligatorios.visit`' }) requiredFields!: string[];
  @ApiProperty({ type: [String], description: 'Base (`actualStartAt`) + `crm.campos_obligatorios.visitCompletion` (`participants` = asistentes)' })
  completionRequiredFields!: string[];
}
