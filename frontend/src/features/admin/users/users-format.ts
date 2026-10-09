import type { ChipProps } from '@mui/material';

import type { AssignmentEffect, UserStatus } from './users.api';

/** Estado del usuario: texto + color (el color nunca va solo). */
export const USER_STATUS_VIEW: Record<UserStatus, { label: string; color: ChipProps['color'] }> = {
  INVITED: { label: 'Invitado', color: 'info' },
  ACTIVE: { label: 'Activo', color: 'success' },
  SUSPENDED: { label: 'Suspendido', color: 'error' },
  LOCKED: { label: 'Bloqueado', color: 'warning' },
};

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
};
