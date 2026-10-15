import type { ListQuery, Paginated } from '@/features/admin/common';
import { httpClient } from '@/services/api';

/**
 * Cliente de reglas de conversión (07 F.7, RN-07.36): lista paginada (`page`,
 * `pageSize`, `search`, `sortBy` = `createdAt`|`updatedAt`|`scope`|`factor`,
 * `sortOrder`, `isActive` = `true`|`false`|`all` y los filtros `scope` y
 * `fromUnitId`), alta y edición; **sin `DELETE`** (se desactiva con
 * `PATCH { isActive: false }`). `factor` viaja como cadena decimal
 * (`Decimal(19,8)`): `cantidad_destino = cantidad_origen × factor`.
 * Tipos de `backend/src/modules/products/dto/product-masters.dto.ts`.
 */

export const CONVERSION_SCOPES = ['GLOBAL', 'PRODUCT_FAMILY', 'PRODUCT', 'PROJECT_TYPE'] as const;
export type ConversionScope = (typeof CONVERSION_SCOPES)[number];

export interface ConversionUnitRef {
  id: string;
  code: string;
  symbol: string;
  name?: string;
  dimension?: string;
}

/** `UnitConversionRuleDto`. */
export interface ConversionRule {
  id: string;
  fromUnit: ConversionUnitRef;
  toUnit: ConversionUnitRef;
  factor: string;
  scope: ConversionScope;
  product: { id: string; sku: string; description: string } | null;
  productFamily: { id: string; code: string; name: string } | null;
  projectType: { id: string; code: string; label: string } | null;
  description: string | null;
  isActive: boolean;
  /** Origen = destino: el factor es 1 y no cambia (`409 CONVERSION_RULE_PROTECTED`, `identity_factor`). */
  isIdentity: boolean;
  /** Identidad `GLOBAL` de la unidad de tonelaje: no se desactiva ni cambia de factor. */
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversionRuleRequest {
  fromUnitId: string;
  /** Si no viaja, el backend usa la unidad de tonelaje configurada. */
  toUnitId?: string;
  factor: string;
  scope: ConversionScope;
  productId?: string;
  productFamilyId?: string;
  projectTypeId?: string;
  description?: string;
}

/** Origen, destino y ámbito son inmutables: la edición sólo admite factor, descripción y estado. */
export interface UpdateConversionRuleRequest {
  factor?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UnitOption {
  id: string;
  code: string;
  name: string;
  symbol: string;
  dimension: string;
}

export interface FamilyOption {
  id: string;
  code: string;
  name: string;
}

export interface ProductOption {
  id: string;
  sku: string;
  description: string;
}

export interface ProjectTypeOption {
  id: string;
  code: string;
  label: string;
}

const RULES_PATH = '/unit-conversion-rules';
/** `pageSize` máximo de la API: tope de las listas de opciones. */
const OPTIONS_PAGE_SIZE = 100;
const PRODUCT_SEARCH_PAGE_SIZE = 20;

export function listConversionRules(query: ListQuery): Promise<Paginated<ConversionRule>> {
  return httpClient.get<Paginated<ConversionRule>>(RULES_PATH, { query });
}

export function createConversionRule(body: CreateConversionRuleRequest): Promise<ConversionRule> {
  return httpClient.post<ConversionRule>(RULES_PATH, { body });
}

export function updateConversionRule(
  id: string,
  body: UpdateConversionRuleRequest,
): Promise<ConversionRule> {
  return httpClient.patch<ConversionRule>(`${RULES_PATH}/${id}`, { body });
}

/** Unidades activas (`productos.ver`). */
export async function listUnitOptions(): Promise<UnitOption[]> {
  const page = await httpClient.get<Paginated<UnitOption>>('/units-of-measure', {
    query: { isActive: 'true', pageSize: OPTIONS_PAGE_SIZE },
  });
  return page.data;
}

/** Familias activas (`productos.ver`). */
export async function listFamilyOptions(): Promise<FamilyOption[]> {
  const page = await httpClient.get<Paginated<FamilyOption>>('/product-families', {
    query: { isActive: 'true', pageSize: OPTIONS_PAGE_SIZE },
  });
  return page.data;
}

/** Productos activos que coinciden con `search` (SKU o descripción). */
export async function searchProductOptions(search: string): Promise<ProductOption[]> {
  const page = await httpClient.get<Paginated<ProductOption>>('/products', {
    query: { isActive: 'true', pageSize: PRODUCT_SEARCH_PAGE_SIZE, search: search || undefined },
  });
  return page.data;
}

/**
 * Tipos de proyecto activos (`crm.tipo_proyecto`) por los endpoints de
 * catálogos (`catalogos.ver`). No hay endpoint de opciones propio de
 * conversiones: sin ese permiso el ámbito «Tipo de proyecto» no se ofrece.
 */
export async function listProjectTypeOptions(): Promise<ProjectTypeOption[]> {
  const catalogs = await httpClient.get<{ data: { id: string; key: string }[] }>('/catalogs', {
    query: { search: 'crm.tipo_proyecto', pageSize: OPTIONS_PAGE_SIZE },
  });
  const catalog = catalogs.data.find((candidate) => candidate.key === 'crm.tipo_proyecto');
  if (!catalog) {
    return [];
  }
  const detail = await httpClient.get<{
    items: (ProjectTypeOption & { isActive: boolean; sortOrder: number })[];
  }>(`/catalogs/${catalog.id}`);
  return detail.items
    .filter((item) => item.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ id, code, label }) => ({ id, code, label }));
}

/** Clave del parámetro con la unidad de tonelaje: destino obligado de toda regla (RN-07.36). */
const TONNAGE_UNIT_KEY = 'crm.forecast.unidad_tonelaje';

/**
 * Código de la unidad de tonelaje configurada, leído de `GET /parameters`
 * (`parametros.ver`). `null` si no se encuentra. Sin ese permiso el llamador
 * no lo invoca y el destino queda libre: el servidor responde
 * `422 INVALID_CONVERSION_TARGET` si no es la unidad de tonelaje.
 */
export async function getTonnageUnitCode(): Promise<string | null> {
  const response = await httpClient.get<{
    data: { parameters: { key: string; value: string }[] }[];
  }>('/parameters');
  for (const group of response.data) {
    const parameter = group.parameters.find((candidate) => candidate.key === TONNAGE_UNIT_KEY);
    if (parameter) {
      return parameter.value;
    }
  }
  return null;
}
