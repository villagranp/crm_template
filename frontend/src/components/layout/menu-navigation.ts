import type { MenuModule, MenuOptionNode } from '@/services/access';

/**
 * Lógica pura de navegación del shell a partir de `GET /me/menu` (ADR-018).
 *
 * Aquí no se declara ninguna opción: sólo se clasifica y se recorre lo que el
 * backend concedió. Vive aparte de los componentes para probarla sin DOM.
 */

/**
 * Clave del módulo de inicio. Sus opciones se pintan sueltas en la sección
 * "Principal" del menú lateral en lugar de como grupo desplegable. Es la clave
 * del módulo sembrado por la plantilla, no una opción de menú.
 */
export const HOME_MODULE_KEY = 'inicio';

export interface MenuSections {
  /** Opciones del módulo de inicio, sin agrupar. */
  principal: MenuOptionNode[];
  /** Módulos de negocio: cada uno es un grupo desplegable. */
  modules: MenuModule[];
  /** Módulos de sistema (`isSystem`), al final del menú. */
  system: MenuModule[];
}

export function isActivePath(currentPath: string, optionPath: string | null): boolean {
  if (!optionPath) {
    return false;
  }
  if (optionPath === '/') {
    return currentPath === '/';
  }
  return currentPath === optionPath || currentPath.startsWith(`${optionPath}/`);
}

export function optionContainsPath(option: MenuOptionNode, currentPath: string): boolean {
  return (
    isActivePath(currentPath, option.path) ||
    option.children.some((child) => optionContainsPath(child, currentPath))
  );
}

export function moduleContainsPath(module: MenuModule, currentPath: string): boolean {
  return module.options.some((option) => optionContainsPath(option, currentPath));
}

/** Primera ruta navegable en orden de menú (recorrido en profundidad). */
export function firstNavigablePath(options: readonly MenuOptionNode[]): string | null {
  for (const option of options) {
    if (option.path) {
      return option.path;
    }
    const nested = firstNavigablePath(option.children);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** Todas las opciones con ruta, aplanadas en orden de menú. */
export function navigableOptions(modules: readonly MenuModule[]): MenuOptionNode[] {
  const collect = (options: readonly MenuOptionNode[]): MenuOptionNode[] =>
    options.flatMap((option) => [...(option.path ? [option] : []), ...collect(option.children)]);
  return modules.flatMap((module) => collect(module.options));
}

export function splitMenuSections(modules: readonly MenuModule[]): MenuSections {
  const principal = modules
    .filter((module) => module.key === HOME_MODULE_KEY)
    .flatMap((module) => module.options);
  const rest = modules.filter(
    (module) => module.key !== HOME_MODULE_KEY && module.options.length > 0,
  );

  return {
    principal,
    modules: rest.filter((module) => !module.isSystem),
    system: rest.filter((module) => module.isSystem),
  };
}

/** Clave del módulo que contiene la ruta actual, si alguno la contiene. */
export function activeModuleKey(
  modules: readonly MenuModule[],
  currentPath: string,
): string | null {
  return modules.find((module) => moduleContainsPath(module, currentPath))?.key ?? null;
}
