import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireAnyPermission } from '@/common/decorators/require-any-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { CommercialActorResolver } from './commercial-actor.resolver';
import { COMMERCIAL_VIEW_PERMISSIONS, CommercialActivityOptionsService } from './commercial-activity-options.service';
import { type CommercialUserRefDto, OwnerOptionsQueryDto, PaginatedOwnerOptionsDto } from './dto/commercial-refs.dto';

/**
 * Opciones transversales del módulo (04 F.3, D-04.10). Visitas y actividades
 * comparten responsables, así que el endpoint admite **uno de** los permisos de ver
 * (`@RequireAnyPermission`, addendum ADR-008).
 */
@ApiTags('commercial-activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@Controller('commercial-activity')
export class CommercialActivityOptionsController {
  constructor(
    private readonly options: CommercialActivityOptionsService,
    private readonly actors: CommercialActorResolver,
  ) {}

  @Get('owner-options')
  @RequireAnyPermission(...COMMERCIAL_VIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Responsables y asesores asignables o filtrables',
    description:
      'Exige `actividades.ver` **o** `visitas.ver`. Usuarios ACTIVE con alguno de esos permisos efectivo, dentro de la unión de los ' +
      'alcances de ver del usuario (OWN: solo él). `search`: contenido en el nombre. Sin correo ni teléfono.',
  })
  @ApiOkResponse({ type: PaginatedOwnerOptionsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: no tiene ninguno de los dos permisos' })
  async ownerOptions(@Query() query: OwnerOptionsQueryDto, @Req() request: AppRequest): Promise<PaginatedResponseDto<CommercialUserRefDto>> {
    const actor = await this.actors.fromRequest(request);
    const page = await this.options.ownerOptions(actor, { page: query.page, pageSize: query.pageSize, search: query.search });
    return PaginatedResponseDto.of(
      page.items.map((user) => ({ id: user.id, displayName: user.displayName })),
      page.page,
      page.pageSize,
      page.totalItems,
    );
  }
}
