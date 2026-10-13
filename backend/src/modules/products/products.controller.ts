import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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

import {
  ConversionPreviewDto,
  PaginatedProductsDto,
  type ProductDto,
  ProductFamiliesDto,
  ProductsQueryDto,
  ResolveConversionQueryDto,
  UnitsOfMeasureDto,
} from './dto/product.dto';
import type { ProductRecord, UnitOfMeasureRecord } from './ports/product-catalog.reader.port';
import { ProductsService } from './products.service';

export const PRODUCT_VIEW_PERMISSION = 'productos.ver';
const PROJECT_VIEW_PERMISSION = 'proyectos.ver';

function toProductDto(record: ProductRecord): ProductDto {
  return {
    id: record.id,
    sku: record.sku,
    description: record.description,
    family: record.family,
    baseUnit: record.baseUnit,
    isActive: record.isActive,
  };
}

function toUnitDto(unit: UnitOfMeasureRecord): UnitsOfMeasureDto['data'][number] {
  return { id: unit.id, code: unit.code, name: unit.name, symbol: unit.symbol, dimension: unit.dimension };
}

/**
 * Lecturas del maestro de productos y de la conversión de unidades (03 F.4). Solo
 * lectura: el mantenimiento llega con el Módulo 7 (DM-23). Sin alcance de datos
 * (configuración); cada ruta declara su permiso.
 */
@ApiTags('Proyectos · Productos y unidades')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'PERMISSION_DENIED: falta el permiso del endpoint' })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'RATE_LIMIT_EXCEEDED' })
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({
    summary: 'F-19 · Busca en el catálogo local de productos',
    description: '`search` contenido en SKU o descripción (sin mayúsculas ni acentos); `isActive` por defecto `true`. Orden por `sku`.',
  })
  @ApiOkResponse({ type: PaginatedProductsDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED (incl. `pageSize` > 100, `familyId` no UUID)' })
  async search(@Query() query: ProductsQueryDto): Promise<PaginatedResponseDto<ProductDto>> {
    const page = await this.products.search({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      familyId: query.familyId,
      isActive: query.isActive,
    });
    return PaginatedResponseDto.of(page.items.map(toProductDto), page.page, page.pageSize, page.totalItems);
  }

  @Get('product-families')
  @RequirePermission(PRODUCT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-19 · Familias de producto activas', description: 'Lista sin paginar (catálogo pequeño).' })
  @ApiOkResponse({ type: ProductFamiliesDto })
  async families(): Promise<ProductFamiliesDto> {
    const families = await this.products.listFamilies();
    return { data: families.map((family) => ({ id: family.id, code: family.code, name: family.name, description: family.description })) };
  }

  @Get('units-of-measure')
  @RequirePermission(PROJECT_VIEW_PERMISSION)
  @ApiOperation({ summary: 'F-15 · Unidades de medida activas', description: 'Lista sin paginar.' })
  @ApiOkResponse({ type: UnitsOfMeasureDto })
  async units(): Promise<UnitsOfMeasureDto> {
    return { data: (await this.products.listUnits()).map(toUnitDto) };
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
