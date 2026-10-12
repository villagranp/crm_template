import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { toOptionalBoolean } from '@/modules/customers/dto/dto-transforms';

import {
  PROJECT_DATE_FIELDS,
  PROJECT_HISTORY_KINDS,
  PROJECT_SORT_FIELDS,
  type ProjectDateField,
  type ProjectHistoryKind,
  type ProjectSortField,
  TEAM_VIEW_SORT_FIELDS,
  type TeamViewSortField,
} from '../ports/projects.repository.port';
import { PROJECT_PRODUCT_SORT_FIELDS, type ProjectProductSortField } from '../ports/project-products.repository.port';

import { IsCalendarDateString, MAX_FILTER_VALUES, toList } from './dto-helpers';

const LIST_NOTE = 'Repetible: valores separados por comas (`a,b`) o el parámetro repetido; se combinan con O dentro del filtro';
const COMMERCIAL_STATUS_VALUE = /^(OPEN_STAGE(:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?|WON|LOST|NO_OPPORTUNITIES)$/;

function uuidList(): PropertyDecorator {
  return (target: object, property: string | symbol) => {
    IsOptional()(target, property);
    Transform(toList)(target, property);
    IsArray()(target, property);
    ArrayMaxSize(MAX_FILTER_VALUES)(target, property);
    IsUUID('all', { each: true })(target, property);
  };
}

/** 03 F.1 `ProjectQueryDto` (`GET /projects`). Todos los filtros se combinan con Y (RN-03.16). */
export class ProjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PROJECT_SORT_FIELDS, description: 'Por defecto `lastActivityAt desc`. Desempate estable por `id`' })
  @IsOptional()
  @IsIn(PROJECT_SORT_FIELDS)
  override sortBy?: ProjectSortField = undefined;

  @ApiPropertyOptional({ maxLength: 30, description: 'Contenido en el código' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ type: String, description: `Cliente(s). ${LIST_NOTE}` })
  @uuidList()
  customerId?: string[];

  @ApiPropertyOptional({ type: String, description: `País(es). ${LIST_NOTE}` })
  @uuidList()
  countryId?: string[];

  @ApiPropertyOptional({ maxLength: 120, description: 'Contenido en la ciudad (sin mayúsculas ni acentos)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ type: String, description: `Asesor(es). Se intersecta con el alcance (RN-03.18). ${LIST_NOTE}` })
  @uuidList()
  ownerId?: string[];

  @ApiPropertyOptional({ type: String, description: `Tipo(s) de proyecto. ${LIST_NOTE}` })
  @uuidList()
  projectTypeId?: string[];

  @ApiPropertyOptional({ type: String, description: `Fase(s) del cliente. ${LIST_NOTE}` })
  @uuidList()
  phaseId?: string[];

  @ApiPropertyOptional({ type: String, description: `Proyectos con al menos una oportunidad no eliminada en la(s) etapa(s), sin duplicar (RN-03.16). ${LIST_NOTE}` })
  @uuidList()
  stageId?: string[];

  @ApiPropertyOptional({
    type: String,
    example: 'OPEN_STAGE,WON',
    description: `Estado comercial (DEF-B): \`OPEN_STAGE\` (cualquier etapa abierta), \`OPEN_STAGE:<stageId>\`, \`WON\`, \`LOST\`, \`NO_OPPORTUNITIES\`. ${LIST_NOTE}`,
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @Matches(COMMERCIAL_STATUS_VALUE, { each: true })
  commercialStatus?: string[];

  @ApiPropertyOptional({ type: Boolean, description: '`true` = activos (fase no final, RN-03.15); `false` = finalizados; omitido = todos' })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: PROJECT_DATE_FIELDS, description: 'Obligatorio con `dateFrom`/`dateTo` (RN-03.17). Instantes comparados en `crm.zona_horaria_negocio`' })
  @ValidateIf((dto: ProjectQueryDto) => dto.dateField !== undefined || dto.dateFrom !== undefined || dto.dateTo !== undefined)
  @IsIn(PROJECT_DATE_FIELDS)
  dateField?: ProjectDateField;

  @ApiPropertyOptional({ format: 'date', description: 'Inclusive. `dateFrom > dateTo` → `422 INVALID_DATE_RANGE`' })
  @IsOptional()
  @IsCalendarDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Inclusive' })
  @IsOptional()
  @IsCalendarDateString()
  dateTo?: string;
}

/** 03 F.1 `TeamViewQueryDto` (`GET /projects/team-view`). */
export class TeamViewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TEAM_VIEW_SORT_FIELDS, description: 'Por defecto `lastActivityAt desc` (AC-03.27)' })
  @IsOptional()
  @IsIn(TEAM_VIEW_SORT_FIELDS)
  override sortBy?: TeamViewSortField = undefined;

  @ApiPropertyOptional({ type: String, description: `Equipo principal del responsable; un equipo fuera del alcance da vacío (AC-03.29). ${LIST_NOTE}` })
  @uuidList()
  teamId?: string[];

  @ApiPropertyOptional({ type: String, description: `Responsable(s). ${LIST_NOTE}` })
  @uuidList()
  ownerId?: string[];

  @ApiPropertyOptional({ type: String, description: `Fase(s). ${LIST_NOTE}` })
  @uuidList()
  phaseId?: string[];

  @ApiPropertyOptional({ type: String, description: `País(es). ${LIST_NOTE}` })
  @uuidList()
  countryId?: string[];

  @ApiPropertyOptional({ format: 'date', description: 'Última actualización desde (inclusive, zona del negocio)' })
  @IsOptional()
  @IsCalendarDateString()
  lastActivityFrom?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Hasta (inclusive). `from > to` → `422 INVALID_DATE_RANGE`' })
  @IsOptional()
  @IsCalendarDateString()
  lastActivityTo?: string;
}

export const OWNER_OPTION_PURPOSES = ['ASSIGN', 'FILTER'] as const;

export class OwnerOptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['displayName'], description: 'Siempre por nombre' })
  @IsOptional()
  @IsIn(['displayName'])
  override sortBy?: string = undefined;

  @ApiPropertyOptional({
    enum: OWNER_OPTION_PURPOSES,
    default: 'ASSIGN',
    description:
      '`ASSIGN`: asesores asignables (ACTIVE, `proyectos.ver`; sin `proyectos.administrar` solo el propio usuario). `FILTER`: responsables de proyectos visibles (filtro de búsqueda)',
  })
  @IsOptional()
  @IsIn(OWNER_OPTION_PURPOSES)
  purpose?: (typeof OWNER_OPTION_PURPOSES)[number];
}

export class ProjectHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['occurredAt'], description: 'Siempre más reciente primero' })
  @IsOptional()
  @IsIn(['occurredAt'])
  override sortBy?: string = undefined;

  @ApiPropertyOptional({ type: String, enum: PROJECT_HISTORY_KINDS, description: `Tipo(s) de entrada. ${LIST_NOTE}` })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(PROJECT_HISTORY_KINDS.length)
  @IsIn(PROJECT_HISTORY_KINDS, { each: true })
  kind?: ProjectHistoryKind[];
}

export class PhaseHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['changedAt'], description: 'Por fecha; `sortOrder` por defecto `desc`' })
  @IsOptional()
  @IsIn(['changedAt'])
  override sortBy?: string = undefined;
}

export class ProjectProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PROJECT_PRODUCT_SORT_FIELDS, description: 'Por defecto `sku asc`' })
  @IsOptional()
  @IsIn(PROJECT_PRODUCT_SORT_FIELDS)
  override sortBy?: ProjectProductSortField = undefined;
}
