import type { ChipProps } from '@mui/material';

import { ApiError } from '@/services/api';

import type { AssignmentEffect, UserCountry, UserStatus } from './users.api';

/**
 * Estado del usuario: texto + color (el color nunca va solo). 07 B.1: no hay
 * booleano "activo"; `SUSPENDED` se presenta como "Inactivo" y `LOCKED` (por
 * intentos fallidos) como "Bloqueado temporalmente".
 */
export const USER_STATUS_VIEW: Record<UserStatus, { label: string; color: ChipProps['color'] }> = {
  INVITED: { label: 'Invitado', color: 'info' },
  ACTIVE: { label: 'Activo', color: 'success' },
  SUSPENDED: { label: 'Inactivo', color: 'default' },
  LOCKED: { label: 'Bloqueado temporalmente', color: 'warning' },
};

/** Etiqueta de quien tiene cuenta pero aún ningún acceso (ADR-027). Texto + color: el color no va solo. */
export const PENDING_ACCESS_LABEL = 'Pendiente de acceso';

/** País del usuario para tablas y detalle: "Guatemala (GT)" o "—". */
export function formatCountry(country: UserCountry | null): string {
  return country ? `${country.name} (${country.isoCode})` : '—';
}

export const EFFECT_LABEL: Record<AssignmentEffect, string> = {
  GRANT: 'Concedido',
  DENY: 'Denegado',
};

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : 'Nunca';
}

/** Mensajes de error propios del área (ganan sobre los comunes de `describeApiError`). */
export const USER_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un usuario con ese correo.',
  SELF_LOCKOUT: 'No puedes suspenderte ni quitarte tu propio rol de administrador.',
  LAST_ADMIN: 'Debe quedar al menos un administrador activo. Asigna el rol a otra persona antes.',
  INVALID_STATUS_TRANSITION: 'El usuario ya está en ese estado. Actualiza la pantalla.',
  UNKNOWN_REFERENCE: 'Alguno de los elementos seleccionados ya no existe. Actualiza y vuelve a intentarlo.',
  DEFAULT_PASSWORD_NOT_CONFIGURED: 'El servidor no tiene configurada una contraseña inicial.',
  CRM_PROFILE_INCOMPLETE: 'Para asignar un rol comercial el usuario necesita código de colaborador y país.',
};

/** 07 E.1: conflicto de `employeeCode` (`409 RESOURCE_CONFLICT`, `details[].field = "employeeCode"`). */
export const EMPLOYEE_CODE_CONFLICT_MESSAGE = 'Ya existe un usuario con ese código de colaborador.';

/** 07 RN-07.4: país inexistente o inactivo (`422 UNKNOWN_REFERENCE`, `details[].field = "countryId"`). */
export const COUNTRY_UNKNOWN_MESSAGE = 'El país elegido ya no existe o está inactivo. Elige otro.';

function detailField(error: unknown, code: string): string | null {
  if (!(error instanceof ApiError) || error.code !== code) {
    return null;
  }
  for (const detail of error.details) {
    if (typeof detail === 'object' && detail !== null && 'field' in detail) {
      const { field } = detail as { field: unknown };
      if (typeof field === 'string') {
        return field;
      }
    }
  }
  return null;
}

/**
 * Mensajes del área para un error concreto: un `409` por código de
 * colaborador no es un correo repetido, así que se distingue por
 * `details[].field`.
 */
export function userErrorMessages(error: unknown): Readonly<Record<string, string>> {
  if (detailField(error, 'RESOURCE_CONFLICT') === 'employeeCode') {
    return { ...USER_ERRORS, RESOURCE_CONFLICT: EMPLOYEE_CODE_CONFLICT_MESSAGE };
  }
  if (detailField(error, 'UNKNOWN_REFERENCE') === 'countryId') {
    return { ...USER_ERRORS, UNKNOWN_REFERENCE: COUNTRY_UNKNOWN_MESSAGE };
  }
  return USER_ERRORS;
}

/** Mensajes de `PUT /users/{id}/teams` (07 F.2). */
export const USER_TEAMS_ERRORS: Readonly<Record<string, string>> = {
  ADMIN_ONLY: 'Sólo un administrador puede cambiar los equipos de un usuario.',
  UNKNOWN_REFERENCE: 'Alguno de los equipos ya no existe. Actualiza y vuelve a intentarlo.',
  RESOURCE_CONFLICT: 'Un usuario sólo puede tener un equipo principal.',
};
