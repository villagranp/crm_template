import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { AgendaService } from './agenda.service';
import { CommercialActorResolver } from './commercial-actor.resolver';
import { COMMERCIAL_VIEW_PERMISSIONS } from './commercial-activity-options.service';
import { AgendaCalendarDto, AgendaCalendarQueryDto, type AgendaItemDto, AgendaListQueryDto, PaginatedAgendaDto } from './dto/agenda.dto';
import {
  FollowUpTraceDto,
  FollowUpTraceQueryDto,
  type FollowUpRowDto,
  type InteractionDto,
  ListFollowUpsQueryDto,
  ListInteractionsQueryDto,
  PaginatedFollowUpsDto,
  PaginatedInteractionsDto,
} from './dto/interaction.dto';
import { InteractionsService } from './interactions.service';
import { toAgendaItemDto, toFollowUpRowDto, toFollowUpTraceDto, toInteractionDto } from './read-model.mapper';

const ANY_OF = 'Exige `actividades.ver` **o** `visitas.ver` (`@RequireAnyPermission`); cada fuente se filtra por su propio permiso y alcance.';
const FORBIDDEN = 'PERMISSION_DENIED: no tiene ninguno de los dos permisos';

/**
 * Agenda general (F-21, 04 F.3). Sin lógica: valida la forma, resuelve el actor y
 * delega en `AgendaService`.
 */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: FORBIDDEN })
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get()
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Agenda en vista listado (F-21)',
    description: `${ANY_OF} Visitas y actividades con fecha de agenda (RN-04.36; una reprogramada aparece una vez), paginadas y ordenables. Orden por defecto \`date\` ascendente.`,
  })
  @ApiOkResponse({ type: PaginatedAgendaDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `to` < `from`, `sortBy` fuera de la lista blanca)' })
  async list(@Query() query: AgendaListQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<AgendaItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.agenda.list(actor, { ...query, sortOrder: query.sortBy ? query.sortOrder : 'asc' });
    return PaginatedResponseDto.of(page.items.map(toAgendaItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('calendar')
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Agenda en vista calendario (F-21, D-04.12)',
    description: `${ANY_OF} Sin paginar: rango obligatorio de hasta 42 días y como mucho 500 eventos por fecha ascendente (\`truncated\` si había más).`,
  })
  @ApiOkResponse({ type: AgendaCalendarDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (falta `from`/`to`, `to` < `from`) · RANGE_TOO_WIDE (> 42 días)' })
  async calendar(@Query() query: AgendaCalendarQueryDto, @Req() request: AppRequest): Promise<AgendaCalendarDto> {
    const actor = await this.actors.fromRequest(request);
    const result = await this.agenda.calendar(actor, query);
    return { data: result.items.map(toAgendaItemDto), truncated: result.truncated };
  }
}

/** Historial de interacciones (F-24, 04 F.3, RN-04.33). */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: FORBIDDEN })
@Controller('interactions')
export class InteractionsController {
  constructor(
    private readonly interactions: InteractionsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get()
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Historial de interacciones (F-24)',
    description:
      `${ANY_OF} Lee la vista \`crm_interactions_v\`: visitas realizadas o confirmadas y actividades completadas de tipos con ` +
      '`isInteraction` (DM-22). Cada visita y actividad aparece una sola vez. Orden por defecto: más reciente primero.',
  })
  @ApiOkResponse({ type: PaginatedInteractionsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(@Query() query: ListInteractionsQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<InteractionDto>> {
    const actor = await this.actors.fromRequest(request);
    // Único orden (`occurredAt`); `sortOrder` por defecto `desc` (más reciente primero), invertible sin `sortBy`.
    const page = await this.interactions.list(actor, { ...query, sortOrder: query.sortOrder });
    return PaginatedResponseDto.of(page.items.map(toInteractionDto), page.page, page.pageSize, page.totalItems);
  }
}

/** Seguimiento comercial (F-23, 04 F.3, RN-04.34, D-04.9). */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: FORBIDDEN })
@Controller('follow-ups')
export class FollowUpsController {
  constructor(
    private readonly interactions: InteractionsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get()
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Seguimiento por cliente o por proyecto (F-23)',
    description:
      `${ANY_OF} Derivado de visitas y actividades (sin tabla): última interacción, próxima acción (fecha ≥ hoy en ` +
      '`crm.zona_horaria_negocio`, o la de la última interacción sin fecha), responsable, notas y adjuntos. Solo clientes/proyectos con ' +
      'alguna visita o actividad visible. Por proyecto, solo proyectos no eliminados.',
  })
  @ApiOkResponse({ type: PaginatedFollowUpsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async list(@Query() query: ListFollowUpsQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<FollowUpRowDto>> {
    const actor = await this.actors.fromRequest(request);
    // Por defecto `lastInteractionAt` descendente, igual que el `sortOrder` por defecto.
    const page = await this.interactions.followUps(actor, { ...query, sortOrder: query.sortOrder });
    return PaginatedResponseDto.of(page.items.map(toFollowUpRowDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('trace')
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Trazabilidad de un cliente o proyecto (AC-04.13)',
    description: `${ANY_OF} Exactamente uno de \`customerId\` o \`projectId\`. Fila de seguimiento, 50 últimas interacciones, próximas (20) y adjuntos (50).`,
  })
  @ApiOkResponse({ type: FollowUpTraceDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (ninguno o los dos identificadores)' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: sin visitas ni actividades visibles (no revela si existe)' })
  async trace(@Query() query: FollowUpTraceQueryDto, @Req() request: AppRequest): Promise<FollowUpTraceDto> {
    const actor = await this.actors.fromRequest(request);
    return toFollowUpTraceDto(await this.interactions.trace(actor, query));
  }
}
