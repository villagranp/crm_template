import { ApiError, NETWORK_ERROR_CODE } from '@/services/api/api-error';

/**
 * Traducción de errores de la API a mensajes en español para el usuario,
 * común a todas las áreas del frontend.
 *
 * Cada área aporta sus propios mensajes por código (`overrides`): la
 * administración los de PLAN-ADMIN §3, el CRM los de cada módulo. Aquí sólo
 * viven los mensajes por estado HTTP y los códigos transversales del contrato
 * (API-STANDARDS).
 */

/** Códigos transversales del contrato con mensaje propio. */
export const COMMON_ERROR_CODES = {
  /** DC-6: error del ValidationPipe (400), con `details[].field` e `issue`. */
  validationFailed: 'VALIDATION_FAILED',
} as const;

const COMMON_MESSAGES_BY_CODE: Readonly<Record<string, string>> = {
  [COMMON_ERROR_CODES.validationFailed]: 'Revisa los datos del formulario.',
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
 * @param overrides Mensajes propios del área o de la pantalla por código (p. ej.
 *   `{ CUSTOMER_CODE_TAKEN: 'Ya existe un cliente con ese código en el país.' }`);
 *   ganan sobre los comunes.
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
    message: overrides[error.code] ?? COMMON_MESSAGES_BY_CODE[error.code] ?? statusMessage,
    issues: extractIssues(error.details),
    code: error.code,
    statusCode: error.statusCode,
    correlationId: error.correlationId,
  };
}
