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

import { CreateProductDto, ProductDetailDto, UpdateProductDto } from './dto/product-masters.dto';
import { ConversionPreviewDto, PaginatedProductsDto, type ProductDto, ProductsQueryDto, ResolveConversionQueryDto } from './dto/product.dto';
import {
  MASTER_UUID_400,
  masterActorFrom,
  PRODUCT_CONFIGURE_PERMISSION,
  PRODUCT_VIEW_PERMISSION,
  PROJECT_VIEW_PERMISSION,
  toProductDetailDto,
  toProductDto,
  UNKNOWN_REFERENCE_422,
} from './product-masters.mappers';
import { ProductMastersService } from './product-masters.service';
import { ProductsService } from './products.service';

export { PRODUCT_VIEW_PERMISSION } from './product-masters.mappers';

/**
 * Maestro de productos (03 F.4 lectura; 07 F.7 mantenimiento, DM-23) y vista previa de
 * la conversión de unidades. Sin alcance de datos (configuración); cada ruta declara
 * su permiso. Sin `DELETE`: un producto se desactiva con `PATCH isActive`.
 */
@ApiTags('Maestros comerciales · Productos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly masters: ProductMastersService,
    private readonly access: AccessService,
  ) {}

  @Get('products')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-19 / F-46 · Busca en el catálogo local de productos',
    description:
      '`search` contenido en SKU o descripción (sin mayúsculas ni acentos); `isActive` por defecto `true` (`all` = todos). ' +
      'Sin `sortBy`, orden por `sku` ascendente.',
  })
  @ApiOkResponse({ type: PaginatedProductsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `pageSize` > 100, `familyId` no UUID, `sortBy` no admitido)' })
  async search(@Query() query: ProductsQueryDto): Promise<PaginatedResponseDto<ProductDto>> {
    const page = await this.products.search({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      familyId: query.familyId,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return PaginatedResponseDto.of(page.items.map(toProductDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('products/:id')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-46 · Detalle de un producto (activo o no)' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDetailDto> {
    return toProductDetailDto(await this.masters.findProduct(id));
  }

  @Post('products')
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'F-46 · Alta de producto',
    description: 'SKU único (recortado, en mayúsculas); familia y unidad base activas. Audita `crm.product.created`.',
  })
  @ApiCreatedResponse({ type: ProductDetailDto, description: 'Con cabecera `Location`' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: `details[0].field = "sku"`' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `${UNKNOWN_REFERENCE_422} (\`familyId\`, \`baseUnitId\`)` })
  async create(@Body() dto: CreateProductDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response): Promise<ProductDetailDto> {
    const record = await this.masters.createProduct(dto, await masterActorFrom(request, this.access));
    response.setHeader('Location', `/api/v1/products/${record.id}`);
    return toProductDetailDto(record);
  }

  @Patch('products/:id')
  @RequirePermission(PRODUCT_CONFIGURE_PERMISSION)
  @ApiOperation({
    summary: 'F-46 · Edición, activación y desactivación de producto',
    description:
      'Omitido = sin cambio. Una familia o unidad base nueva debe estar activa; la actual se conserva aunque se haya desactivado. ' +
      'Audita `crm.product.updated` con antes/después; sin cambios no hay registro.',
  })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: MASTER_UUID_400 })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'RESOURCE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'RESOURCE_CONFLICT: `details[0].field = "sku"`' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: `${UNKNOWN_REFERENCE_422} (\`familyId\`, \`baseUnitId\`)` })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @Req() request: AppRequest): Promise<ProductDetailDto> {
    return toProductDetailDto(await this.masters.updateProduct(id, dto, await masterActorFrom(request, this.access)));
  }

  @Get('unit-conversions/resolve')
  @RequirePermission(PROJECT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-15 · Vista previa de la regla de conversión aplicable',
    description:
      'Hacia `crm.forecast.unidad_tonelaje`. Con `productId`: PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL (líneas); sin él: ' +
      'PROJECT_TYPE > GLOBAL (proyecto). Solo reglas activas; `rule = null` si no hay ninguna. El valor definitivo lo calcula cada caso de uso al guardar.',
  })
  @ApiOkResponse({ type: ConversionPreviewDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (falta `fromUnitId` o algún id no es UUID)' })
  async resolve(@Query() query: ResolveConversionQueryDto): Promise<ConversionPreviewDto> {
    const preview = await this.products.resolveConversion(query);
    if (!preview.rule) return { rule: null };
    const { rule } = preview;
    return {
      rule: {
        id: rule.ruleId,
        scope: rule.scope,
        factor: rule.factor,
        fromUnit: rule.fromUnit
          ? { id: rule.fromUnit.id, code: rule.fromUnit.code, symbol: rule.fromUnit.symbol }
          : { id: rule.fromUnitId, code: '', symbol: '' },
        toUnit: rule.toUnit,
      },
    };
  }
}
