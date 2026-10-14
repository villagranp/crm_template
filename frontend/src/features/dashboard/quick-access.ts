import type { MenuModule, MenuOptionNode } from '@/services/access';

/**
 * Accesos del panel (01 §E.6, D-01.12), calculados sobre `GET /me/menu`
 * (ADR-018): el frontend no declara opciones, sólo las ordena.
 */

export interface MenuEntry {
  option: MenuOptionNode;
  module: MenuModule;
}

/** Máximo de accesos rápidos (D-01.12). */
export const QUICK_ACCESS_LIMIT = 8;

/**
 * Módulos operativos del CRM, que van primero en los accesos rápidos (E.6,
 * D-01.12). Sólo ordena: las opciones siguen saliendo de `/me/menu`.
 */
export const CRM_OPERATIVE_MODULE_KEYS: readonly string[] = [
  'clientes',
  'proyectos',
  'actividad-comercial',
];

/** Opciones navegables del menú del usuario, en el orden del menú y sin el propio panel (`/`). */
export function menuEntries(modules: readonly MenuModule[]): MenuEntry[] {
  const collect = (module: MenuModule, options: readonly MenuOptionNode[]): MenuEntry[] =>
    options.flatMap((option) => [
      ...(option.path && option.path !== '/' ? [{ option, module }] : []),
      ...collect(module, option.children),
    ]);
  return modules.flatMap((module) => collect(module, module.options));
}

/** Hasta 8 accesos: primero los de los módulos operativos del CRM, después el resto, en el orden del menú. */
export function quickAccessSelection(
  entries: readonly MenuEntry[],
  limit = QUICK_ACCESS_LIMIT,
): MenuEntry[] {
  const isCrm = (entry: MenuEntry) => CRM_OPERATIVE_MODULE_KEYS.includes(entry.module.key);
  return [...entries.filter(isCrm), ...entries.filter((entry) => !isCrm(entry))].slice(0, limit);
}
