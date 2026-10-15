import {
  describeApiError as describeCommonApiError,
  type ApiErrorView,
} from '@/lib/api-error-view';
import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';
import type { PaginatedResponse } from '@/types/api';

/**
 * Piezas comunes de los clientes de API de administración.
 *
 * Cada área tiene su propio `<area>.api.ts` (llamadas con `httpClient`) y su
 * propio `<area>.queries.ts` (hooks de TanStack Query). Aquí sólo vive lo que
 * comparten: la forma de una colección, la convención de claves de consulta y
 * los mensajes de los códigos de PLAN-ADMIN §3. La traducción genérica de
 * errores y la fábrica de claves viven en `@/lib` (D-02.11) para que otras
 * áreas las usen sin importar de la administración.
 */

export type { ApiErrorView, ListQuery };

/**
 * Colección paginada tal como la devuelve el backend
 * (`backend/src/common/dto/paginated-response.dto.ts`):
 * `{ data, pagination: { page, pageSize, totalItems, totalPages } }`.
 */
export type Paginated<TItem> = PaginatedResponse<TItem>;

/**
 * Fábrica de claves de consulta de un área de administración.
 *
 * Todas las claves de administración empiezan por `['admin', <área>]`, así que
 * una mutación invalida lo suyo con `invalidateQueries({ queryKey: keys.all })`
 * (o `keys.lists()` si el detalle sigue siendo válido) sin conocer las claves
 * de otras áreas.
 *
 * @example
 * export const roleKeys = createQueryKeys('roles');
 * useQuery({ queryKey: roleKeys.list(apiQuery), queryFn: () => listRoles(apiQuery) });
 */
export function createQueryKeys<TArea extends string>(area: TArea) {
  return createScopedQueryKeys('admin', area);
}

/** Códigos de error de negocio de la administración (PLAN-ADMIN §3). */
export const ADMIN_ERROR_CODES = {
  systemResourceReadOnly: 'SYSTEM_RESOURCE_READ_ONLY',
  roleInUse: 'ROLE_IN_USE',
  lastAdmin: 'LAST_ADMIN',
  selfLockout: 'SELF_LOCKOUT',
  routeNotRegistered: 'ROUTE_NOT_REGISTERED',
  menuCycle: 'MENU_CYCLE',
  teamCycle: 'TEAM_CYCLE',
  hasChildren: 'HAS_CHILDREN',
  catalogNotEmpty: 'CATALOG_NOT_EMPTY',
  invalidParameterValue: 'INVALID_PARAMETER_VALUE',
  invalidStatusTransition: 'INVALID_STATUS_TRANSITION',
  unknownReference: 'UNKNOWN_REFERENCE',
  invalidMenuStructure: 'INVALID_MENU_STRUCTURE',
  /** ADR-020: la operación cambia accesos y sólo la puede hacer un administrador. */
  adminOnly: 'ADMIN_ONLY',
  /** DC-6: error del ValidationPipe (400), con `details[].field` e `issue`. */
  validationFailed: 'VALIDATION_FAILED',
  /** 07 RN-07.23: el metadata no cumple el esquema del catálogo crm.*. */
  invalidCatalogMetadata: 'INVALID_CATALOG_METADATA',
  /** 07 RN-07.24/25/26: invariante, conjunto cerrado o código usado por un parámetro. */
  catalogInvariant: 'CATALOG_INVARIANT',
  /** 07 RN-07.37: la dimensión de una unidad ya referenciada no cambia. */
  unitDimensionLocked: 'UNIT_DIMENSION_LOCKED',
  /** 07 RN-07.36: la regla identidad o la unidad de tonelaje no se desactivan ni cambian de factor. */
  conversionRuleProtected: 'CONVERSION_RULE_PROTECTED',
  /** 07 RN-07.36: el ámbito y su referencia no son coherentes (`required` | `not_allowed`). */
  invalidConversionScope: 'INVALID_CONVERSION_SCOPE',
  /** 07 RN-07.36: el destino de una regla es la unidad de tonelaje configurada. */
  invalidConversionTarget: 'INVALID_CONVERSION_TARGET',
  /** 07 RN-07.44: ya hay una tasa para esa moneda y fecha de vigencia. */
  exchangeRateDuplicate: 'EXCHANGE_RATE_DUPLICATE',
  /** 07 RN-07.44: moneda USD, inexistente o inactiva, o tasa ≤ 0. */
  invalidExchangeRate: 'INVALID_EXCHANGE_RATE',
  /** 07 D-07.3: un rol comercial exige código de colaborador y país. */
  crmProfileIncomplete: 'CRM_PROFILE_INCOMPLETE',
} as const;

/**
 * Nota que sustituye a los editores de accesos cuando quien mira no es
 * administrador (ADR-020). Ocultarlos es experiencia de usuario: el backend
 * responde `403 ADMIN_ONLY` igualmente y es la autoridad.
 */
export const ADMIN_ONLY_NOTE = 'La asignación de accesos es exclusiva del administrador (ADR-020).';

const ADMIN_MESSAGES_BY_CODE: Readonly<Record<string, string>> = {
  [ADMIN_ERROR_CODES.systemResourceReadOnly]: 'Es un elemento del sistema y no se puede modificar desde la interfaz.',
  [ADMIN_ERROR_CODES.roleInUse]: 'El rol tiene usuarios asignados. Reasígnalos antes de eliminarlo.',
  [ADMIN_ERROR_CODES.lastAdmin]: 'Debe quedar al menos un administrador activo.',
  [ADMIN_ERROR_CODES.selfLockout]: 'No puedes suspenderte ni retirarte tu propio acceso de administración.',
  [ADMIN_ERROR_CODES.routeNotRegistered]: 'La ruta no corresponde a ninguna pantalla registrada.',
  [ADMIN_ERROR_CODES.menuCycle]: 'Una opción no puede quedar dentro de sí misma ni de una de sus opciones hijas.',
  [ADMIN_ERROR_CODES.teamCycle]: 'Un equipo no puede depender de sí mismo ni de uno de sus subequipos.',
  [ADMIN_ERROR_CODES.hasChildren]: 'Tiene elementos que dependen de él. Muévelos o elimínalos primero.',
  [ADMIN_ERROR_CODES.catalogNotEmpty]: 'El catálogo tiene elementos; sólo se puede eliminar si está vacío.',
  [ADMIN_ERROR_CODES.invalidParameterValue]: 'El valor no es válido para el tipo de este parámetro.',
  [ADMIN_ERROR_CODES.invalidStatusTransition]: 'El elemento ya está en ese estado. Actualiza la pantalla.',
  [ADMIN_ERROR_CODES.unknownReference]: 'Alguno de los elementos seleccionados ya no existe. Actualiza y vuelve a intentarlo.',
  [ADMIN_ERROR_CODES.invalidMenuStructure]: 'La estructura del menú no es válida: revisa el tipo, la ruta y el padre.',
  [ADMIN_ERROR_CODES.adminOnly]: 'Sólo un administrador puede asignar o modificar accesos.',
  [ADMIN_ERROR_CODES.validationFailed]: 'Revisa los datos del formulario.',
  [ADMIN_ERROR_CODES.invalidCatalogMetadata]: 'Los datos adicionales no cumplen el formato de este catálogo.',
  [ADMIN_ERROR_CODES.catalogInvariant]:
    'El cambio dejaría el catálogo incoherente, es un conjunto cerrado o un parámetro usa este valor.',
  [ADMIN_ERROR_CODES.unitDimensionLocked]:
    'La unidad ya se usa en productos, reglas de conversión o líneas: su dimensión no se puede cambiar.',
  [ADMIN_ERROR_CODES.conversionRuleProtected]:
    'Está protegido: la unidad de tonelaje y su regla identidad no se pueden desactivar, y el factor de una regla identidad no cambia.',
  [ADMIN_ERROR_CODES.invalidConversionScope]:
    'El ámbito no es coherente: elige la familia, el producto o el tipo de proyecto sólo si el ámbito lo pide.',
  [ADMIN_ERROR_CODES.invalidConversionTarget]: 'La unidad destino debe ser la unidad de tonelaje configurada.',
  [ADMIN_ERROR_CODES.exchangeRateDuplicate]:
    'Ya hay un tipo de cambio para esa moneda y fecha de vigencia. Corrige el existente.',
  [ADMIN_ERROR_CODES.invalidExchangeRate]:
    'El tipo de cambio no es válido: la moneda debe existir, estar activa y no ser USD, y la tasa debe ser mayor que 0.',
  [ADMIN_ERROR_CODES.crmProfileIncomplete]:
    'Para asignar un rol comercial el usuario necesita código de colaborador y país.',
};

/**
 * Traduce cualquier error de una consulta o mutación de administración a un
 * mensaje para el usuario: `describeApiError` de `@/lib/api-error-view` con
 * los mensajes de PLAN-ADMIN §3. Se elige por `code` y, si no hay uno
 * específico, por `statusCode`.
 *
 * @param overrides Mensajes propios de la pantalla por código (p. ej.
 *   `{ RESOURCE_CONFLICT: 'Ya existe un usuario con ese correo.' }`); ganan
 *   sobre los comunes.
 */
export function describeApiError(error: unknown, overrides: Readonly<Record<string, string>> = {}): ApiErrorView {
  return describeCommonApiError(error, { ...ADMIN_MESSAGES_BY_CODE, ...overrides });
}
