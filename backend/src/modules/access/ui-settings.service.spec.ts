import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { DASHBOARD_BLOCK_KEYS, DASHBOARD_KPI_KEYS, DEFAULT_DASHBOARD_CARDS } from '@/modules/parameters/dashboard-cards';
import type { ParameterReader } from '@/modules/parameters/parameter-reader';
import type { ParametersRepository } from '@/modules/parameters/ports/parameters.repository.port';

import { UiSettingsService } from './ui-settings.service';
import type { UserPreferencesService } from './user-preferences.service';

const all = (keys: readonly string[]) => keys.map((key) => ({ key, visible: true }));
const OWN = {
  blocks: [...all(DASHBOARD_BLOCK_KEYS)].reverse(),
  kpis: all(DASHBOARD_KPI_KEYS),
};

function setup(options: { own?: typeof OWN | null; parameterValue?: string | null; topbar?: Record<string, boolean> } = {}) {
  const topbar = { 'ui.barra_superior.buscar': false, 'ui.barra_superior.pantalla_completa': true, 'ui.barra_superior.notificaciones': false, ...options.topbar };
  const preferences = { findDashboardCards: jest.fn().mockResolvedValue(options.own ?? null) };
  const parameters = { get: jest.fn(async (key: string) => topbar[key as keyof typeof topbar]) };
  const repository = {
    findByKey: jest.fn().mockResolvedValue(
      options.parameterValue === null ? null : { key: 'ui.inicio.tarjetas', value: options.parameterValue ?? JSON.stringify(DEFAULT_DASHBOARD_CARDS) },
    ),
  };
  const logger = { warn: jest.fn() };
  const service = new UiSettingsService(
    preferences as unknown as UserPreferencesService,
    parameters as unknown as ParameterReader,
    repository as unknown as ParametersRepository,
    logger as unknown as AppLogger,
  );
  return { service, logger, parameters };
}

describe('UiSettingsService (§6.1)', () => {
  it('sin preferencia: la composición por defecto del parámetro y isCustomized = false', async () => {
    const { service } = setup();
    const settings = await service.get('user-1');
    expect(settings.dashboard).toEqual({ isCustomized: false, ...DEFAULT_DASHBOARD_CARDS });
    expect(settings.topbar).toEqual({ search: false, fullscreen: true, notifications: false });
  });

  it('con preferencia propia prevalece sobre el parámetro y isCustomized = true', async () => {
    const edited = { blocks: all(DASHBOARD_BLOCK_KEYS).slice(1), kpis: all(DASHBOARD_KPI_KEYS) };
    const { service } = setup({ own: OWN, parameterValue: JSON.stringify({ ...edited, blocks: [...edited.blocks, { key: 'safety-minute', visible: true }] }) });
    const settings = await service.get('user-1');
    expect(settings.dashboard.isCustomized).toBe(true);
    expect(settings.dashboard.blocks).toEqual(OWN.blocks);
  });

  it('un parámetro editado lo ve quien no personalizó', async () => {
    const reordered = { blocks: [...all(DASHBOARD_BLOCK_KEYS)].reverse(), kpis: all(DASHBOARD_KPI_KEYS) };
    const { service } = setup({ parameterValue: JSON.stringify(reordered) });
    expect((await service.get('user-1')).dashboard).toEqual({ isCustomized: false, ...reordered });
  });

  it('RN-AJ1.4: un parámetro con claves faltantes se normaliza y avisa sin el valor', async () => {
    const { service, logger } = setup({ parameterValue: JSON.stringify({ blocks: all(DASHBOARD_BLOCK_KEYS), kpis: all(DASHBOARD_KPI_KEYS).slice(0, 5) }) });
    const { dashboard } = await service.get('user-1');
    expect(dashboard.kpis).toHaveLength(9);
    expect(logger.warn).toHaveBeenCalledWith('dashboard_cards_invalid_value', expect.objectContaining({ key: 'ui.inicio.tarjetas', source: 'parameter', reason: 'normalized' }));
  });

  it.each([['no es JSON', '{no'], ['no es una composición', '"hola"'], ['falta', null]])(
    'un parámetro que %s cae a la composición sembrada en código y avisa',
    async (_name, parameterValue) => {
      const { service, logger } = setup({ parameterValue });
      expect((await service.get('user-1')).dashboard).toEqual({ isCustomized: false, ...DEFAULT_DASHBOARD_CARDS });
      expect(logger.warn).toHaveBeenCalledWith('dashboard_cards_invalid_value', expect.objectContaining({ key: 'ui.inicio.tarjetas', source: 'parameter' }));
    },
  );

  it('la barra superior sale de los tres parámetros booleanos y solo de ellos', async () => {
    const { service, parameters } = setup({ topbar: { 'ui.barra_superior.buscar': true, 'ui.barra_superior.pantalla_completa': false, 'ui.barra_superior.notificaciones': true } });
    expect((await service.get('user-1')).topbar).toEqual({ search: true, fullscreen: false, notifications: true });
    expect(parameters.get.mock.calls.map(([key]) => key).sort()).toEqual([
      'ui.barra_superior.buscar',
      'ui.barra_superior.notificaciones',
      'ui.barra_superior.pantalla_completa',
    ]);
  });
});
