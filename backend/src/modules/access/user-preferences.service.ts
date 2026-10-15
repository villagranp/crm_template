import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import {
  canonicalDashboardCards,
  type DashboardCards,
  DASHBOARD_PARAMETER_KEY,
  diagnoseDashboardCards,
  normalizeDashboardCards,
} from '@/modules/parameters/dashboard-cards';

import {
  USER_PREFERENCE_KEYS,
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from './ports/user-preferences.repository.port';
import { invalidDashboardCardsError, themeFromStored, type ThemeValue } from './user-preferences.rules';

export interface UserPreferences {
  readonly theme: ThemeValue | null;
  readonly dashboardCards: DashboardCards | null;
}

/**
 * Lee la preferencia de composición del panel con el lector tolerante de RN-AJ1.4: normaliza
 * y deja un aviso estructurado SIN el valor ni el usuario cuando tuvo que reparar o descartar
 * lo guardado. `null` = no existe o es ilegible (quien llama cae a la composición por defecto).
 */
export function readStoredDashboardCards(
  stored: unknown,
  source: 'preference' | 'parameter',
  logger: Pick<AppLogger, 'warn'>,
): DashboardCards | null {
  if (stored === undefined) return null;
  const normalized = normalizeDashboardCards(stored);
  if (!normalized) {
    logger.warn('dashboard_cards_invalid_value', { key: DASHBOARD_PARAMETER_KEY, source, reason: 'unreadable' });
    return null;
  }
  if (normalized.repairs.length > 0) {
    logger.warn('dashboard_cards_invalid_value', { key: DASHBOARD_PARAMETER_KEY, source, reason: 'normalized', repairs: normalized.repairs });
  }
  return normalized.cards;
}

/**
 * Preferencias de interfaz del usuario de la sesión (Ajustes 1, RN-AJ1.1, RN-AJ1.16, RN-AJ1.18).
 *
 * - El usuario siempre sale de la sesión (el controlador lo resuelve): no hay `{userId}` en la ruta.
 * - Son personales: no se auditan ni se registran en logs (RN-AJ1.6b y RN-AJ1.18).
 * - Una preferencia guardada ilegible no rompe nada: se lee como si no existiera.
 */
@Injectable()
export class UserPreferencesService {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY) private readonly repository: UserPreferencesRepository,
    private readonly logger: AppLogger,
  ) {}

  async get(userId: string): Promise<UserPreferences> {
    const stored = await this.repository.findMany(userId, [USER_PREFERENCE_KEYS.theme, USER_PREFERENCE_KEYS.dashboardCards]);
    return {
      theme: themeFromStored(stored.get(USER_PREFERENCE_KEYS.theme)),
      dashboardCards: readStoredDashboardCards(stored.get(USER_PREFERENCE_KEYS.dashboardCards), 'preference', this.logger),
    };
  }

  /** La preferencia propia del panel (normalizada), o `null` (para la composición efectiva de `ui-settings`). */
  async findDashboardCards(userId: string): Promise<DashboardCards | null> {
    return (await this.get(userId)).dashboardCards;
  }

  async setTheme(userId: string, theme: ThemeValue): Promise<ThemeValue> {
    await this.repository.upsert(userId, USER_PREFERENCE_KEYS.theme, theme);
    return theme;
  }

  /**
   * Guarda la composición completa. Claves desconocidas, repetidas o faltantes → `422
   * INVALID_DASHBOARD_CARDS` y no se guarda nada. Los bloques no ocultables se guardan visibles.
   */
  async setDashboardCards(
    userId: string,
    input: { readonly blocks: ReadonlyArray<{ key: string; visible: boolean }>; readonly kpis: ReadonlyArray<{ key: string; visible: boolean }> },
  ): Promise<DashboardCards> {
    const issues = diagnoseDashboardCards(input);
    if (issues.length > 0) {
      throw invalidDashboardCardsError(issues);
    }
    const cards = canonicalDashboardCards(input);
    await this.repository.upsert(userId, USER_PREFERENCE_KEYS.dashboardCards, cards);
    return cards;
  }

  /** «Restablecer»: borra la preferencia; sin ella también termina bien (idempotente). */
  async resetDashboardCards(userId: string): Promise<void> {
    await this.repository.delete(userId, USER_PREFERENCE_KEYS.dashboardCards);
  }
}
