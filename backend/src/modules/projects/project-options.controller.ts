import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { CustomerActorResolver } from '@/modules/customers/customer-actor.resolver';

import {
  type OwnerOptionDto,
  PaginatedOwnerOptionsDto,
  ProgressRuleDto,
  ProjectFormOptionsDto,
  TeamOptionsDto,
} from './dto/project-options.dto';
import { OwnerOptionsQueryDto } from './dto/project-query.dto';
import { PROJECT_PERMISSIONS } from './project-constants';
import { ProjectOptionsService } from './project-options.service';
import { toOwnerOptionDto, toProjectFormOptionsDto, toTeamOptionDto } from './project.mapper';

/**
 * Opciones de formulario y filtros del módulo (03 F.1, D-03.1 = D-02.1), con
 * `proyectos.ver`: nunca endpoints genéricos de administración. Se registra antes que
 * `ProjectsController` para que `/projects/form-options` no caiga en `/projects/:id`.
 */
@ApiTags('Proyectos · Opciones')
@ApiBearerAuth()
@ApiExtraModels(ProgressRuleDto)
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta `proyectos.ver`' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('projects')
export class ProjectOptionsController {
  constructor(
    private readonly options: ProjectOptionsService,
    private readonly actors: CustomerActorResolver,
  ) {}

  @Get('form-options')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Opciones del formulario y de los filtros de proyectos',
    description:
      'Países (con moneda), tipos, sectores, fases y etapas con su semántica, unidades, estados de producto, obligatorios (base + `crm.campos_obligatorios.project`), ' +
      'valores por defecto, moneda base, reglas de avance, unidad de tonelaje y límites de adjuntos. Solo elementos activos.',
  })
  @ApiOkResponse({ type: ProjectFormOptionsDto })
  async formOptions(): Promise<ProjectFormOptionsDto> {
    return toProjectFormOptionsDto(await this.options.formOptions());
  }

  @Get('owner-options')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Asesores asignables o filtrables',
    description:
      '`purpose=ASSIGN` (defecto): ACTIVE con `proyectos.ver`; sin `proyectos.administrar` solo el propio usuario, con él los de su alcance (D-03.16). ' +
      '`purpose=FILTER`: responsables de proyectos visibles. `search` por nombre o código de colaborador. Sin correo ni teléfono.',
  })
  @ApiOkResponse({ type: PaginatedOwnerOptionsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  async ownerOptions(@Query() query: OwnerOptionsQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<OwnerOptionDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.options.ownerOptions(actor, {
      purpose: query.purpose ?? 'ASSIGN',
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
    return PaginatedResponseDto.of(page.items.map(toOwnerOptionDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('team-options')
  @RequirePermission(PROJECT_PERMISSIONS.view)
  @ApiOperation({
    summary: 'Equipos dentro del alcance (filtro de la vista de equipo)',
    description:
      'ORGANIZATION: todos los activos. Si no: los equipos del alcance TEAM (con subequipos) y los equipos principales de los usuarios del alcance (propios o de su país).',
  })
  @ApiOkResponse({ type: TeamOptionsDto })
  async teamOptions(@Req() request: AppRequest): Promise<TeamOptionsDto> {
    const actor = await this.actors.fromRequest(request);
    return { data: (await this.options.teamOptions(actor)).map(toTeamOptionDto) };
  }
}
