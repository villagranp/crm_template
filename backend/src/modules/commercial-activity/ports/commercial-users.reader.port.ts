import type { Page, PageRequest } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import type { UserRefRecord } from './activity.repository.port';

export const COMMERCIAL_USERS_READER = Symbol('COMMERCIAL_USERS_READER');

/** Usuarios alcanzados por el actor: todos, o por id / país (de un `VisibilityScope` ya resuelto). */
export type UserScopeSet =
  | { readonly kind: 'ALL' }
  | { readonly kind: 'FILTERED'; readonly userIds: readonly string[]; readonly countryIds: readonly string[] };

export interface OwnerOptionsSearch extends PageRequest {
  readonly search: string | null;
  readonly scope: UserScopeSet;
  /** El usuario debe tener **alguno** de estos permisos efectivo. */
  readonly anyOfPermissions: readonly string[];
}

export interface UserState {
  readonly id: string;
  /** `ACTIVE` y no eliminado. */
  readonly isActive: boolean;
}

/**
 * Usuarios para responsables y participantes de visitas y actividades (RN-04.5,
 * RN-04.6, D-04.10).
 */
export interface CommercialUsersReader {
  /**
   * ¿Puede ser responsable? `ACTIVE`, no eliminado, dentro de `scope` y con alguno de
   * `anyOfPermissions` efectivo (roles vigentes, concesión directa; la denegación gana).
   */
  isEligibleOwner(
    userId: string,
    criteria: { readonly scope: UserScopeSet; readonly anyOfPermissions: readonly string[] },
    tx?: TransactionContext,
  ): Promise<boolean>;
  listOwnerOptions(search: OwnerOptionsSearch): Promise<Page<UserRefRecord>>;
  /** Estado de los usuarios que existen entre `userIds` (los inexistentes no aparecen). */
  findUserStates(userIds: readonly string[], tx?: TransactionContext): Promise<UserState[]>;
}
