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

import { ACTIVITY_DUE_BUCKETS, type ActivityDueBucket, PENDING_BUCKET_FILTERS, type PendingBucketFilter } from '../activity-due-status';
import { ACTIVITY_ACTIONS, type ActivityAction } from '../activity-lifecycle';
import { ACTIVITY_SPECIFIC_FIELDS } from '../activity-type-fields';
import { ACTIVITY_SORT_FIELDS, type ActivitySortField, PENDING_SORT_FIELDS, type PendingSortField } from '../ports/activity.repository.port';

import {
  CommercialCatalogRefDto,
  CommercialCustomerRefDto,
  CommercialOpportunityDetailRefDto,
  CommercialOpportunityRefDto,
  CommercialPriorityRefDto,
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

const BY_TYPE = 'Campo específico: solo si el tipo lo admite (`metadata.fields`, RN-04.24); si no, `422 FIELD_NOT_APPLICABLE`.';

// ---------------------------------------------------------------------------
// Consultas (F.2)
// ---------------------------------------------------------------------------

export class ListActivitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACTIVITY_SORT_FIELDS, description: 'Por defecto `dueAt` ascendente (sin vencimiento al final)' })
  @IsOptional()
  @IsIn(ACTIVITY_SORT_FIELDS)
  override sortBy?: ActivitySortField = undefined;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.tipo_actividad`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  typeId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.estado_actividad`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  statusId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: `crm.prioridad`' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  priorityId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Repetible: responsables' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  ownerId?: string[];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'País del cliente' }) @IsOptional() @IsUUID() countryId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `scheduledFrom ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `scheduledTo ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledTo?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `dueFrom ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  dueFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `dueTo ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  dueTo?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Solo abiertas con vencimiento pasado (RN-04.31)' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  overdue?: boolean;
}

export class ListPendingActivitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PENDING_SORT_FIELDS, description: '`priority` (defecto): orden fijo RN-04.32 (ignora `sortOrder`). `dueAt`: vencimiento en `sortOrder`, sin vencimiento al final' })
  @IsOptional()
  @IsIn(PENDING_SORT_FIELDS)
  override sortBy?: PendingSortField = undefined;

  @ApiPropertyOptional({
    enum: PENDING_BUCKET_FILTERS,
    isArray: true,
    description: 'Repetible. `ALL` (defecto) o combinación (`bucket=DUE_SOON&bucket=PENDING`). Los contadores lo ignoran',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(PENDING_BUCKET_FILTERS.length)
  @IsIn(PENDING_BUCKET_FILTERS, { each: true })
  bucket?: PendingBucketFilter[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  ownerId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  typeId?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsUUID('all', { each: true })
  priorityId?: string[];

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
}

// ---------------------------------------------------------------------------
// Entrada (F.2)
// ---------------------------------------------------------------------------

export class ActivityCompletionDto {
  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: 'Fecha de finalización; por defecto ahora. No futura (`422 ACTUAL_DATE_IN_FUTURE`)' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `completedAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  completedAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Elemento activo de `crm.resultado_interaccion`. Al menos uno de `resultId` / `resultNotes` (`422 RESULT_REQUIRED`)' })
  @IsOptional()
  @IsUUID()
  resultId?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultNotes?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

export class ActivityCancellationDto {
  @ApiPropertyOptional({ maxLength: 1000, nullable: true, description: 'Se guarda en la auditoría, enmascarado (D-04.7, DM-29)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}

/** Campos comunes del alta y la edición. */
class ActivityFieldsDto {
  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Proyecto visible, no eliminado y **del cliente** (`422 PROJECT_CUSTOMER_MISMATCH`)' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Exige `projectId` (`422 OPPORTUNITY_REQUIRES_PROJECT`) y debe ser de ese proyecto' })
  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Responsable; por defecto el usuario. Otro exige `actividades.administrar` (`403`) y ser elegible (`422 OWNER_NOT_ELIGIBLE`)',
  })
  @ValidateIf(isPresent)
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Elemento activo de `crm.prioridad`; omitido en el alta: `crm.valores_por_defecto`' })
  @ValidateIf(isPresent)
  @IsUUID()
  priorityId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Solo estados abiertos (`isOpen`); completar y cancelar usan sus operaciones (`422 USE_LIFECYCLE_OPERATION`)',
  })
  @ValidateIf(isPresent)
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: BY_TYPE })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `scheduledAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  scheduledAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: 'Vencimiento (general)' })
  @IsOptional()
  @Matches(ISO_INSTANT, { message: `dueAt ${INSTANT_MESSAGE}` })
  @IsISO8601({ strict: true })
  dueAt?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440, nullable: true, description: BY_TYPE })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ type: [ParticipantInputDto], maxItems: MAX_PARTICIPANTS, description: `Reemplaza la lista. ${BY_TYPE}` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PARTICIPANTS)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInputDto)
  @IsParticipantList()
  participants?: ParticipantInputDto[];

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, description: BY_TYPE })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: `Elemento de \`crm.resultado_interaccion\`. ${BY_TYPE}` })
  @IsOptional()
  @IsUUID()
  resultId?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, description: BY_TYPE })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultNotes?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true, description: BY_TYPE })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nextAction?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, example: '2026-10-20', description: BY_TYPE })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: `nextActionDate ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  nextActionDate?: string | null;
}

export class CreateActivityDto extends ActivityFieldsDto {
  @ApiProperty({ format: 'uuid', description: 'Elemento activo de `crm.tipo_actividad`' })
  @IsUUID()
  typeId!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  subject!: string;

  @ApiProperty({ format: 'uuid', description: 'Cliente visible y activo (`404` / `422 CUSTOMER_INACTIVE`, 02 F.6.3)' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({
    type: ActivityCompletionDto,
    nullable: true,
    description: 'Gestión ya realizada: crea y completa en un paso (D-04.14). Exige `actividades.cerrar` y resultado; no admite `statusId`',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActivityCompletionDto)
  completion?: ActivityCompletionDto | null;
}

/** Campo omitido = sin cambio; `null` = quitar un opcional. */
export class UpdateActivityDto extends ActivityFieldsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cambiar el tipo revalida los campos ya guardados (RN-04.27)' })
  @ValidateIf(isPresent)
  @IsUUID()
  typeId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf(isPresent)
  @IsString()
  @Length(1, 200)
  subject?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Revalida proyecto, oportunidad y participantes; con contactos del cliente anterior como participantes → `422 INVALID_CONTACT`',
  })
  @ValidateIf(isPresent)
  @IsUUID()
  customerId?: string;
}

// ---------------------------------------------------------------------------
// Respuesta (F.2)
// ---------------------------------------------------------------------------

export class ActivityTypeRefDto extends CommercialCatalogRefDto {
  @ApiProperty({ enum: ACTIVITY_SPECIFIC_FIELDS, isArray: true, description: 'Campos específicos que admite el tipo (D-04.8)' })
  fields!: string[];

  @ApiProperty({ description: 'Cuenta como interacción en el historial (DM-22)' }) isInteraction!: boolean;
}

export class ActivityListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ACT-2026-000042' }) code!: string;
  @ApiProperty({ type: ActivityTypeRefDto }) type!: ActivityTypeRefDto;
  @ApiProperty() subject!: string;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: CommercialOpportunityRefDto, nullable: true }) opportunity!: CommercialOpportunityRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: CommercialStatusRefDto }) status!: CommercialStatusRefDto;
  @ApiProperty({ type: CommercialPriorityRefDto }) priority!: CommercialPriorityRefDto;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) scheduledAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) dueAt!: string | null;
  @ApiProperty({ enum: ACTIVITY_DUE_BUCKETS, nullable: true, description: 'RN-04.31; `null` si no está abierta' }) dueBucket!: ActivityDueBucket | null;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) result!: CommercialCatalogRefDto | null;
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({ enum: ACTIVITY_ACTIONS, isArray: true, description: 'Lo que el usuario puede hacer (misma política que autoriza)' })
  allowedActions!: ActivityAction[];
}

export class PaginatedActivitiesDto {
  @ApiProperty({ type: [ActivityListItemDto] }) data!: ActivityListItemDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
}

export class PendingActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ type: ActivityTypeRefDto }) type!: ActivityTypeRefDto;
  @ApiProperty() subject!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) dueAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) scheduledAt!: string | null;
  @ApiProperty({ enum: ACTIVITY_DUE_BUCKETS }) bucket!: ActivityDueBucket;
  @ApiProperty({ type: CommercialPriorityRefDto }) priority!: CommercialPriorityRefDto;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectRefDto, nullable: true }) project!: CommercialProjectRefDto | null;
  @ApiProperty({ type: CommercialStatusRefDto }) status!: CommercialStatusRefDto;
  @ApiProperty({ enum: ACTIVITY_ACTIONS, isArray: true }) allowedActions!: ActivityAction[];
}

export class PendingCountsDto {
  @ApiProperty() overdue!: number;
  @ApiProperty() dueSoon!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() total!: number;
}

export class PendingActivitiesResponseDto {
  @ApiProperty({ type: [PendingActivityDto] }) data!: PendingActivityDto[];
  @ApiProperty({ type: PaginationMetaDto }) pagination!: PaginationMetaDto;
  @ApiProperty({ type: PendingCountsDto, description: 'Ignoran `bucket`; respetan los demás filtros y el alcance' }) counts!: PendingCountsDto;
}

export class ActivityCompletionInfoDto {
  @ApiProperty({ format: 'date-time' }) completedAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) completedBy!: CommercialUserRefDto | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
}

export class ActivityDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ACT-2026-000042' }) code!: string;
  @ApiProperty({ type: ActivityTypeRefDto }) type!: ActivityTypeRefDto;
  @ApiProperty() subject!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: CommercialCustomerRefDto }) customer!: CommercialCustomerRefDto;
  @ApiProperty({ type: CommercialProjectDetailRefDto, nullable: true }) project!: CommercialProjectDetailRefDto | null;
  @ApiProperty({ type: CommercialOpportunityDetailRefDto, nullable: true }) opportunity!: CommercialOpportunityDetailRefDto | null;
  @ApiProperty({ type: CommercialUserRefDto }) owner!: CommercialUserRefDto;
  @ApiProperty({ type: CommercialStatusRefDto }) status!: CommercialStatusRefDto;
  @ApiProperty({ type: CommercialPriorityRefDto }) priority!: CommercialPriorityRefDto;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) scheduledAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) dueAt!: string | null;
  @ApiProperty({ enum: ACTIVITY_DUE_BUCKETS, nullable: true }) dueBucket!: ActivityDueBucket | null;
  @ApiProperty({ nullable: true, type: Number }) durationMinutes!: number | null;
  @ApiProperty({ type: [ParticipantDto] }) participants!: ParticipantDto[];
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ type: CommercialCatalogRefDto, nullable: true }) result!: CommercialCatalogRefDto | null;
  @ApiProperty({ nullable: true, type: String }) resultNotes!: string | null;
  @ApiProperty({ nullable: true, type: String }) nextAction!: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String, example: '2026-10-20' }) nextActionDate!: string | null;
  @ApiProperty({ type: ActivityCompletionInfoDto, nullable: true }) completion!: ActivityCompletionInfoDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) cancelledAt!: string | null;
  @ApiProperty() attachmentCount!: number;
  @ApiProperty({ enum: ['DIRECT', 'INHERITED'], description: '`INHERITED`: visible solo por su proyecto (solo lectura, DM-13)' })
  access!: 'DIRECT' | 'INHERITED';
  @ApiProperty({ enum: ACTIVITY_ACTIONS, isArray: true, description: 'Calculado con estado + permisos + propiedad; el backend vuelve a decidir' })
  allowedActions!: ActivityAction[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) createdBy!: CommercialUserRefDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: CommercialUserRefDto, nullable: true }) updatedBy!: CommercialUserRefDto | null;
}

// --- Opciones del formulario (F.3, D-04.10) ---

export class ActivityTypeOptionDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ enum: ACTIVITY_SPECIFIC_FIELDS, isArray: true }) fields!: string[];
  @ApiProperty() isInteraction!: boolean;
}

export class ActivityStatusOptionDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ enum: ['OPEN', 'COMPLETED', 'CANCELLED'], description: 'Semántica del estado; el formulario solo ofrece `OPEN`' })
  group!: 'OPEN' | 'COMPLETED' | 'CANCELLED';
}

export class ActivityPriorityOptionDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
  @ApiProperty() weight!: number;
}

export class CatalogOptionWithOrderDto extends CommercialCatalogRefDto {
  @ApiProperty() sortOrder!: number;
}

export class ActivityDefaultsDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: '`crm.valores_por_defecto["activity.priorityId"]`' }) priorityId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'Estado abierto inicial (RN-04.8)' }) statusId!: string | null;
}

export class ActivityFormOptionsDto {
  @ApiProperty({ type: [ActivityTypeOptionDto], description: 'Activos de `crm.tipo_actividad`' }) types!: ActivityTypeOptionDto[];
  @ApiProperty({ type: [ActivityStatusOptionDto], description: 'Activos de `crm.estado_actividad`' }) statuses!: ActivityStatusOptionDto[];
  @ApiProperty({ type: [ActivityPriorityOptionDto], description: 'Activos de `crm.prioridad`' }) priorities!: ActivityPriorityOptionDto[];
  @ApiProperty({ type: [CatalogOptionWithOrderDto], description: 'Activos de `crm.resultado_interaccion`' }) results!: CatalogOptionWithOrderDto[];
  @ApiProperty({ type: ActivityDefaultsDto }) defaults!: ActivityDefaultsDto;
  @ApiProperty({ type: [String], description: 'Base + `crm.campos_obligatorios.activity` (nombres de campo del DTO)' }) requiredFields!: string[];
  @ApiProperty({ description: '`crm.alertas.actividad_por_vencer_horas` (RN-04.31)' }) dueSoonHours!: number;
}
