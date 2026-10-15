import { INVALID_DASHBOARD_CARDS, invalidDashboardCardsError, isThemeValue, themeFromStored, THEME_VALUES } from './user-preferences.rules';

describe('reglas de las preferencias de interfaz', () => {
  it('D-AJ1.7: solo light y dark', () => {
    expect(THEME_VALUES).toEqual(['light', 'dark']);
    expect(isThemeValue('light')).toBe(true);
    expect(isThemeValue('dark')).toBe(true);
    for (const value of ['blue', 'system', '', 'DARK', null, undefined, 1, {}]) {
      expect(isThemeValue(value)).toBe(false);
    }
  });

  it('themeFromStored: el valor válido o null', () => {
    expect(themeFromStored('dark')).toBe('dark');
    expect(themeFromStored('blue')).toBeNull();
    expect(themeFromStored(undefined)).toBeNull();
  });

  it('INVALID_DASHBOARD_CARDS lleva field, issue y key por incidencia', () => {
    const error = invalidDashboardCardsError([
      { list: 'blocks', issue: 'unknown_key', key: 'x', index: 2 },
      { list: 'kpis', issue: 'missing_key', key: 'targets', index: null },
    ]);
    expect(error.code).toBe(INVALID_DASHBOARD_CARDS);
    expect(error.details).toEqual([
      { field: 'blocks.2.key', issue: 'unknown_key', key: 'x' },
      { field: 'kpis', issue: 'missing_key', key: 'targets' },
    ]);
  });
});
