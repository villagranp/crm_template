import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/infrastructure/logging/app-logger.service';
import {
  DASHBOARD_PARAMETER_KEY,
  type DashboardCards,
  DEFAULT_DASHBOARD_CARDS,
} from '@/modules/parameters/dashboard-cards';
import { ParameterReader } from '@/modules/parameters/parameter-reader';
import { PARAMETERS_REPOSITORY, type ParametersRepository } from '@/modules/parameters/ports/parameters.repository.port';

import { readStoredDashboardCards, UserPreferencesService } from './user-preferences.service';

/** Claves de los parámetros de la barra superior (RN-AJ1.14). */
export const TOPBAR_PARAMETERS = {
  search: 'ui.barra_superior.buscar',
  fullscreen: 'ui.barra_superior.pantalla_completa',
  notifications: 'ui.barra_superior.notificaciones',
} as const;

export interface UiSettings {
  readonly dashboard: DashboardCards & { readonly isCustomized: boolean };
  readonly topbar: { readonly search: boolean; readonly fullscreen: boolean; readonly notifications: boolean };
}

/**
 * Configuración de interfaz de la sesión (Ajustes 1, §6.1).
 *
 * - `dashboard`: la preferencia válida del propio usuario si existe; si no, la composición por
 *   defecto del parámetro `ui.inicio.tarjetas` (D-AJ1.11); y si este falta o es ilegible, la
 *   composición actual sembrada en código. Siempre normalizada (RN-AJ1.4, RN-AJ1.3). No filtra
 *   por permisos: el cliente combina visibilidad y permiso, y cada endpoint de datos se protege solo.
 * - `topbar`: tres booleanos vía `ParameterReader` (mismo esquema al escribir y al leer).
 * - No expone ningún otro parámetro.
 */
@Injectable()
export class UiSettingsService {
  constructor(
    private readonly preferences: UserPreferencesService,
    private readonly parameters: ParameterReader,
    @Inject(PARAMETERS_REPOSITORY) private readonly parametersRepository: ParametersRepository,
    private readonly logger: AppLogger,
  ) {}

  async get(userId: string): Promise<UiSettings> {
    const [own, defaults, search, fullscreen, notifications] = await Promise.all([
      this.preferences.findDashboardCards(userId),
      this.defaultDashboardCards(),
      this.parameters.get<boolean>(TOPBAR_PARAMETERS.search),
      this.parameters.get<boolean>(TOPBAR_PARAMETERS.fullscreen),
      this.parameters.get<boolean>(TOPBAR_PARAMETERS.notifications),
    ]);
    const cards = own ?? defaults;
    return {
      dashboard: { isCustomized: own !== null, blocks: cards.blocks, kpis: cards.kpis },
      topbar: { search, fullscreen, notifications },
    };
  }

  /** Composición por defecto: el parámetro del sistema, con el lector tolerante de RN-AJ1.4. */
  private async defaultDashboardCards(): Promise<DashboardCards> {
    const parameter = await this.parametersRepository.findByKey(DASHBOARD_PARAMETER_KEY);
    if (!parameter) {
      this.logger.warn('dashboard_cards_invalid_value', { key: DASHBOARD_PARAMETER_KEY, source: 'parameter', reason: 'missing' });
      return DEFAULT_DASHBOARD_CARDS;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(parameter.value) as unknown;
    } catch {
      this.logger.warn('dashboard_cards_invalid_value', { key: DASHBOARD_PARAMETER_KEY, source: 'parameter', reason: 'unreadable' });
      return DEFAULT_DASHBOARD_CARDS;
    }
    return readStoredDashboardCards(parsed, 'parameter', this.logger) ?? DEFAULT_DASHBOARD_CARDS;
  }
}
