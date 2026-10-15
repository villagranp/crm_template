import type { AppLogger } from '@/infrastructure/logging/app-logger.service';
import { DASHBOARD_BLOCK_KEYS, DASHBOARD_KPI_KEYS, DEFAULT_DASHBOARD_CARDS } from '@/modules/parameters/dashboard-cards';

import type { UserPreferenceKey, UserPreferencesRepository } from './ports/user-preferences.repository.port';
import { UserPreferencesService } from './user-preferences.service';

const USER = 'user-1';
const THEME = 'ui.tema';
const CARDS = 'ui.inicio.tarjetas';

function setup(stored: Array<[UserPreferenceKey, unknown]> = []) {
  const repository = {
    findMany: jest.fn().mockResolvedValue(new Map(stored)),
    upsert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<UserPreferencesRepository>;
  const logger = { warn: jest.fn() };
  const service = new UserPreferencesService(repository, logger as unknown as AppLogger);
  return { service, repository, logger };
}

const all = (keys: readonly string[]) => keys.map((key) => ({ key, visible: true }));

describe('UserPreferencesService (RN-AJ1.1, RN-AJ1.16, RN-AJ1.18)', () => {
  describe('get', () => {
    it('sin filas: tema y panel en null y sin avisos', async () => {
      const { service, repository, logger } = setup();
      await expect(service.get(USER)).resolves.toEqual({ theme: null, dashboardCards: null });
      expect(repository.findMany).toHaveBeenCalledWith(USER, [THEME, CARDS]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('devuelve el tema y el panel guardados', async () => {
      const { service } = setup([[THEME, 'dark'], [CARDS, DEFAULT_DASHBOARD_CARDS]]);
      await expect(service.get(USER)).resolves.toEqual({ theme: 'dark', dashboardCards: DEFAULT_DASHBOARD_CARDS });
    });

    it('un tema ilegible se lee como sin preferencia', async () => {
      const { service } = setup([[THEME, 'blue']]);
      await expect(service.get(USER)).resolves.toMatchObject({ theme: null });
    });

    it('un panel ilegible se lee como sin preferencia y deja un aviso sin el valor ni el usuario', async () => {
      const { service, logger } = setup([[CARDS, { secreto: 'valor-sensible' }]]);
      await expect(service.get(USER)).resolves.toMatchObject({ dashboardCards: null });
      expect(logger.warn).toHaveBeenCalledWith('dashboard_cards_invalid_value', { key: CARDS, source: 'preference', reason: 'unreadable' });
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('valor-sensible');
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(USER);
    });

    it('un panel al que le faltan claves se normaliza (RN-AJ1.4) y avisa', async () => {
      const { service, logger } = setup([[CARDS, { blocks: all(DASHBOARD_BLOCK_KEYS), kpis: all(DASHBOARD_KPI_KEYS).slice(0, 8) }]]);
      const { dashboardCards } = await service.get(USER);
      expect(dashboardCards?.kpis).toHaveLength(9);
      expect(dashboardCards?.kpis.at(-1)).toEqual({ key: 'targets', visible: true });
      expect(logger.warn).toHaveBeenCalledWith('dashboard_cards_invalid_value', { key: CARDS, source: 'preference', reason: 'normalized', repairs: ['missing_key'] });
    });
  });

  describe('setTheme', () => {
    it('crea o reemplaza la fila del propio usuario y no audita ni registra', async () => {
      const { service, repository, logger } = setup();
      await expect(service.setTheme(USER, 'dark')).resolves.toBe('dark');
      expect(repository.upsert).toHaveBeenCalledWith(USER, THEME, 'dark');
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('setDashboardCards', () => {
    it('guarda la composición completa tal cual (solo key y visible)', async () => {
      const { service, repository } = setup();
      const blocks = [...all(DASHBOARD_BLOCK_KEYS)].reverse().map((entry) => (entry.key === 'hero' ? { ...entry, visible: false } : entry));
      const saved = await service.setDashboardCards(USER, { blocks: blocks.map((entry) => ({ ...entry })), kpis: all(DASHBOARD_KPI_KEYS) });
      expect(saved.blocks).toEqual(blocks);
      expect(repository.upsert).toHaveBeenCalledWith(USER, CARDS, saved);
    });

    it('RN-AJ1.3: guarda safety-minute siempre visible aunque llegue en false', async () => {
      const { service } = setup();
      const blocks = all(DASHBOARD_BLOCK_KEYS).map((entry) => (entry.key === 'safety-minute' ? { ...entry, visible: false } : entry));
      const saved = await service.setDashboardCards(USER, { blocks, kpis: all(DASHBOARD_KPI_KEYS) });
      expect(saved.blocks[0]).toEqual({ key: 'safety-minute', visible: true });
    });

    it.each([
      ['unknown_key', { blocks: [...all(DASHBOARD_BLOCK_KEYS), { key: 'otro', visible: true }], kpis: all(DASHBOARD_KPI_KEYS) }, 'blocks.7.key'],
      ['duplicated_key', { blocks: all(DASHBOARD_BLOCK_KEYS), kpis: [...all(DASHBOARD_KPI_KEYS), { key: 'targets', visible: false }] }, 'kpis.9.key'],
      ['missing_key', { blocks: all(DASHBOARD_BLOCK_KEYS), kpis: all(DASHBOARD_KPI_KEYS).slice(1) }, 'kpis'],
    ])('%s → 422 INVALID_DASHBOARD_CARDS y no guarda nada', async (issue, input, field) => {
      const { service, repository } = setup();
      await expect(service.setDashboardCards(USER, input)).rejects.toMatchObject({
        code: 'INVALID_DASHBOARD_CARDS',
        details: [expect.objectContaining({ issue, field })],
      });
      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });

  it('resetDashboardCards borra solo la clave del panel del propio usuario', async () => {
    const { service, repository } = setup();
    await service.resetDashboardCards(USER);
    expect(repository.delete).toHaveBeenCalledWith(USER, CARDS);
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });
});
