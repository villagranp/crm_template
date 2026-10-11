import { ApiError, NETWORK_ERROR_CODE } from '@/services/api/api-error';
import type { PaginatedResponse } from '@/types/api';

/**
 * Piezas comunes de los clientes de API de administración.
 *
 * Cada área tiene su propio `<area>.api.ts` (llamadas con `httpClient`) y su
 * propio `<area>.queries.ts` (hooks de TanStack Query). Aquí sólo vive lo que
 * comparten: la forma de una colección, la convención de claves de consulta y
 * la traducción de errores a mensajes para el usuario.
 */

/**
 * Colección paginada tal como la devuelve el backend
 * (`backend/src/common/dto/paginated-response.dto.ts`):
 * `{ data, pagination: { page, pageSize, totalItems, totalPages } }`.
 */
export type Paginated<TItem> = PaginatedResponse<TItem>;

/** Parámetros de una consulta de lista, listos para `httpClient.get(path, { query })`. */
export type ListQuery = Record<string, string | number | undefined>;

/**
 * Fábrica de claves de consulta de un área.
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
  const all = ['admin', area] as const;
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (query: ListQuery) => [...all, 'list', query] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
  };
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
} as const;

/**
 * Nota que sustituye a los editores de accesos cuando quien mira no es
 * administrador (ADR-020). Ocultarlos es experiencia de usuario: el backend
 * responde `403 ADMIN_ONLY` igualmente y es la autoridad.
 */
export const ADMIN_ONLY_NOTE = 'La asignación de accesos es exclusiva del administrador (ADR-020).';

const MESSAGES_BY_CODE: Readonly<Record<string, string>> = {
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
};

const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';

const MESSAGES_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'Revisa los datos del formulario.',
  401: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'El elemento ya no existe. Actualiza la lista.',
  409: 'El cambio entra en conflicto con el estado actual. Actualiza y vuelve a intentarlo.',
  422: 'La operación no cumple una regla de negocio.',
  429: 'Demasiadas solicitudes. Espera un momento antes de volver a intentarlo.',
};

const SERVER_ERROR_MESSAGE = 'Ha ocurrido un error en el servidor. Inténtalo de nuevo más tarde.';
const UNEXPECTED_ERROR_MESSAGE = 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
const SERVER_ERROR_MIN_STATUS = 500;

export interface ApiErrorView {
  /** Mensaje en español para el usuario. Nunca es el `message` crudo del backend. */
  message: string;
  /** Motivos de `details[].issue` (validación de campos, política de contraseñas…). */
  issues: string[];
  /** Código estable del contrato, para ramificar (p. ej. resaltar un campo). `null` si no es un `ApiError`. */
  code: string | null;
  statusCode: number | null;
  /** ID de correlación para soporte; se puede mostrar como "Referencia". */
  correlationId?: string;
}

function extractIssues(details: unknown[]): string[] {
  return details.flatMap((detail) => {
    if (typeof detail === 'object' && detail !== null && 'issue' in detail) {
      const { issue } = detail as { issue: unknown };
      return typeof issue === 'string' && issue.trim() ? [issue] : [];
    }
    return [];
  });
}

/**
 * Traduce cualquier error de una consulta o mutación a un mensaje para el
 * usuario. Se elige por `code` y, si no hay uno específico, por `statusCode`.
 *
 * @param overrides Mensajes propios de la pantalla por código (p. ej.
 *   `{ RESOURCE_CONFLICT: 'Ya existe un usuario con ese correo.' }`); ganan
 *   sobre los comunes.
 */
export function describeApiError(error: unknown, overrides: Readonly<Record<string, string>> = {}): ApiErrorView {
  if (!(error instanceof ApiError)) {
    return { message: UNEXPECTED_ERROR_MESSAGE, issues: [], code: null, statusCode: null };
  }

  const statusMessage =
    error.code === NETWORK_ERROR_CODE
      ? NETWORK_ERROR_MESSAGE
      : (MESSAGES_BY_STATUS[error.statusCode] ??
        (error.statusCode >= SERVER_ERROR_MIN_STATUS ? SERVER_ERROR_MESSAGE : UNEXPECTED_ERROR_MESSAGE));

  return {
    message: overrides[error.code] ?? MESSAGES_BY_CODE[error.code] ?? statusMessage,
    issues: extractIssues(error.details),
    code: error.code,
    statusCode: error.statusCode,
    correlationId: error.correlationId,
  };
}
