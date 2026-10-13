import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

import { toLowerCaseUuid } from '@/common/dto/uuid-transform';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { IsCalendarDateString, MAX_FILTER_VALUES, toList, toUuidList } from '@/modules/projects/dto/dto-helpers';

import { OPPORTUNITY_DATE_FIELDS, OPPORTUNITY_SORT_FIELDS, type OpportunityDateField, type OpportunitySortField } from '../ports/opportunities.repository.port';
import { OUTCOMES } from '../opportunity-result-rules';

const LIST_NOTE = 'Repetible: valores separados por comas (`a,b`) o el parámetro repetido; se combinan con O dentro del filtro';
const DATE_NOTE = 'Fecha de calendario `YYYY-MM-DD`';

function uuidList(): PropertyDecorator {
  return (target: object, property: string | symbol) => {
    IsOptional()(target, property);
    Transform(toUuidList)(target, property);
    IsArray()(target, property);
    ArrayMaxSize(MAX_FILTER_VALUES)(target, property);
    IsUUID('all', { each: true })(target, property);
  };
}

/**
 * 03 F.2 consulta de `GET /opportunities` (lista y tablero del pipeline; selector del
 * Módulo 4 con `?projectId=&status=OPEN`). Filtros combinados con Y; siempre dentro del
 * alcance de `oportunidades.ver` (un filtro nunca lo amplía).
 */
export class OpportunityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OPPORTUNITY_SORT_FIELDS, description: 'Por defecto `updatedAt desc`. `estimatedAmountUsd` ordena por el equivalente en USD (RN-03.83). Desempate por `id`' })
  @IsOptional()
  @IsIn(OPPORTUNITY_SORT_FIELDS)
  override sortBy?: OpportunitySortField = undefined;

  @ApiPropertyOptional({ type: String, description: `Proyecto(s). ${LIST_NOTE}` })
  @uuidList()
  projectId?: string[];

  @ApiPropertyOptional({ type: String, description: `Cliente(s) del proyecto. ${LIST_NOTE}` })
  @uuidList()
  customerId?: string[];

  @ApiPropertyOptional({ type: String, description: `Etapa(s). ${LIST_NOTE}` })
  @uuidList()
  stageId?: string[];

  @ApiPropertyOptional({ type: String, description: `Asesor(es) de la oportunidad. ${LIST_NOTE}` })
  @uuidList()
  ownerId?: string[];

  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'], description: 'DEF-A: etapa con `isClosed = false` (`OPEN`) o `true` (`CLOSED`)' })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';

  @ApiPropertyOptional({ type: String, example: 'WON,PARTIAL', description: `Resultado vigente (\`WON\`, \`LOST\`, \`PARTIAL\`). ${LIST_NOTE}` })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(OUTCOMES.length)
  @IsIn(OUTCOMES, { each: true })
  outcome?: ('WON' | 'LOST' | 'PARTIAL')[];

  @ApiPropertyOptional({ format: 'date', description: `Fecha de decisión del resultado desde (exige resultado). ${DATE_NOTE}` })
  @IsOptional()
  @IsCalendarDateString()
  decisionFrom?: string;

  @ApiPropertyOptional({ format: 'date', description: `Fecha de decisión del resultado hasta. ${DATE_NOTE}` })
  @IsOptional()
  @IsCalendarDateString()
  decisionTo?: string;

  @ApiPropertyOptional({ enum: OPPORTUNITY_DATE_FIELDS, description: 'Campo de `dateFrom`/`dateTo` (obligatorio con ellos). `updatedAt` se compara como fecha en la zona del negocio' })
  @IsOptional()
  @IsIn(OPPORTUNITY_DATE_FIELDS)
  dateField?: OpportunityDateField;

  @ApiPropertyOptional({ format: 'date', description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date', description: DATE_NOTE })
  @IsOptional()
  @IsCalendarDateString()
  dateTo?: string;
}

/** `GET /projects/{projectId}/opportunities`: mismos filtros salvo `projectId` (03 F.1). */
export class ProjectOpportunityQueryDto extends OmitType(OpportunityQueryDto, ['projectId'] as const) {}

/** `GET /opportunities/stage-summary`: mismos filtros, sin paginación ni orden. */
export class StageSummaryQueryDto extends OmitType(OpportunityQueryDto, ['page', 'pageSize', 'sortBy', 'sortOrder'] as const) {}

export class OpportunityFormOptionsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Proyecto visible: añade `currencies` (monedas admitidas y por defecto, RN-03.78)' })
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  projectId?: string;
}
