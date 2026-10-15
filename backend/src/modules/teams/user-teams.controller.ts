import { Body, Controller, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';

import { ReplaceUserTeamsDto, UserTeamsResponseDto } from './dto/team.dto';
import { TeamsService } from './teams.service';

/**
 * Equipos de un usuario desde su ficha (07 F.2, D-07.4). Lo sirve el módulo de
 * equipos, dueño de las reglas de pertenencia, aunque la ruta cuelgue de
 * `/users`. Sin lógica: valida, delega en `TeamsService` y traduce a DTO.
 */
@ApiTags('Administración · Usuarios')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@Controller('users')
export class UserTeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly accessService: AccessService,
  ) {}

  @Put(':id/teams')
  @RequirePermission('equipos.editar')
  @ApiOperation({
    summary: 'Reemplaza los equipos del usuario',
    description:
      'Conjunto completo (≤ 50, sin repetir, como mucho un principal; lista vacía permitida). Mismas reglas que `PUT /teams/{id}/members`. ' +
      'Exige `equipos.editar` y ser administrador (addendum de 2026-10-10 a ADR-020, RN-07.10): 403 ADMIN_ONLY en otro caso. ' +
      'Audita `team.members_replaced` por cada equipo cuya composición cambia y `user.teams_replaced` sobre el usuario.',
  })
  @ApiOkResponse({ type: UserTeamsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incluye `teamId` repetido o más de 50 equipos)' })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'PERMISSION_DENIED: falta `equipos.editar` · ADMIN_ONLY: cambiar los equipos de un usuario es asignación de acceso y exclusiva de un usuario con el rol `administrador` vigente (addendum de ADR-020)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND: el usuario no existe' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: más de un equipo principal' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'UNKNOWN_REFERENCE: equipo inexistente o eliminado' })
  async replaceUserTeams(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ReplaceUserTeamsDto,
    @Req() request: AppRequest,
  ): Promise<UserTeamsResponseDto> {
    const teams = await this.teamsService.replaceUserTeams(
      userId,
      dto.teams.map((team) => ({ teamId: team.teamId, isPrimary: team.isPrimary })),
      await this.accessService.resolveActor(request),
    );
    return { teams: teams.map((team) => ({ id: team.teamId, name: team.teamName, isPrimary: team.isPrimary })) };
  }
}
