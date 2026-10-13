import type { Prisma } from '@prisma/client';

/**
 * Filtros de Prisma sobre `users` compartidos por los adaptadores que eligen
 * responsables (clientes D-02.2, actividad comercial RN-04.5).
 */

/** Usuarios que el actor puede asignar: todos, o por id / país (alcance ya resuelto). */
export type AssignableUserSet =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'FILTERED'; readonly userIds: readonly string[]; readonly countryIds: readonly string[] };

/**
 * El usuario tiene `permission` **efectivo** (ADR-018): por un rol vigente y activo
 * que lo concede o por una concesión directa vigente, y sin denegación directa
 * vigente (que gana siempre). Misma regla que `resolvePermissions`.
 */
export function effectivePermissionWhere(permission: string, now: Date): Prisma.UserWhereInput {
  const vigente = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  return {
    AND: [
      {
        OR: [
          {
            roles: {
              some: {
                ...vigente,
                role: { isActive: true, deletedAt: null, permissions: { some: { permission: { code: permission } } } },
              },
            },
          },
          { permissions: { some: { ...vigente, effect: 'GRANT', permission: { code: permission } } } },
        ],
      },
      { permissions: { none: { ...vigente, effect: 'DENY', permission: { code: permission } } } },
    ],
  };
}

/** Usuario `ACTIVE`, no eliminado, con **alguno** de los permisos efectivo y dentro del conjunto asignable. */
export function eligibleUserWhere(permissions: readonly string[], assignable: AssignableUserSet, now: Date): Prisma.UserWhereInput {
  const conditions: Prisma.UserWhereInput[] = [
    permissions.length === 1 ? effectivePermissionWhere(permissions[0]!, now) : { OR: permissions.map((code) => effectivePermissionWhere(code, now)) },
  ];
  if (assignable.kind === 'FILTERED') {
    conditions.push({ OR: [{ id: { in: [...assignable.userIds] } }, { countryId: { in: [...assignable.countryIds] } }] });
  }
  return { status: 'ACTIVE', deletedAt: null, AND: conditions };
}
