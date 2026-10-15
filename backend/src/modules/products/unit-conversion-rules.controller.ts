import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import type { Response } from 'express';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
import { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import {
  CreateUnitConversionRuleDto,
  PaginatedUnitConversionRulesDto,
  UnitConversionRuleDto,
  UnitConversionRulesQueryDto,
  UpdateUnitConversionRuleDto,
} from './dto/product-masters.dto';
import {
  MASTER_UUID_400,
  masterActorFrom,
  PRODUCT_CONFIGURE_PERMISSION,
  PRODUCT_VIEW_PERMISSION,
  toRuleDto,
  UNKNOWN_REFERENCE_422,
} from './product-masters.mappers';
import { UnitConversionRulesService } from './unit-conversion-rules.service';

/**
 * Reglas de conversión hacia la unidad de tonelaje (07 F.7, RN-07.36, D-07.9; 00 §2.3).
 * Sin `DELETE`: se desactiva con `PATCH isActive`. Origen, destino y ámbito son
 * inmutables. La vista previa que usan los formularios sigue en `GET /unit-conversions/resolve`.
 */
@ApiTags('Maestros comerciales · Reglas de conversión')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller('unit-conversion-rules')
export class UnitConversionRulesController {
  constructor(
    private readonly rules: UnitConversionRulesService,
    private readonly conversions: UnitConversionResolver,
    private readonly access: AccessService,
  ) {}

  @Get()
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Reglas de conversión',
    description:
      'Filtros `scope`, `fromUnitId`, `isActive` (defecto `true`, `all` = todas) y `search` (descripción o unidad de origen). ' +
      'Sin `sortBy`: código de la unidad de origen, ámbito y fecha de alta. `isProtected` marca la identidad de la unidad de tonelaje.',
  })
  @ApiOkResponse({ type: PaginatedUnitConversionRulesDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (filtros, `pageSize` > 100, `sortBy` no admitido)' })
  async search(@Query() query: UnitConversionRulesQueryDto): Promise<PaginatedResponseDto<UnitConversionRuleDto>> {
    const [page, tonnageUnit] = await Promise.all([this.rules.search(query), this.conversions.tonnageUnit()]);
    return PaginatedResponseDto.of(
      page.items.map((rule) => toRuleDto(rule, tonnageUnit.id)),
      page.page,
      page.pageSize,
      page.totalItems,
    );
  }

  @Get(':id')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-46 · Detalle de una regla (activa o no)' })
  @ApiOkResponse({ type: UnitConversionRuleDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UnitConversionRuleDto> {
    const [rule, tonnageUnit] = await Promise.all([this.rules.findById(id), this.conversions.tonnageUnit()]);
    return toRuleDto(rule, tonnageUnit.id);
  }

  @Post()
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'F-46 · Alta de regla de conversión',
    description:
      'Destino = unidad de tonelaje (si se omite `toUnitId`, se usa esa). Única por (origen, destino, ámbito). Audita `crm.unit_conversion_rule.created`.',
  })
  @ApiCreatedResponse({ type: UnitConversionRuleDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: `${MASTER_UUID_400} (incl. \`factor\` no positivo o no es cadena)` })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'RESOURCE_CONFLICT: ya existe para (origen, destino, ámbito), `details[].field` ∈ `fromUnitId`, `toUnitId`, `scope` · ' +
      'CONVERSION_RULE_PROTECTED (`reason = identity_factor`): identidad con factor ≠ 1',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_CONVERSION_TARGET (destino ≠ unidad de tonelaje) · INVALID_CONVERSION_SCOPE (`details[].issue` `required`|`not_allowed`) · ' +
      `${UNKNOWN_REFERENCE_422} (\`fromUnitId\`, \`productId\`, \`productFamilyId\`, \`projectTypeId\`)`,
  })
  async create(
    @Body() dto: CreateUnitConversionRuleDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UnitConversionRuleDto> {
    const record = await this.rules.create({ ...dto, scope: dto.scope ?? 'GLOBAL' }, await masterActorFrom(request, this.access));
    response.setHeader('Location', `/api/v1/unit-conversion-rules/${record.id}`);
    return toRuleDto(record, record.toUnit.id);
  }

  @Patch(':id')
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Corrige factor o descripción, activa o desactiva',
    description:
      'Origen, destino y ámbito no son editables (`400`). Cambiar el factor **no** reescribe las líneas existentes (cada una copió su factor). ' +
      'Reactivar o cambiar el factor revalida que el destino siga siendo la unidad de tonelaje y que el origen esté activo (`422`). ' +
      'Audita `crm.unit_conversion_rule.updated` con antes/después; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: UnitConversionRuleDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'CONVERSION_RULE_PROTECTED: `reason` `identity_factor` (factor de una identidad) | `tonnage_identity` (desactivar la identidad de la unidad de tonelaje)',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'Al reactivar o cambiar el factor: INVALID_CONVERSION_TARGET (el destino ya no es la unidad de tonelaje configurada) | UNKNOWN_REFERENCE (`field: "fromUnitId"`, `issue: "inactive"`: la unidad de origen está desactivada)',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitConversionRuleDto, @Req() request: AppRequest): Promise<UnitConversionRuleDto> {
    const [record, tonnageUnit] = await Promise.all([
      this.rules.update(id, dto, await masterActorFrom(request, this.access)),
      this.conversions.tonnageUnit(),
    ]);
    return toRuleDto(record, tonnageUnit.id);
  }
}
