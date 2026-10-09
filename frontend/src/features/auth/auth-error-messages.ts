import { ApiError } from '@/services/api/api-error';
import { AUTH_ERROR_CODES } from '@/services/auth';

/**
 * Traduce los errores de la API de autenticación a mensajes para el usuario.
 *
 * Nunca se muestra el `message` crudo del backend: el texto sale de aquí y
 * se elige por `code` y `statusCode`, que son el contrato estable.
 */

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const NETWORK_FAILURE_STATUS = 0;

const MESSAGES = {
  invalidCredentials: 'El correo o la contraseña no son correctos.',
  accountDisabled: 'Tu cuenta está deshabilitada. Contacta al administrador del sistema.',
  tooManyAttempts: 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.',
  invalidLoginData: 'Revisa el correo y la contraseña.',
  network: 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
  loginUnexpected: 'No se pudo iniciar sesión. Inténtalo de nuevo más tarde.',
  invalidCurrentPassword: 'La contraseña actual no es correcta.',
  passwordPolicy: 'La nueva contraseña no cumple la política de contraseñas.',
  invalidPasswordData: 'Revisa los datos del formulario.',
  sessionExpired: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  changeUnexpected: 'No se pudo cambiar la contraseña. Inténtalo de nuevo más tarde.',
} as const;

export function getLoginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return MESSAGES.loginUnexpected;
  }

  switch (error.statusCode) {
    // Cualquier 401 recibe el mismo texto: distinguir "no existe" de
    // "contraseña incorrecta" permitiría enumerar cuentas.
    case HTTP_UNAUTHORIZED:
      return MESSAGES.invalidCredentials;
    case HTTP_FORBIDDEN:
      return error.code === AUTH_ERROR_CODES.accountDisabled
        ? MESSAGES.accountDisabled
        : MESSAGES.loginUnexpected;
    case HTTP_TOO_MANY_REQUESTS:
      return MESSAGES.tooManyAttempts;
    case HTTP_BAD_REQUEST:
      return MESSAGES.invalidLoginData;
    case NETWORK_FAILURE_STATUS:
      return MESSAGES.network;
    default:
      return MESSAGES.loginUnexpected;
  }
}

export type ChangePasswordErrorField = 'currentPassword' | 'newPassword';

export interface ChangePasswordError {
  /** Campo al que pertenece el error, si es de un campo concreto. */
  field?: ChangePasswordErrorField;
  message: string;
  /** Motivos de rechazo de la política, tal como los redacta el servidor. */
  reasons: string[];
}

/** Extrae `details[].issue`: el backend redacta los motivos en el idioma de la interfaz. */
function extractIssues(details: unknown[]): string[] {
  return details.flatMap((detail) => {
    if (typeof detail === 'object' && detail !== null && 'issue' in detail) {
      const { issue } = detail as { issue: unknown };
      return typeof issue === 'string' && issue.trim() ? [issue] : [];
    }
    return [];
  });
}

export function getChangePasswordError(error: unknown): ChangePasswordError {
  if (!(error instanceof ApiError)) {
    return { message: MESSAGES.changeUnexpected, reasons: [] };
  }

  if (
    error.statusCode === HTTP_UNPROCESSABLE &&
    error.code === AUTH_ERROR_CODES.invalidCurrentPassword
  ) {
    return { field: 'currentPassword', message: MESSAGES.invalidCurrentPassword, reasons: [] };
  }

  if (
    error.statusCode === HTTP_UNPROCESSABLE &&
    error.code === AUTH_ERROR_CODES.passwordPolicyViolation
  ) {
    return {
      field: 'newPassword',
      message: MESSAGES.passwordPolicy,
      reasons: extractIssues(error.details),
    };
  }

  switch (error.statusCode) {
    case HTTP_BAD_REQUEST:
      return { message: MESSAGES.invalidPasswordData, reasons: [] };
    case HTTP_UNAUTHORIZED:
      return { message: MESSAGES.sessionExpired, reasons: [] };
    case HTTP_TOO_MANY_REQUESTS:
      return { message: MESSAGES.tooManyAttempts, reasons: [] };
    case NETWORK_FAILURE_STATUS:
      return { message: MESSAGES.network, reasons: [] };
    default:
      return { message: MESSAGES.changeUnexpected, reasons: [] };
  }
}
