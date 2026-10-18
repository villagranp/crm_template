import { ApiError } from '@/services/api/api-error';
import { AUTH_ERROR_CODES, SSO_ERROR_CODES } from '@/services/auth';

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
  ssoIdentityNotLinked:
    'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.',
  ssoIdentityIncomplete:
    'Tu identidad corporativa no trae un correo utilizable. Contacta al administrador.',
  ssoDomainNotAllowed:
    'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.',
  ssoAccountNotEnabled:
    'Tu cuenta no está habilitada en esta aplicación. Contacta al administrador.',
  ssoProvisioningDisabled: 'El alta automática está desactivada. Contacta al administrador.',
  ssoUnexpected:
    'No se pudo iniciar sesión con tu cuenta corporativa. Inténtalo de nuevo o contacta al administrador.',
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

/**
 * Mensaje para el fallo con el que vuelve un inicio de sesión por Entra ID (`GET /me` tras el
 * canje del código, o un error de MSAL). Se elige por `code`; nunca se muestra el texto crudo del
 * backend ni el de MSAL.
 */
export function getSsoErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return MESSAGES.ssoUnexpected;
  }

  // `GET /me` answers 401 when the linked account is suspended, locked or deleted.
  if (error.statusCode === HTTP_UNAUTHORIZED) {
    return MESSAGES.ssoAccountNotEnabled;
  }

  if (error.statusCode === HTTP_FORBIDDEN) {
    switch (error.code) {
      case SSO_ERROR_CODES.domainNotAllowed:
        return MESSAGES.ssoDomainNotAllowed;
      case SSO_ERROR_CODES.identityNotLinked:
        return MESSAGES.ssoIdentityNotLinked;
      case SSO_ERROR_CODES.identityIncomplete:
        return MESSAGES.ssoIdentityIncomplete;
      case SSO_ERROR_CODES.provisioningDisabled:
        return MESSAGES.ssoProvisioningDisabled;
      case AUTH_ERROR_CODES.accountDisabled:
        return MESSAGES.accountDisabled;
      default:
        return MESSAGES.ssoUnexpected;
    }
  }

  if (error.statusCode === NETWORK_FAILURE_STATUS) {
    return MESSAGES.network;
  }
  return MESSAGES.ssoUnexpected;
}
