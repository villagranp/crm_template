import { AccessDeniedError } from '@/common/errors/application-error';
import { CONTROL_CHARACTERS } from '@/common/identity-claims';

/**
 * Reglas puras del acceso con Entra ID (ADR-027): correo utilizable, nombres derivados del
 * token y los tres errores 403 de la admisión. Sin base de datos ni servicios: se prueban solas.
 */

export const SSO_ERROR_CODES = {
  notLinked: 'IDENTITY_NOT_LINKED',
  incomplete: 'IDENTITY_INCOMPLETE',
  domainNotAllowed: 'IDENTITY_DOMAIN_NOT_ALLOWED',
  provisioningDisabled: 'SSO_PROVISIONING_DISABLED',
} as const;

const FIRST_NAME_MAX_LENGTH = 80;
const LAST_NAME_MAX_LENGTH = 80;
const DISPLAY_NAME_MAX_LENGTH = 160;
/** Apellido cuando el token trae un solo nombre: la columna es obligatoria y la edición exige 1–80. */
const LAST_NAME_PLACEHOLDER = '-';

function cleanText(value: string | undefined): string {
  return (value ?? '').replace(new RegExp(CONTROL_CHARACTERS.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

export interface DerivedNames {
  firstName: string;
  lastName: string;
  displayName: string;
}

/**
 * Nombres del usuario nuevo a partir del claim `name` (o, sin él, de la parte local del
 * correo). El primer término es el nombre y el resto el apellido; un solo término lleva
 * `-` de apellido. Se recorta a la longitud de cada columna.
 */
export function deriveNames(name: string | undefined, email: string): DerivedNames {
  const fromName = cleanText(name);
  const displayName = (fromName || (email.split('@')[0] ?? email)).slice(0, DISPLAY_NAME_MAX_LENGTH).trim();
  const [first = displayName, ...rest] = displayName.split(' ');
  return {
    firstName: first.slice(0, FIRST_NAME_MAX_LENGTH),
    lastName: rest.join(' ').slice(0, LAST_NAME_MAX_LENGTH).trim() || LAST_NAME_PLACEHOLDER,
    displayName,
  };
}

export function identityNotLinkedError(): AccessDeniedError {
  return new AccessDeniedError(
    SSO_ERROR_CODES.notLinked,
    'Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.',
  );
}

export function identityIncompleteError(): AccessDeniedError {
  return new AccessDeniedError(
    SSO_ERROR_CODES.incomplete,
    'Tu identidad corporativa no incluye un correo electrónico utilizable, por lo que no se puede crear tu cuenta. Contacta al administrador.',
  );
}

export function provisioningDisabledError(): AccessDeniedError {
  return new AccessDeniedError(
    SSO_ERROR_CODES.provisioningDisabled,
    'El alta automática de cuentas está desactivada y tu identidad corporativa aún no tiene una cuenta en esta aplicación. Contacta al administrador.',
  );
}

export function identityDomainNotAllowedError(): AccessDeniedError {
  return new AccessDeniedError(SSO_ERROR_CODES.domainNotAllowed, 'Tu correo no pertenece a un dominio autorizado. Contacta al administrador.');
}
