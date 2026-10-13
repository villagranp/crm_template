import { Body, Controller, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import { ProjectClassificationDto } from './dto/project.dto';
import { UpdateClassificationDto } from './dto/project-subresources.dto';
import { ProjectClassificationService } from './project-classification.service';
import { PROJECT_PERMISSIONS } from './project-constants';
import { EDIT_403 } from './project-phase.controller';
import { toProjectClassificationDto } from './project.mapper';
import { PROJECT_NOT_FOUND, PROJECT_UUID_400 } from './projects.controller';

/**
 * Clasificación del proyecto (F-15). Exige poder editar el proyecto y actualiza
 * `lastActivityAt` en la misma transacción (RN-03.9). La vista previa de la regla es
 * `GET /unit-conversions/resolve` (módulo de productos).
 */
@ApiTags('Proyectos · Clasificación')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@ApiBadRequestResponse({ type: ErrorResponseDto, description: PROJECT_UUID_400 })
@ApiNotFoundResponse({ type: ErrorResponseDto, description: PROJECT_NOT_FOUND })
@Controller('projects/:id')
export class ProjectClassificationController {
  constructor(
    private readonly classification: ProjectClassificationService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Put('classification')
  @RequirePermission(PROJECT_PERMISSIONS.edit)
  @ApiOperation({
    summary: 'F-15 · Clasifica el proyecto',
    description:
      'Reemplaza la clasificación (omitido = `null`). `RULE`: regla vigente PROJECT_TYPE > GLOBAL hacia `crm.forecast.unidad_tonelaje`, foto de regla y factor, ' +
      '`tonelaje = round(cantidad × factor, 4, HALF_UP)`. `MANUAL`: tonelaje indicado, sin regla. `NONE`: sin tonelaje. Obligatorios de ' +
      '`crm.campos_obligatorios.project` entre tipo, sector, unidad y cantidad. Audita `crm.project.classified`.',
  })
  @ApiOkResponse({ type: ProjectClassificationDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: EDIT_403 })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'REQUIRED_FIELD_MISSING (unidad/cantidad con `RULE`, `manualTonnage` con `MANUAL`, obligatorios del parámetro) · INVALID_QUANTITY · INVALID_CATALOG_VALUE · ' +
      'UNKNOWN_REFERENCE (unidad) · CONVERSION_RULE_NOT_FOUND (`details[0]`: `{ field: "measureUnitId", code, fromUnitId, toUnitCode }`) · INVALID_CONVERSION_RULE',
  })
  async classify(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateClassificationDto,
    @Req() request: AppRequest,
  ): Promise<ProjectClassificationDto> {
    const actor = await this.actors.fromRequest(request);
    return toProjectClassificationDto(await this.classification.update(actor, projectId, dto));
  }
}
