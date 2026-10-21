import type { AuditContext } from '@/modules/audit/audit.service';

/**
 * Reglas puras del módulo de acceso, verificables sin base de datos.
 */

/**
 * RN-07.1: forma canónica del código de colaborador (recortado y en
 * mayúsculas). Es como se guarda, así que toda búsqueda por código la aplica
 * antes de comparar (alta, edición e importaciones).
 */
export function canonicalEmployeeCode(value: string): string {
  return value.trim().toUpperCase();
}

/** Lo que decide si una cuenta está pendiente de acceso: su estado y lo que tiene asignado, con vigencias. */
export interface PendingAccessInput {
  status: string;
  /** Asignaciones de rol (de cualquier vigencia); `isActive` es el estado del rol (los borrados no se pasan). */
  roles: readonly { expiresAt: Date | null; isActive: boolean }[];
  /** Concesiones directas de permiso (`GRANT`); las denegaciones no dan nada y no cuentan. */
  grantedPermissionExpiries: readonly (Date | null)[];
}

/**
 * **Definición única** de «pendiente de acceso» (ADR-027): la cuenta está `ACTIVE`, no tiene **ningún rol
 * vigente** (asignación sin caducar de un rol activo y no borrado) y **ningún permiso directo vigente**
 * (concesión `GRANT` sin caducar). Es lo que ve la lista (`pendingAccess` y su filtro), el alta y el
 * detalle; el filtro de la base la replica con la misma vigencia (`PrismaAccessRepository`).
 */
export function isPendingAccess(input: PendingAccessInput, now: Date = new Date()): boolean {
  const current = (expiresAt: Date | null): boolean => expiresAt === null || expiresAt > now;
  return (
    input.status === 'ACTIVE' &&
    !input.roles.some((role) => role.isActive && current(role.expiresAt)) &&
    !input.grantedPermissionExpiries.some(current)
  );
}

/** Rol cuyo último titular activo no puede perderse (PLAN-ADMIN D3). */
export const ADMIN_ROLE_CODE = 'administrador';

/** Códigos de error de negocio de PLAN-ADMIN §3 que emite este módulo. */
export const ACCESS_ERROR_CODES = {
  systemResourceReadOnly: 'SYSTEM_RESOURCE_READ_ONLY',
  roleInUse: 'ROLE_IN_USE',
  lastAdmin: 'LAST_ADMIN',
  selfLockout: 'SELF_LOCKOUT',
  routeNotRegistered: 'ROUTE_NOT_REGISTERED',
  menuCycle: 'MENU_CYCLE',
  hasChildren: 'HAS_CHILDREN',
  /** Transición de estado no aplicable (p. ej. reactivar a alguien activo). */
  invalidStatusTransition: 'INVALID_STATUS_TRANSITION',
  /** Un identificador referenciado (rol, permiso, opción, módulo) no existe. */
  unknownReference: 'UNKNOWN_REFERENCE',
  /** Estructura de menú no válida (GROUP con ruta, padre que no es GROUP…). */
  invalidMenuStructure: 'INVALID_MENU_STRUCTURE',
  /** 403: la operación cambia accesos y sólo la hace un administrador (ADR-020). */
  adminOnly: 'ADMIN_ONLY',
} as const;

/** Quién ejecuta una mutación: su usuario local (para D3 y trazabilidad) y su contexto de auditoría. */
export interface ActorContext {
  userId: string | null;
  audit: AuditContext;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
}

/**
 * Devuelve el id de un nodo que forma parte de un ciclo, o `null` si el árbol
 * es válido. Un padre que no está en la lista se trata como raíz externa.
 */
export function findCycle(nodes: readonly TreeNode[]): string | null {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const safe = new Set<string>();

  for (const node of nodes) {
    const path = new Set<string>();
    let current: string | null | undefined = node.id;

    while (current && !safe.has(current)) {
      if (path.has(current)) {
        return current;
      }
      path.add(current);
      current = parentOf.get(current);
    }

    for (const visited of path) {
      safe.add(visited);
    }
  }

  return null;
}

/** Ids pedidos que no aparecen entre los existentes, sin repetir. */
export function missingIds(requested: readonly string[], existing: readonly string[]): string[] {
  const found = new Set(existing);
  return [...new Set(requested.filter((id) => !found.has(id)))];
}
