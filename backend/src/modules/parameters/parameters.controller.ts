import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { AppConfigService } from '@/config/app-config.service';
import { auditContextFrom } from '@/modules/audit/audit.service';

import { authenticationSettings } from './authentication-settings';
import {
  AuthenticationSettingsResponseDto,
  ParameterListResponseDto,
  ParameterResponseDto,
  UpdateParameterDto,
} from './dto/parameter.dto';
import type { SystemParameterRecord } from './ports/parameters.repository.port';
import { ruleFor } from './parameter-rules.registry';
import { isReadOnly, ParametersService, requiresConfigure } from './parameters.service';

function toResponse(parameter: SystemParameterRecord): ParameterResponseDto {
  const rule = ruleFor(parameter.key);
  const configure = requiresConfigure(parameter);
  return {
    key: parameter.key,
    value: parameter.value,
    type: parameter.type,
    group: parameter.group,
    name: parameter.name,
    description: parameter.description,
    isPublic: parameter.isPublic,
    isSystem: parameter.isSystem,
    requiresConfigurePermission: configure,
    requiresConfigure: configure,
    readOnly: isReadOnly(parameter),
    allowedValues: rule?.allowedValues ? [...rule.allowedValues] : null,
    editor: rule?.editor ?? null,
    range: rule?.range ? { ...rule.range } : null,
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
  constructor(
    private readonly parametersService: ParametersService,
    private readonly config: AppConfigService,
  ) {}

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

  @Get('authentication')
  @RequirePermission('parametros.ver')
  @ApiOperation({
    summary: 'Configuración de autenticación (solo lectura)',
    description:
      'Proveedor vigente desde la variable de despliegue `AUTH_PROVIDER` (D-07.8, RN-07.34): no es un parámetro y no se edita por la API. ' +
      'Nunca expone secretos, ids de tenant ni configuración de JWT. `securityParameterKeys` lista los parámetros de login local.',
  })
  @ApiOkResponse({ type: AuthenticationSettingsResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Falta el permiso parametros.ver' })
  authentication(): AuthenticationSettingsResponseDto {
    const settings = authenticationSettings(this.config.get('AUTH_PROVIDER'));
    return { provider: settings.provider, localLoginEnabled: settings.localLoginEnabled, securityParameterKeys: [...settings.securityParameterKeys] };
  }

  @Patch(':key')
  @RequirePermission('parametros.editar')
  @ApiOperation({
    summary: 'Cambia el valor de un parámetro',
    description: [
      'Sólo el valor es editable. Se valida por tipo: NUMBER (entero si el valor actual es entero), BOOLEAN (true/false), JSON válido, DATE ISO 8601, STRING de 1 a 1000 caracteres.',
      'Rangos de las claves conocidas: seguridad.intentos_fallidos_maximos 1–20; seguridad.minutos_bloqueo 1–1440;',
      'seguridad.dias_caducidad_password 0–365; auditoria.dias_retencion 30–3650; ui.paginacion_default 1–100.',
      'Las claves `crm.*` y `sistema.*` se validan además con el registro de reglas (D-07.7): rangos, listas de valores, esquema JSON y códigos de catálogo que deben existir y estar activos (los rangos se publican en `range` de `GET /parameters`).',
      'Los parámetros del grupo `seguridad` y los estructurales (`requiresConfigure`, incluido `auditoria.dias_retencion`) exigen además `parametros.configurar`. Los de solo lectura (`readOnly`, p. ej. `crm.moneda_base`) responden 409 SYSTEM_RESOURCE_READ_ONLY.',
      'Deja el evento `parameter.updated` en auditoría.',
    ].join(' '),
  })
  @ApiParam({ name: 'key', example: 'seguridad.minutos_bloqueo' })
  @ApiOkResponse({ type: ParameterResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: cuerpo inválido (falta `value` o campos no permitidos)' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Falta parametros.editar, o parametros.configurar en un parámetro del grupo seguridad o estructural',
  })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SYSTEM_RESOURCE_READ_ONLY: parámetro de solo lectura' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No existe un parámetro con esa clave' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'INVALID_PARAMETER_VALUE: `details[]` con `field` (ruta dentro del valor) e `issue` legible',
  })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateParameterDto,
    @Req() request: AppRequest,
  ): Promise<ParameterResponseDto> {
    const updated = await this.parametersService.updateValue(key, dto.value, request.principal!, auditContextFrom(request));
    return toResponse(updated);
  }
}
