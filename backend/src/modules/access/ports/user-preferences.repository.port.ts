export const USER_PREFERENCES_REPOSITORY = Symbol('USER_PREFERENCES_REPOSITORY');

/** Claves de `user_preferences` que usa la aplicación (Ajustes 1, RN-AJ1.1 y RN-AJ1.16). */
export const USER_PREFERENCE_KEYS = {
  theme: 'ui.tema',
  dashboardCards: 'ui.inicio.tarjetas',
} as const;

export type UserPreferenceKey = (typeof USER_PREFERENCE_KEYS)[keyof typeof USER_PREFERENCE_KEYS];

/**
 * Puerto de las preferencias de interfaz de un usuario (`user_preferences`, una fila por
 * `(usuario, clave)`). El valor es JSON sin interpretar: cada caso de uso lo valida y lo
 * normaliza. El usuario siempre sale de la sesión, nunca de la ruta (sin IDOR). Sin tipos
 * del ORM (ADR-004).
 */
export interface UserPreferencesRepository {
  /** Valores guardados de las claves pedidas; las que no tienen fila no aparecen. */
  findMany(userId: string, keys: readonly UserPreferenceKey[]): Promise<ReadonlyMap<UserPreferenceKey, unknown>>;
  /** Crea o reemplaza la fila `(usuario, clave)`. */
  upsert(userId: string, key: UserPreferenceKey, value: unknown): Promise<void>;
  /** Borrado físico; idempotente (sin fila no hace nada). */
  delete(userId: string, key: UserPreferenceKey): Promise<void>;
}
