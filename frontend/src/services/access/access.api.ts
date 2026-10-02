import { httpClient } from '@/services/api/http-client';

import type { MenuModule, Profile } from './access.types';

/** Perfil del usuario autenticado, con sus permisos efectivos ya resueltos. */
export function fetchProfile(): Promise<Profile> {
  return httpClient.get<Profile>('/me');
}

/**
 * Menú del usuario: sólo las opciones que tiene concedidas.
 *
 * El menú se calcula en el servidor a partir de las opciones asignadas a sus
 * roles más las concesiones y denegaciones directas. El frontend nunca filtra
 * el menú por su cuenta: mostrar una opción de más sería una fuga de
 * información sobre la estructura del sistema.
 */
export function fetchMenu(): Promise<MenuModule[]> {
  return httpClient.get<MenuModule[]>('/me/menu');
}
