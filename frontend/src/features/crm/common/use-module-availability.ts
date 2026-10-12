import { useMenu } from '@/hooks/use-menu';
import type { MenuModule, MenuOptionNode } from '@/services/access';

/**
 * Disponibilidad de otro módulo del CRM a partir del menú del usuario (D-02.10).
 *
 * Un módulo "existe" para esta sesión cuando `GET /me/menu` contiene su opción
 * de menú: la semilla sólo crea una opción cuando su pantalla y su ruta están
 * entregadas (DM-32) y el backend sólo la devuelve si el usuario tiene su
 * `requiredPermission` (ADR-018). Así la ficha del cliente decide si pinta la
 * sección de Proyectos o el botón "Nueva actividad" sin acoplarse al código de
 * esas áreas ni sondear su API.
 *
 * Es experiencia de usuario, no seguridad: la API de cada módulo exige su
 * permiso igualmente.
 */

/** Claves de las opciones de menú que delatan que un módulo está entregado (02 §D-02.10). */
export const CRM_MODULE_OPTION_KEYS = {
  projects: 'proyectos-buscar',
  activities: 'actividad-actividades',
} as const;

export type ModuleAvailabilityStatus = 'loading' | 'available' | 'unavailable';

export interface ModuleAvailability {
  status: ModuleAvailabilityStatus;
  /** `true` sólo cuando el menú ya cargó y contiene la opción. */
  isAvailable: boolean;
  isLoading: boolean;
}

function optionTreeHasKey(options: readonly MenuOptionNode[], optionKey: string): boolean {
  return options.some((option) => option.key === optionKey || optionTreeHasKey(option.children, optionKey));
}

/** `true` si alguna opción (a cualquier profundidad) de algún módulo tiene esa clave. */
export function menuHasOption(modules: readonly MenuModule[] | undefined, optionKey: string): boolean {
  return (modules ?? []).some((module) => optionTreeHasKey(module.options, optionKey));
}

/**
 * @param optionKey Clave de la opción de menú del módulo (usa `CRM_MODULE_OPTION_KEYS`).
 *
 * Mientras el menú carga devuelve `loading` (la pantalla no debe hacer llamadas
 * al otro módulo todavía). Si el menú falla se considera `unavailable`: sin
 * menú no se puede afirmar que el módulo exista, y el shell ya muestra el error
 * del menú.
 */
export function useModuleAvailability(optionKey: string): ModuleAvailability {
  const menu = useMenu();

  if (menu.isPending && menu.fetchStatus !== 'idle') {
    return { status: 'loading', isAvailable: false, isLoading: true };
  }

  const isAvailable = menuHasOption(menu.data, optionKey);
  return { status: isAvailable ? 'available' : 'unavailable', isAvailable, isLoading: false };
}
