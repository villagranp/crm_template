import type { AppRequest } from '@/common/types/request-context';
import type { AccessService } from '@/modules/access/access.service';
import { auditContextFrom } from '@/modules/audit/audit.service';

import type { ProductDetailDto, ProductFamilyDetailDto, UnitConversionRuleDto, UnitOfMeasureDetailDto } from './dto/product-masters.dto';
import type { ProductDto } from './dto/product.dto';
import { isIdentityRule, isTonnageIdentity } from './master-data-rules';
import type { ProductRecord } from './ports/product-catalog.reader.port';
import type {
  ConversionRuleDetailRecord,
  ProductDetailRecord,
  ProductFamilyDetailRecord,
  UnitOfMeasureDetailRecord,
} from './ports/product-masters.repository.port';
import type { MasterActor } from './product-masters.service';

/** Permisos de los maestros comerciales (07 E.5, H.1). */
export const PRODUCT_VIEW_PERMISSION = 'productos.ver';
export const PRODUCT_CONFIGURE_PERMISSION = 'productos.configurar';
/** Las unidades activas también las leen los formularios de Proyectos y Forecast (03 F-15). */
export const PROJECT_VIEW_PERMISSION = 'proyectos.ver';

export const MASTER_UUID_400 = 'BAD_REQUEST: el id de la ruta no es UUID (`ParseUUIDPipe`) · VALIDATION_FAILED: cuerpo inválido o campos no admitidos';
export const UNKNOWN_REFERENCE_422 = 'UNKNOWN_REFERENCE: `details[0].field` con `issue` `not_found` | `inactive`';

/** Usuario local (para `created_by_id`/`updated_by_id`) y contexto de auditoría de quien escribe. */
export async function masterActorFrom(request: AppRequest, access: AccessService): Promise<MasterActor> {
  return {
    userId: request.principal ? await access.findUserIdForPrincipal(request.principal) : null,
    audit: auditContextFrom(request),
  };
}

export function toProductDto(record: ProductRecord): ProductDto {
  return {
    id: record.id,
    sku: record.sku,
    description: record.description,
    family: record.family,
    baseUnit: record.baseUnit,
    isActive: record.isActive,
  };
}

export function toProductDetailDto(record: ProductDetailRecord): ProductDetailDto {
  return { ...toProductDto(record), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

export function toFamilyDto(record: ProductFamilyDetailRecord): ProductFamilyDetailDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toUnitDto(record: UnitOfMeasureDetailRecord): UnitOfMeasureDetailDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    symbol: record.symbol,
    dimension: record.dimension,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** `tonnageUnitId`: unidad de tonelaje vigente, para marcar la identidad protegida. */
export function toRuleDto(record: ConversionRuleDetailRecord, tonnageUnitId: string): UnitConversionRuleDto {
  const shape = { fromUnitId: record.fromUnit.id, toUnitId: record.toUnit.id, scope: record.scope };
  return {
    id: record.id,
    fromUnit: record.fromUnit,
    toUnit: record.toUnit,
    factor: record.factor,
    scope: record.scope,
    product: record.product,
    productFamily: record.productFamily,
    projectType: record.projectType,
    description: record.description,
    isActive: record.isActive,
    isIdentity: isIdentityRule(shape),
    isProtected: isTonnageIdentity(shape, tonnageUnitId),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
