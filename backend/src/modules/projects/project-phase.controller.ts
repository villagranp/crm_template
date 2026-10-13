import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import { ProjectPhaseDto } from './dto/project.dto';
import { PhaseHistoryQueryDto } from './dto/project-query.dto';
import { CreatePhaseChangeDto, PaginatedPhaseHistoryDto, type PhaseHistoryItemDto } from './dto/project-subresources.dto';
import { PROJECT_PERMISSIONS } from './project-constants';
import { ProjectPhaseService } from './project-phase.service';
import { toPhaseHistoryItemDto, toProjectPhaseDto } from './project.mapper';
import { PROJECT_NOT_FOUND, PROJECT_UUID_400 } from './projects.controller';

export const EDIT_403 = 'PERMISSION_DENIED: sin `proyectos.editar`, o proyecto ajeno fuera del alcance de `proyectos.administrar` (`details[0].requiredPermission`)';

/**
 * Fase del cliente del proyecto (F-16). Cambiarla exige poder editar el proyecto
 * (propio, o ajeno con `proyectos.administrar`) y actualiza `lastActivityAt` en la
 * misma transacción (RN-03.9).
 */
@ApiTags('Proyectos · Fase del cliente')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
@Controller('projects/:id')
export class ProjectPhaseController {
  constructor(
    private readonly phases: ProjectPhaseService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('phase-history')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({ summary: 'F-16 · Historial de fase', description: 'Incluye la fila del alta (`fromPhase = null`). `sortOrder` por defecto `desc`.' })
  @ApiOkResponse({ type: PaginatedPhaseHistoryDto })
  async history(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query() query: PhaseHistoryQueryDto,
    @Req() request: AppRequest,
  ): Promise<PaginatedResponseDto<PhaseHistoryItemDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.phases.history(actor, projectId, { page: query.page, pageSize: query.pageSize, sortOrder: query.sortOrder });
    return PaginatedResponseDto.of(page.items.map(toPhaseHistoryItemDto), page.page, page.pageSize, page.totalItems);
  }

  @Post('phase-changes')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-16 · Cambia la fase y/o el porcentaje',
    description:
      'Fase de `crm.fase_cliente` (se admite retroceder y cambiar solo el porcentaje). Reglas de avance de `crm.proyectos.reglas_avance`, vigentes en cada petición. ' +
      'Inserta `project_phase_history` y nunca toca oportunidades (RN-03.36). Audita `crm.project.phase_changed` (comentario enmascarado).',
  })
  @ApiCreatedResponse({ type: ProjectPhaseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_PROGRESS (`details[0]`: `{ field: "progress", min, max }`) · PHASE_PROGRESS_RULE (`{ field: "progress", phaseCode, minimumProgress }`) · ' +
      'PHASE_UNCHANGED (`{ field: "phaseId" }`) · INVALID_CATALOG_VALUE',
  })
  async change(@Param('id', ParseUUIDPipe) projectId: string, @Body() dto: CreatePhaseChangeDto, @Req() request: AppRequest): Promise<ProjectPhaseDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectPhaseDto(await this.phases.change(actor, projectId, dto));
  }
}
