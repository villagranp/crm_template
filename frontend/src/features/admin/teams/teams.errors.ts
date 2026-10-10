/**
 * Mensajes de error propios del área (ganan sobre los comunes de `describeApiError`).
 * Viven fuera de los componentes para que React Fast Refresh funcione.
 */
export const TEAM_FORM_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe un equipo con ese código (los códigos de equipos eliminados también quedan reservados).',
  RESOURCE_NOT_FOUND: 'El equipo padre o el responsable ya no existen. Actualiza y vuelve a intentarlo.',
};

export const TEAM_MEMBERS_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_NOT_FOUND: 'El equipo o alguno de los usuarios ya no existe. Actualiza y vuelve a intentarlo.',
};

export const TEAM_DELETE_ERRORS: Readonly<Record<string, string>> = {
  HAS_CHILDREN: 'El equipo tiene miembros o subequipos. Quítalos o muévelos antes de eliminarlo.',
};
