import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import {
  CreateOpportunityDto,
  OpportunityDetailDto,
  OpportunityFormOptionsDto,
  OpportunityHistoryDto,
  OpportunityMutationResponseDto,
  PaginatedOpportunitiesDto,
  StageSummaryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';
import { OpportunityFormOptionsQueryDto, OpportunityQueryDto, ProjectOpportunityQueryDto, StageSummaryQueryDto } from './dto/opportunity-query.dto';
import { OpportunityResultDto, OpportunityResultInputDto } from './dto/opportunity-result.dto';
import { CreateStageChangeDto } from './dto/stage-change.dto';
import { type OpportunityFilterRequest, OpportunitiesService, type SearchOpportunitiesRequest } from './opportunities.service';
import { OPPORTUNITY_PERMISSIONS } from './opportunity-constants';
import { OpportunityStageService } from './opportunity-stage.service';
import { toDetailDto, toFormOptionsDto, toHistoryDto, toMutationDto, toPaginatedOpportunitiesDto, toResultDto, toStageSummaryDto } from './opportunity.mapper';

const OPPORTUNITY_NOT_FOUND =
  'RESOURCE_NOT_FOUND: oportunidad inexistente, eliminada, de un proyecto eliminado o fuera del alcance de `oportunidades.ver` (mismo cuerpo en todos los casos)';
const PROJECT_NOT_FOUND = 'RESOURCE_NOT_FOUND: proyecto inexistente, eliminado o fuera del alcance de `oportunidades.ver` (mismo cuerpo en los tres casos)';
const UUID_400 = 'BAD_REQUEST: algún id de la ruta no es UUID (`ParseUUIDPipe`) · VALIDATION_FAILED: el cuerpo o la consulta no cumplen el DTO (campos extra incluidos)';
const LIST_400 = 'VALIDATION_FAILED: filtro u orden inválido (`sortBy` fuera de la lista blanca, `pageSize` > 100, `dateFrom`/`dateTo` sin `dateField`)';
const LIST_422 = 'INVALID_DATE_RANGE: `dateFrom > dateTo` o `decisionFrom > decisionTo` (`details[]`: `{ field, code, message, startField }`)';
const ESTIMATE_422 =
  'CURRENCY_REQUIRED (monto sin moneda) · REQUIRED_FIELD_MISSING (moneda sin monto) · CURRENCY_NOT_ALLOWED (`details[0]`: `{ field, code, currencyCode, allowedCurrencyCodes }`) · ' +
  'EXCHANGE_RATE_NOT_FOUND (`details[0]`: `{ field, code, currencyCode, date }`) · INVALID_OWNER';
const EDIT_403 =
  'PERMISSION_DENIED: sin `oportunidades.editar`, o ajena fuera del alcance de `oportunidades.administrar` · ' +
  'FIELD_NOT_EDITABLE: reasignar el asesor sin `oportunidades.administrar` (`details[0]`: `{ field: "ownerId", requiredPermission }`)';
const RESULT_422 =
  'RESULT_STAGE_MISMATCH · RESULT_REASON_REQUIRED · RESULT_PERCENT_REQUIRED · RESULT_PERCENT_NOT_ALLOWED · INVALID_PROGRESS (`min`, `max`) · ' +
  'INVALID_CATALOG_VALUE (motivo de otro catálogo, inactivo o cuyo `appliesTo` no incluye el resultado: `reason` = `NOT_FOUND` | `INACTIVE` | `NOT_APPLICABLE`)';

function filterRequest(query: Omit<OpportunityQueryDto, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'>): OpportunityFilterRequest {
  return {
    ...(query.search !== undefined ? { search: query.search } : {}),
    ...(query.projectId ? { projectIds: query.projectId } : {}),
    ...(query.customerId ? { customerIds: query.customerId } : {}),
    ...(query.stageId ? { stageIds: query.stageId } : {}),
    ...(query.ownerId ? { ownerIds: query.ownerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.outcome ? { outcomes: query.outcome } : {}),
    ...(query.decisionFrom ? { decisionFrom: query.decisionFrom } : {}),
    ...(query.decisionTo ? { decisionTo: query.decisionTo } : {}),
    ...(query.dateField ? { dateField: query.dateField } : {}),
    ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
    ...(query.dateTo ? { dateTo: query.dateTo } : {}),
  };
}

export function searchRequest(query: OpportunityQueryDto | ProjectOpportunityQueryDto): SearchOpportunitiesRequest {
  return {
    ...filterRequest(query),
    page: query.page,
    pageSize: query.pageSize,
    ...(query.sortBy ? { sortBy: query.sortBy } : {}),
    sortOrder: query.sortOrder,
  };
}

/**
 * Oportunidades y resultados (03 F.2: F-17, F-18). Sin lógica: valida la forma,
 * resuelve el actor, delega y traduce a DTO. Cada handler declara su permiso base; la
 * propiedad y el alcance de cada permiso los decide el servicio
 * (`opportunity-access-policy.ts`): fuera del alcance → `404`, dentro sin permiso → `403`.
 *
 * Las rutas estáticas (`form-options`, `stage-summary`) se declaran antes que `:id`.
 */
@ApiTags('Oportunidades')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('opportunities')
export class OpportunitiesController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly stages: OpportunityStageService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-17 · Lista y filtra el pipeline',
    description:
      'Solo oportunidades visibles (asesor de la oportunidad, o proyecto, en el alcance de `oportunidades.ver`; DM-13). Filtros con Y; `status` = DEF-A; ' +
      '`outcome` y `decisionFrom`/`decisionTo` sobre el resultado vigente. Montos: original + moneda y equivalente en USD (RN-03.83).',
  })
  @ApiOkResponse({ type: PaginatedOpportunitiesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: LIST_400 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: LIST_422 })
  async list(@Query() query: OpportunityQueryDto, @Req() request: AppRequest): Promise<PaginatedOpportunitiesDto> {
    const actor = await this.actors.fromRequest(request);
    return toPaginatedOpportunitiesDto(await this.opportunities.search(actor, searchRequest(query)));
  }

  @Get('form-options')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-17 · Opciones del formulario y del diálogo de etapa',
    description:
      'Etapas activas con su semántica, resultados (`stageOutcome`, `requiresReason`, `requiresAwardedPercent`), motivos (`appliesTo`), moneda base y valores por defecto. ' +
      'Con `?projectId=` añade las monedas admitidas para ese proyecto y la propuesta (RN-03.78).',
  })
  @ApiOkResponse({ type: OpportunityFormOptionsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `projectId` no es UUID' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
  async formOptions(@Query() query: OpportunityFormOptionsQueryDto, @Req() request: AppRequest): Promise<OpportunityFormOptionsDto> {
    const actor = await this.actors.fromRequest(request);
    return toFormOptionsDto(await this.opportunities.formOptions(actor, query.projectId));
  }

  @Get('stage-summary')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({
    summary: 'F-17 · Conteo por etapa (cabeceras del tablero)',
    description: 'Mismos filtros que la lista. Etapas activas por `metadata.order` (también con 0) y etapas inactivas que aún tienen oportunidades.',
  })
  @ApiOkResponse({ type: StageSummaryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: LIST_400 })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: LIST_422 })
  async stageSummary(@Query() query: StageSummaryQueryDto, @Req() request: AppRequest): Promise<StageSummaryDto> {
    const actor = await this.actors.fromRequest(request);
    return toStageSummaryDto(await this.opportunities.stageSummary(actor, filterRequest(query)));
  }

  @Get(':id')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-17 · Detalle', description: 'Con la tasa aplicada y su fecha, el resultado vigente, `allowedTransitions` y `capabilities`.' })
  @ApiOkResponse({ type: OpportunityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<OpportunityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    return toDetailDto(await this.opportunities.findOne(actor, id), await this.opportunities.outcomeLabels());
  }

  @Patch(':id')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-17 · Edita los datos (no la etapa)',
    description:
      'Omitido = sin cambio; `null` borra. La tasa y el equivalente en USD se recalculan **solo** si cambian `estimatedAmount`, `currencyCode` u `opportunityDate` (RN-03.82); ' +
      '`estimatedAmount` y `currencyCode` a `null` borran los cinco campos. `exchangeRate`, `exchangeRateDate` y `estimatedAmountUsd` no se aceptan (`400`). ' +
      'Sin cambios: `200` sin escribir ni auditar. Audita `crm.opportunity.updated` y actualiza `lastActivityAt` del proyecto.',
  })
  @ApiOkResponse({ type: OpportunityMutationResponseDto, description: '`warnings` con `EXCHANGE_RATE_STALE` si la tasa aplicada es antigua (RN-03.81)' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: ESTIMATE_422 })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOpportunityDto, @Req() request: AppRequest): Promise<OpportunityMutationResponseDto> {
    const actor = await this.actors.fromRequest(request);
    return toMutationDto(await this.opportunities.update(actor, id, dto), await this.opportunities.outcomeLabels());
  }

  @Post(':id/stage-changes')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-17/F-18 · Cambia la etapa (con resultado si cierra)',
    description:
      'Una transacción con la oportunidad bloqueada (`FOR UPDATE`). Transiciones de `crm.oportunidades.transiciones_etapa` (regla de respaldo para etapas no listadas); ' +
      'a etapa cerrada exige `oportunidades.cerrar` y el resultado en la misma operación; reabrir (cerrada → abierta) exige `oportunidades.administrar` y comentario, ' +
      'y anula el resultado (`CLEARED`). Nunca cambia la fase del proyecto. Audita `crm.opportunity.stage_changed` (+ `crm.opportunity_result.*`).',
  })
  @ApiCreatedResponse({ type: OpportunityDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: `${UUID_400} (p. ej. resultado sin \`decisionDate\`)` })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: `${EDIT_403} · a etapa cerrada sin \`oportunidades.cerrar\` · reabrir sin \`oportunidades.administrar\` en su alcance`,
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_STAGE_TRANSITION (`fromStageCode`, `toStageCode`) · STAGE_UNCHANGED · COMMENT_REQUIRED · RESULT_REQUIRED · RESULT_NOT_ALLOWED · ' +
      `INVALID_CATALOG_VALUE (\`toStageId\`) · ${RESULT_422} (campos con prefijo \`result.\`)`,
  })
  async changeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStageChangeDto,
    @Req() request: AppRequest,
  ): Promise<OpportunityDetailDto> {
    const actor = await this.actors.fromRequest(request);
    const view = await this.stages.changeStage(actor, id, {
      toStageId: dto.toStageId,
      ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
      ...(dto.result ? { result: dto.result } : {}),
    });
    return toDetailDto(view, await this.opportunities.outcomeLabels());
  }

  @Put(':id/result')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.close)
  @ApiOperation({
    summary: 'F-18 · Modifica el resultado vigente sin cambiar de etapa',
    description:
      'Propia (`oportunidades.editar` + `oportunidades.cerrar`) o ajena con `oportunidades.administrar` en su alcance. `WON` ↔ `PARTIAL` en Ganado; pasar a `LOST` exige reabrir ' +
      '(`422 RESULT_STAGE_MISMATCH`). Inserta historial `CHANGED` y audita `crm.opportunity_result.changed`; sin diferencias no escribe ni audita.',
  })
  @ApiOkResponse({ type: OpportunityResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: sin `oportunidades.cerrar`/`editar`, o ajena fuera del alcance de `administrar`' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'OPPORTUNITY_NOT_CLOSED: la oportunidad está en una etapa abierta (`details[0]`: `{ stageId, stageCode }`)' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: RESULT_422 })
  async updateResult(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OpportunityResultInputDto, @Req() request: AppRequest): Promise<OpportunityResultDto> {
    const actor = await this.actors.fromRequest(request);
    const result = await this.stages.updateResult(actor, id, dto);
    return toResultDto(result, await this.opportunities.outcomeLabels());
  }

  @Get(':id/history')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-17/F-18 · Historial de etapas y de resultados', description: 'Ambas listas del más reciente al más antiguo.' })
  @ApiOkResponse({ type: OpportunityHistoryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  async history(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<OpportunityHistoryDto> {
    const actor = await this.actors.fromRequest(request);
    return toHistoryDto(await this.opportunities.history(actor, id));
  }

  @Delete(':id')
  @RequirePermission(OPPORTUNITY_PERMISSIONS.delete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'F-17 · Elimina (lógico) una oportunidad abierta',
    description: '`oportunidades.eliminar` en su alcance. Las cerradas no se eliminan (conservan el resultado). Audita `crm.opportunity.deleted`.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: OPPORTUNITY_NOT_FOUND })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'OPPORTUNITY_CLOSED (`details[0]`: `{ stageId, stageCode }`) · OPPORTUNITY_HAS_DEPENDENCIES (`details[]`: `{ dependency: "activeProducts" | "openActivities", count }`)',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AppRequest): Promise<void> {
    const actor = await this.actors.fromRequest(request);
    await this.opportunities.remove(actor, id);
  }
}

/**
 * Oportunidades de un proyecto (03 F.1 `GET /projects/{id}/opportunities`, F.2 alta):
 * sección 4 de la ficha y selector del Módulo 4 (`?status=OPEN`).
 */
@ApiTags('Oportunidades')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED: sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
@Controller('projects/:projectId/opportunities')
export class ProjectOpportunitiesController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get()
  @RequirePermission(OPPORTUNITY_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-17 · Oportunidades del proyecto', description: 'Mismos filtros que `GET /opportunities` salvo `projectId` (p. ej. `?status=OPEN` para el Módulo 4).' })
  @ApiOkResponse({ type: PaginatedOpportunitiesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: `${UUID_400} · ${LIST_400}` })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: LIST_422 })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectOpportunityQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedOpportunitiesDto> {
    const actor = await this.actors.fromRequest(request);
    return toPaginatedOpportunitiesDto(await this.opportunities.searchInProject(actor, projectId, searchRequest(query)));
  }

  @Post()
  @RequirePermission(OPPORTUNITY_PERMISSIONS.create)
  @ApiOperation({
    summary: 'F-17 · Crea una oportunidad',
    description:
      'Proyecto propio, u ajeno con `oportunidades.administrar` en su alcance. Código `OPO-{año}-{seq}`, etapa inicial abierta (por defecto la del parámetro), ' +
      'fecha por defecto hoy en la zona del negocio, primera fila del historial de etapas y `lastActivityAt` del proyecto. La estimación se guarda con la foto del tipo de cambio.',
  })
  @ApiCreatedResponse({ type: OpportunityMutationResponseDto, description: 'Con cabecera `Location`; `warnings` con `EXCHANGE_RATE_STALE` si aplica (RN-03.81)' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: UUID_400 })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'PERMISSION_DENIED: sin `oportunidades.crear`, o proyecto ajeno fuera del alcance de `oportunidades.administrar` · FIELD_NOT_EDITABLE: otro asesor sin `oportunidades.administrar`',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `INVALID_INITIAL_STAGE · INVALID_CATALOG_VALUE (\`stageId\`) · ${ESTIMATE_422}` })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateOpportunityDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OpportunityMutationResponseDto> {
    const actor = await this.actors.fromRequest(request);
    const created = await this.opportunities.create(actor, projectId, dto);
    response.setHeader('Location', `/api/v1/opportunities/${created.record.id}`);
    return toMutationDto(created, await this.opportunities.outcomeLabels());
  }
}
