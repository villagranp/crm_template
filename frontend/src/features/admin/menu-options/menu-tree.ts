import type { MenuOption, MenuOrderItem } from './menu-options.api';

export interface MenuTreeNode {
  option: MenuOption;
  depth: number;
  children: MenuTreeNode[];
}

export interface MenuTreeModule {
  module: MenuOption['module'];
  nodes: MenuTreeNode[];
}

const bySortOrder = (a: MenuOption, b: MenuOption) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);

/** Árbol por módulo y orden. Una opción cuyo padre no está en la lista se muestra en la raíz. */
export function buildMenuTree(options: readonly MenuOption[]): MenuTreeModule[] {
  const ids = new Set(options.map((option) => option.id));
  const childrenOf = new Map<string | null, MenuOption[]>();
  for (const option of options) {
    const parent = option.parentId && ids.has(option.parentId) ? option.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), option]);
  }

  const toNode = (option: MenuOption, depth: number, seen: Set<string>): MenuTreeNode => {
    seen.add(option.id);
    return {
      option,
      depth,
      children: (childrenOf.get(option.id) ?? [])
        .filter((child) => !seen.has(child.id))
        .sort(bySortOrder)
        .map((child) => toNode(child, depth + 1, seen)),
    };
  };

  const modules = new Map<string, MenuTreeModule>();
  const seen = new Set<string>();
  for (const root of (childrenOf.get(null) ?? []).sort(bySortOrder)) {
    const entry = modules.get(root.module.id) ?? { module: root.module, nodes: [] };
    entry.nodes.push(toNode(root, 0, seen));
    modules.set(root.module.id, entry);
  }
  return [...modules.values()];
}

/** La opción y todas sus descendientes: no pueden ser su padre (evita ciclos en el selector). */
export function withDescendants(options: readonly MenuOption[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const option of options) {
      if (option.parentId && result.has(option.parentId) && !result.has(option.id)) {
        result.add(option.id);
        grew = true;
      }
    }
  }
  return result;
}

const ORDER_STEP = 10;

/**
 * Mueve una opción una posición entre sus hermanas y renumera el grupo
 * (10, 20, 30…). Devuelve sólo los cambios, listos para `PUT /menu-options/order`.
 */
export function moveAmongSiblings(
  options: readonly MenuOption[],
  id: string,
  direction: 'up' | 'down',
): MenuOrderItem[] {
  const target = options.find((option) => option.id === id);
  if (!target) {
    return [];
  }
  const siblings = options
    .filter((option) => option.module.id === target.module.id && option.parentId === target.parentId)
    .sort(bySortOrder);
  const index = siblings.findIndex((option) => option.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) {
    return [];
  }

  const reordered = [...siblings];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith]!, reordered[index]!];

  return reordered
    .map((option, position) => ({ option, sortOrder: (position + 1) * ORDER_STEP }))
    .filter(({ option, sortOrder }) => option.sortOrder !== sortOrder)
    .map(({ option, sortOrder }) => ({ id: option.id, parentId: option.parentId, sortOrder }));
}

/** Mensajes propios del área (ganan sobre los comunes de `describeApiError`). */
export const MENU_OPTION_ERRORS: Readonly<Record<string, string>> = {
  RESOURCE_CONFLICT: 'Ya existe una opción con esa clave (las de opciones eliminadas también quedan reservadas).',
  SYSTEM_RESOURCE_READ_ONLY:
    'Es una opción del sistema: no se elimina ni cambia de ruta, tipo, permiso, padre ni visibilidad.',
  HAS_CHILDREN: 'La opción tiene opciones hijas. Muévelas o elimínalas primero.',
  INVALID_MENU_STRUCTURE: 'Un grupo no lleva ruta, una opción navegable sí, y el padre debe ser un grupo del mismo módulo.',
  UNKNOWN_REFERENCE: 'El módulo, el padre o el permiso ya no existen. Actualiza y vuelve a intentarlo.',
};
