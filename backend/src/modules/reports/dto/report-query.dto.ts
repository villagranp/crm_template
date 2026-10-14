import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/common/dto/pagination-query.dto';
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  OPPORTUNITY_STATUS_FILTERS,
  type OpportunityStatusFilter,
  VISIT_CATEGORIES,
  type VisitCategory,
} from '@/modules/commercial-metrics/metric-definitions';
import {
  ACTIVITY_DATE_BASES,
  type ActivityDateBasis,
  FORECAST_GROUP_BY,
  type ForecastGroupBy,
  OPPORTUNITY_DATE_BASES,
  type OpportunityDateBasis,
  PROJECT_DATE_BASES,
  PROJECT_SITUATIONS,
  type ProjectDateBasis,
  type ProjectSituation,
  VISIT_DATE_BASES,
  type VisitDateBasis,
} from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';

import {
  ACTIVITY_REPORT_SORT_FIELDS,
  type ActivityReportSortField,
  FORECAST_REPORT_SORT_FIELDS,
  type ForecastReportSortField,
  OPPORTUNITY_REPORT_SORT_FIELDS,
  type OpportunityReportSortField,
  PROJECT_REPORT_SORT_FIELDS,
  type ProjectReportSortField,
  VISIT_REPORT_SORT_FIELDS,
  type VisitReportSortField,
} from '../ports/reporting.repository.port';

/** Máximo de valores por filtro repetible (F.2). */
export const MAX_FILTER_VALUES = 50;
/** Búsqueda libre (H.2): ≤ 100 caracteres, escapada para `LIKE`. */
export const MAX_SEARCH_LENGTH = 100;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const COMMERCIAL_STATUS = /^(OPEN_STAGE(:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?|WON|LOST|NO_OPPORTUNITIES)$/;

/** Parámetro repetible (`?ownerId=a&ownerId=b`): siempre lista; los UUID en minúsculas. */
function toList({ value }: TransformFnParams): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return Array.isArray(value) ? value : [value];
}

function toUuidList(params: TransformFnParams): unknown {
  const list = toList(params);
  return Array.isArray(list) ? list.map((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : item)) : list;
}

/** Filtro repetible de UUID (máximo 50 valores). */
function UuidList(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: [String], format: 'uuid', description: `Repetible (máx. ${MAX_FILTER_VALUES}). ${description}` }),
    IsOptional(),
    Transform(toUuidList),
    IsArray(),
    ArrayMaxSize(MAX_FILTER_VALUES),
    IsUUID('all', { each: true }),
  );
}

/** Filtro repetible de un enumerado. */
function EnumList(values: readonly string[], description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ enum: values, isArray: true, description: `Repetible. ${description}` }),
    IsOptional(),
    Transform(toList),
    IsArray(),
    ArrayMaxSize(MAX_FILTER_VALUES),
    IsIn(values, { each: true }),
  );
}

function CalendarDateField(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-01', description }),
    IsOptional(),
    Matches(CALENDAR_DATE, { message: '$property must be a calendar date YYYY-MM-DD' }),
    IsISO8601({ strict: true }),
  );
}

const PERIOD_DESCRIPTION =
  'Período inclusivo (RN-05.8): `from` y `to` juntos o ninguno; `from ≤ to`; máximo 5 años (`422 PERIOD_TOO_LONG`). ' +
  'Sin período no se filtra por fecha (la pantalla envía su período por defecto, C.2).';

// ---------------------------------------------------------------------------
// F-34 Proyectos
// ---------------------------------------------------------------------------

export class ProjectReportFilterDto {
  @ApiPropertyOptional({ maxLength: MAX_SEARCH_LENGTH, description: 'Código, nombre del proyecto o razón social del cliente (sin acentos ni mayúsculas)' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @CalendarDateField(`Desde. ${PERIOD_DESCRIPTION}`) from?: string;
  @CalendarDateField('Hasta (incluido)') to?: string;

  @ApiPropertyOptional({ enum: PROJECT_DATE_BASES, description: 'Columna del período (C.2). Obligatoria si hay período: proyectos no tiene base por defecto' })
  @IsOptional()
  @IsIn(PROJECT_DATE_BASES)
  dateBasis?: ProjectDateBasis;

  @UuidList('País del proyecto') countryId?: string[];

  @ApiPropertyOptional({ maxLength: MAX_SEARCH_LENGTH, description: 'Ubicación (ciudad), contiene, sin acentos' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  city?: string;

  @UuidList('Asesor responsable (`projects.owner_id`)') ownerId?: string[];
  @UuidList('Cliente') customerId?: string[];
  @UuidList('Tipo de proyecto (`crm.tipo_proyecto`)') projectTypeId?: string[];
  @UuidList('Fase (`crm.fase_cliente`)') phaseId?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Repetible. Estado comercial (DEF-B): `OPEN_STAGE` (cualquier etapa abierta), `OPEN_STAGE:<stageId>`, `WON`, `LOST`, `NO_OPPORTUNITIES`',
    example: ['OPEN_STAGE', 'WON'],
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @Matches(COMMERCIAL_STATUS, { each: true, message: 'each value in commercialStatus must be OPEN_STAGE[:<stageId>], WON, LOST or NO_OPPORTUNITIES' })
  commercialStatus?: string[];

  @ApiPropertyOptional({ enum: PROJECT_SITUATIONS, default: 'ALL', description: '`ACTIVE` = fase no final (RN-05.15); `FINISHED` = fase final' })
  @IsOptional()
  @IsIn(PROJECT_SITUATIONS)
  situation?: ProjectSituation;
}

export class ProjectReportQueryDto extends ProjectReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: PROJECT_REPORT_SORT_FIELDS, description: 'Por defecto `lastActivityAt` descendente' })
  @IsOptional()
  @IsIn(PROJECT_REPORT_SORT_FIELDS)
  sortBy?: ProjectReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// F-35 Oportunidades
// ---------------------------------------------------------------------------

export class OpportunityReportFilterDto {
  @CalendarDateField(`Desde. ${PERIOD_DESCRIPTION}`) from?: string;
  @CalendarDateField('Hasta (incluido)') to?: string;

  @ApiPropertyOptional({
    enum: OPPORTUNITY_DATE_BASES,
    default: 'IDENTIFIED',
    description: 'Columna del período (C.2): `IDENTIFIED` = `opportunity_date`; `DECIDED` = fecha de decisión (solo con resultado); `UPDATED` = `updated_at`',
  })
  @IsOptional()
  @IsIn(OPPORTUNITY_DATE_BASES)
  dateBasis?: OpportunityDateBasis;

  @UuidList('Asesor de la oportunidad (`opportunities.owner_id`)') ownerId?: string[];
  @UuidList('Cliente del proyecto') customerId?: string[];
  @UuidList('País del proyecto') countryId?: string[];
  @EnumList(OPPORTUNITY_STATUS_FILTERS, 'RN-05.32 (combinados con OR): `WON` incluye `PARTIAL` (DM-15)') status?: OpportunityStatusFilter[];
  @UuidList('Etapa vigente') stageId?: string[];
  @UuidList('Producto asociado a la oportunidad (`EXISTS`, D-05.10)') productId?: string[];
  @UuidList('Familia de un producto asociado (`EXISTS`, D-05.10)') productFamilyId?: string[];
}

export class OpportunityReportQueryDto extends OpportunityReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: OPPORTUNITY_REPORT_SORT_FIELDS, description: 'Por defecto `updatedAt` descendente; `estimatedAmountUsd` ordena por el equivalente en USD' })
  @IsOptional()
  @IsIn(OPPORTUNITY_REPORT_SORT_FIELDS)
  sortBy?: OpportunityReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// F-36 Forecast
// ---------------------------------------------------------------------------

function YearMonthField(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: String, example: '2026-11', description }),
    IsOptional(),
    Matches(YEAR_MONTH, { message: '$property must be a month YYYY-MM' }),
  );
}

export class ForecastReportFilterDto {
  @YearMonthField('Mes inicial. `fromMonth` y `toMonth` juntos o ninguno; sin ellos, M+1…M+6 en la zona del negocio; máximo 24 meses (`422 PERIOD_TOO_LONG`)')
  fromMonth?: string;

  @YearMonthField('Mes final (incluido)') toMonth?: string;

  @UuidList('Proyecto') projectId?: string[];
  @UuidList('Cliente del proyecto') customerId?: string[];
  @UuidList('Producto') productId?: string[];
  @UuidList('Familia del producto') productFamilyId?: string[];
  @UuidList('Asesor de la línea (`forecast_lines.owner_id`)') ownerId?: string[];
  @UuidList('País del proyecto') countryId?: string[];
}

export class ForecastReportQueryDto extends ForecastReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: FORECAST_REPORT_SORT_FIELDS, description: 'Por defecto `period` (año y mes) ascendente' })
  @IsOptional()
  @IsIn(FORECAST_REPORT_SORT_FIELDS)
  sortBy?: ForecastReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class ForecastConsolidatedQueryDto extends ForecastReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, description: 'Grupos del primer nivel por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: FORECAST_GROUP_BY, default: 'MONTH', description: 'Primer nivel (RN-05.36). `MONTH` en orden cronológico; el resto por etiqueta' })
  @IsOptional()
  @IsIn(FORECAST_GROUP_BY)
  groupBy?: ForecastGroupBy;

  @ApiPropertyOptional({ enum: FORECAST_GROUP_BY, description: 'Segundo nivel opcional; distinto de `groupBy`' })
  @IsOptional()
  @IsIn(FORECAST_GROUP_BY)
  thenBy?: ForecastGroupBy;
}

/** Solo los filtros (el resumen no pagina). */
export class ForecastSummaryQueryDto extends ForecastReportFilterDto {}

// ---------------------------------------------------------------------------
// F-37 Visitas
// ---------------------------------------------------------------------------

export class VisitReportFilterDto {
  @CalendarDateField(`Desde. ${PERIOD_DESCRIPTION}`) from?: string;
  @CalendarDateField('Hasta (incluido)') to?: string;

  @ApiPropertyOptional({
    enum: VISIT_DATE_BASES,
    default: 'SCHEDULED',
    description: 'Columna del período (C.2): `SCHEDULED` = planificada **vigente** (una reprogramada cuenta una vez); `ACTUAL` = real; `CONFIRMED` = confirmación',
  })
  @IsOptional()
  @IsIn(VISIT_DATE_BASES)
  dateBasis?: VisitDateBasis;

  @UuidList('Asesor (`visits.owner_id`)') ownerId?: string[];
  @UuidList('Cliente') customerId?: string[];
  @UuidList('País **del cliente** (AC-05.19)') countryId?: string[];
  @UuidList('Proyecto vinculado') projectId?: string[];
  @EnumList(VISIT_CATEGORIES, 'Categoría de estado (RN-05.38): `SCHEDULED` incluye REPROGRAMADA') statusCategory?: VisitCategory[];
  @UuidList('Estado de `crm.estado_visita`') statusId?: string[];
}

export class VisitReportQueryDto extends VisitReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: VISIT_REPORT_SORT_FIELDS, description: 'Por defecto `scheduledStartAt` descendente' })
  @IsOptional()
  @IsIn(VISIT_REPORT_SORT_FIELDS)
  sortBy?: VisitReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// F-38 Actividades
// ---------------------------------------------------------------------------

export class ActivityReportFilterDto {
  @CalendarDateField(`Desde. ${PERIOD_DESCRIPTION}`) from?: string;
  @CalendarDateField('Hasta (incluido)') to?: string;

  @ApiPropertyOptional({
    enum: ACTIVITY_DATE_BASES,
    default: 'ACTIVITY_DATE',
    description: 'Columna del período (C.2): `ACTIVITY_DATE` = `COALESCE(scheduled_at, due_at)`; `DUE` = vencimiento; `COMPLETED` = `completed_at` (solo completadas)',
  })
  @IsOptional()
  @IsIn(ACTIVITY_DATE_BASES)
  dateBasis?: ActivityDateBasis;

  @UuidList('Responsable (`activities.owner_id`)') ownerId?: string[];
  @UuidList('Cliente') customerId?: string[];
  @UuidList('País **del cliente**') countryId?: string[];
  @UuidList('Tipo de actividad (`crm.tipo_actividad`)') typeId?: string[];
  @EnumList(ACTIVITY_CATEGORIES, 'Categoría (RN-05.41, D-05.5): pendientes y vencidas son disjuntas') statusCategory?: ActivityCategory[];
  @UuidList('Estado de `crm.estado_actividad`') statusId?: string[];
  @UuidList('Prioridad (`crm.prioridad`)') priorityId?: string[];
}

export class ActivityReportQueryDto extends ActivityReportFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: ACTIVITY_REPORT_SORT_FIELDS, description: 'Por defecto `activityDate` descendente' })
  @IsOptional()
  @IsIn(ACTIVITY_REPORT_SORT_FIELDS)
  sortBy?: ActivityReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// F-39 Exportación: los filtros del reporte, el orden de la pantalla y `format`; SIN
// paginación (enviar `page` o `pageSize` → 400 por `forbidNonWhitelisted`, F.5).
// ---------------------------------------------------------------------------

export const EXPORT_FORMATS = ['xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

function ExportFormatField(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'xlsx', description: 'Único formato en v1 (ADR-022)' }),
    IsOptional(),
    IsIn(EXPORT_FORMATS),
  );
}

function SortOrderField(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sin `sortBy`, se usa el orden por defecto de la pantalla' }),
    IsOptional(),
    IsIn(['asc', 'desc']),
  );
}

export class ProjectReportExportQueryDto extends ProjectReportFilterDto {
  @ApiPropertyOptional({ enum: PROJECT_REPORT_SORT_FIELDS, description: 'Mismo orden que la pantalla (por defecto `lastActivityAt` descendente)' })
  @IsOptional()
  @IsIn(PROJECT_REPORT_SORT_FIELDS)
  sortBy?: ProjectReportSortField;

  @SortOrderField() sortOrder?: 'asc' | 'desc';
  @ExportFormatField() format?: ExportFormat;
}

export class OpportunityReportExportQueryDto extends OpportunityReportFilterDto {
  @ApiPropertyOptional({ enum: OPPORTUNITY_REPORT_SORT_FIELDS, description: 'Mismo orden que la pantalla (por defecto `updatedAt` descendente)' })
  @IsOptional()
  @IsIn(OPPORTUNITY_REPORT_SORT_FIELDS)
  sortBy?: OpportunityReportSortField;

  @SortOrderField() sortOrder?: 'asc' | 'desc';
  @ExportFormatField() format?: ExportFormat;
}

export class ForecastReportExportQueryDto extends ForecastReportFilterDto {
  @ApiPropertyOptional({ enum: FORECAST_REPORT_SORT_FIELDS, description: 'Mismo orden que la pantalla (por defecto `period` ascendente)' })
  @IsOptional()
  @IsIn(FORECAST_REPORT_SORT_FIELDS)
  sortBy?: ForecastReportSortField;

  @SortOrderField() sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: FORECAST_GROUP_BY, description: 'Con `groupBy`, el libro añade la hoja "Consolidado" (todos los grupos)' })
  @IsOptional()
  @IsIn(FORECAST_GROUP_BY)
  groupBy?: ForecastGroupBy;

  @ApiPropertyOptional({ enum: FORECAST_GROUP_BY, description: 'Segundo nivel de "Consolidado"; exige `groupBy` y distinto de él' })
  @IsOptional()
  @IsIn(FORECAST_GROUP_BY)
  thenBy?: ForecastGroupBy;

  @ExportFormatField() format?: ExportFormat;
}

export class VisitReportExportQueryDto extends VisitReportFilterDto {
  @ApiPropertyOptional({ enum: VISIT_REPORT_SORT_FIELDS, description: 'Mismo orden que la pantalla (por defecto `scheduledStartAt` descendente)' })
  @IsOptional()
  @IsIn(VISIT_REPORT_SORT_FIELDS)
  sortBy?: VisitReportSortField;

  @SortOrderField() sortOrder?: 'asc' | 'desc';
  @ExportFormatField() format?: ExportFormat;
}

export class ActivityReportExportQueryDto extends ActivityReportFilterDto {
  @ApiPropertyOptional({ enum: ACTIVITY_REPORT_SORT_FIELDS, description: 'Mismo orden que la pantalla (por defecto `activityDate` descendente)' })
  @IsOptional()
  @IsIn(ACTIVITY_REPORT_SORT_FIELDS)
  sortBy?: ActivityReportSortField;

  @SortOrderField() sortOrder?: 'asc' | 'desc';
  @ExportFormatField() format?: ExportFormat;
}

// ---------------------------------------------------------------------------
// F-40 Dashboard y F-41 Embudo
// ---------------------------------------------------------------------------

export class DashboardQueryDto {
  @CalendarDateField(
    'Desde. `from` y `to` juntos o ninguno; `from ≤ to`; como mucho 24 meses de calendario (`422 PERIOD_TOO_LONG`). Sin período: los 12 meses cerrados anteriores + el mes en curso (zona del negocio)',
  )
  from?: string;

  @CalendarDateField('Hasta (incluido)') to?: string;

  @UuidList('País (del proyecto en oportunidades, proyectos y forecast; del cliente en visitas y actividades)') countryId?: string[];
  @UuidList('Asesor (responsable del registro de cada panel)') ownerId?: string[];
}

export class FunnelQueryDto {
  @CalendarDateField(`Desde (cohorte por fecha de identificación, \`opportunity_date\`). ${PERIOD_DESCRIPTION}`) from?: string;
  @CalendarDateField('Hasta (incluido)') to?: string;

  @UuidList('Etapas a mostrar (RN-05.56: los porcentajes se calculan siempre sobre el embudo completo del resto de filtros)') stageId?: string[];
  @UuidList('Cliente del proyecto') customerId?: string[];
  @UuidList('Tipo de cliente (`crm.tipo_empresa` del cliente del proyecto, D-05.8)') companyTypeId?: string[];
  @UuidList('Asesor de la oportunidad') ownerId?: string[];
  @UuidList('País del proyecto') countryId?: string[];
}
