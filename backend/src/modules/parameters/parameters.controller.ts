import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { auditContextFrom } from '@/modules/audit/audit.service';

import { ParameterListResponseDto, ParameterResponseDto, UpdateParameterDto } from './dto/parameter.dto';
import type { SystemParameterRecord } from './ports/parameters.repository.port';
import { ParametersService, SECURITY_PARAMETER_GROUP } from './parameters.service';

function toResponse(parameter: SystemParameterRecord): ParameterResponseDto {
  return {
    key: parameter.key,
    value: parameter.value,
    type: parameter.type,
    group: parameter.group,
    name: parameter.name,
    description: parameter.description,
    isPublic: parameter.isPublic,
    isSystem: parameter.isSystem,
    requiresConfigurePermission: parameter.group === SECURITY_PARAMETER_GROUP,
    updatedAt: parameter.updatedAt.toISOString(),
  };
}

/**
 * Parámetros del sistema (PLAN-ADMIN, D10). Sólo lectura y edición del valor:
 * no hay POST ni DELETE porque un parámetro existe porque el código lo lee.
 */
@ApiTags('Administración · Parámetros')
@ApiBearerAuth()
@Controller('parameters')
export class ParametersController {
  constructor(private readonly parametersService: ParametersService) {}

  @Get()
  @RequirePermission('parametros.ver')
  @ApiOperation({
    summary: 'Parámetros del sistema agrupados por `group`',
    description: 'Incluye los no públicos. Colección acotada (decenas de filas): se devuelve completa, sin paginar.',
  })
  @ApiOkResponse({ type: ParameterListResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso parametros.ver' })
  async list(): Promise<ParameterListResponseDto> {
    const groups = await this.parametersService.listGrouped();
    return {
      data: groups.map((group) => ({ group: group.group, parameters: group.parameters.map(toResponse) })),
    };
  }

  @Patch(':key')
  @RequirePermission('parametros.editar')
  @ApiOperation({
    summary: 'Cambia el valor de un parámetro',
    description: [
      'Sólo el valor es editable. Se valida por tipo: NUMBER (entero si el valor actual es entero), BOOLEAN (true/false), JSON válido, DATE ISO 8601, STRING de 1 a 1000 caracteres.',
      'Rangos de las claves conocidas: seguridad.intentos_fallidos_maximos 1–20; seguridad.minutos_bloqueo 1–1440;',
      'seguridad.dias_caducidad_password 0–365; auditoria.dias_retencion 30–3650; ui.paginacion_default 1–100.',
      'Los parámetros del grupo `seguridad` exigen además `parametros.configurar`. Deja el evento `parameter.updated` en auditoría.',
    ].join(' '),
  })
  @ApiParam({ name: 'key', example: 'seguridad.minutos_bloqueo' })
  @ApiOkResponse({ type: ParameterResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo inválido (falta `value` o campos no permitidos)' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Falta parametros.editar, o parametros.configurar en un parámetro del grupo seguridad',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No existe un parámetro con esa clave' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INVALID_PARAMETER_VALUE' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateParameterDto,
    @Req() request: AppRequest,
  ): Promise<ParameterResponseDto> {
    const updated = await this.parametersService.updateValue(key, dto.value, request.principal!, auditContextFrom(request));
    return toResponse(updated);
  }
}
