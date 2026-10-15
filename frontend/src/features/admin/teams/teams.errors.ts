/**
 * Mensajes de error propios del área (ganan sobre los comunes de `describeApiError`).
 * Viven fuera de los componentes para que React Fast Refresh funcione.
 */
export const TEAM_FORM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un equipo con ese código (los códigos de equipos eliminados también quedan reservados).',
  RESOURCE_NOT_FOUND: 'El equipo padre o el responsable ya no existen. Actualiza y vuelve a intentarlo.',
  ADMIN_ONLY:
    'Sólo un administrador puede fijar o cambiar el responsable o el equipo padre, o activar o desactivar un equipo con miembros o subequipos (ADR-020).',
};

export const TEAM_MEMBERS_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_NOT_FOUND: 'El equipo o alguno de los usuarios ya no existe. Actualiza y vuelve a intentarlo.',
  ADMIN_ONLY: 'Sólo un administrador puede cambiar los miembros de un equipo (ADR-020).',
};

export const TEAM_DELETE_ERRORS: Readonly<Record<string, string>> = {
  HAS_CHILDREN: 'El equipo tiene miembros o subequipos. Quítalos o muévelos antes de eliminarlo.',
  ADMIN_ONLY: 'Sólo un administrador puede eliminar un equipo con miembros o subequipos (ADR-020).',
};

/**
 * 07 RN-07.45: explicación junto a responsable y equipo padre cuando quien
 * mira no es administrador. Deshabilitar es UX; el backend responde
 * `403 ADMIN_ONLY` igualmente.
 */
export const TEAM_HIERARCHY_ADMIN_ONLY_NOTE =
  'Sólo un administrador puede fijar o cambiar el responsable y el equipo padre (ADR-020).';

/**
 * Decisión del responsable 2026-10-14 (D1, RN-07.45): explicación junto al
 * interruptor «Activo» de un equipo con miembros o subequipos cuando quien mira
 * no es administrador. Deshabilitar es UX; el backend responde `403 ADMIN_ONLY`.
 */
export const TEAM_ACTIVE_ADMIN_ONLY_NOTE =
  'El equipo tiene miembros o subequipos: sólo un administrador puede activarlo o desactivarlo (ADR-020).';
