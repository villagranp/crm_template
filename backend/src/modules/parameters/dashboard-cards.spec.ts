import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_KPI_KEYS,
  dashboardCardsSchema,
  DEFAULT_DASHBOARD_CARDS,
  diagnoseDashboardCards,
  normalizeDashboardCards,
} from './dashboard-cards';

const visible = (keys: readonly string[]) => keys.map((key) => ({ key, visible: true }));

describe('composición del panel de Inicio (RN-AJ1.2–RN-AJ1.6)', () => {
  it('RN-AJ1.2: las listas cerradas son las del plan', () => {
    expect(DASHBOARD_BLOCK_KEYS).toEqual(['safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity', 'access']);
    expect(DASHBOARD_KPI_KEYS).toHaveLength(9);
    expect(DASHBOARD_KPI_KEYS[0]).toBe('projects-active');
    expect(DASHBOARD_KPI_KEYS[8]).toBe('targets');
  });

  it('RN-AJ1.6: el valor por defecto es la composición actual, todo visible y en orden', () => {
    expect(DEFAULT_DASHBOARD_CARDS.blocks).toEqual(visible(DASHBOARD_BLOCK_KEYS));
    expect(DEFAULT_DASHBOARD_CARDS.kpis).toEqual(visible(DASHBOARD_KPI_KEYS));
    expect(dashboardCardsSchema.safeParse(DEFAULT_DASHBOARD_CARDS).success).toBe(true);
  });

  describe('diagnoseDashboardCards', () => {
    it('sin incidencias si cada clave aparece exactamente una vez, en cualquier orden', () => {
      expect(diagnoseDashboardCards({ blocks: [...visible(DASHBOARD_BLOCK_KEYS)].reverse(), kpis: visible(DASHBOARD_KPI_KEYS) })).toEqual([]);
    });

    it('distingue desconocida, repetida y faltante, con lista y posición', () => {
      const blocks = [...visible(DASHBOARD_BLOCK_KEYS).filter((entry) => entry.key !== 'access'), { key: 'hero', visible: false }, { key: 'nueva', visible: true }];
      const kpis = [...visible(DASHBOARD_KPI_KEYS), { key: 'projects-active', visible: true }];
      expect(diagnoseDashboardCards({ blocks, kpis })).toEqual([
        { list: 'blocks', issue: 'duplicated_key', key: 'hero', index: 6 },
        { list: 'blocks', issue: 'unknown_key', key: 'nueva', index: 7 },
        { list: 'blocks', issue: 'missing_key', key: 'access', index: null },
        { list: 'kpis', issue: 'duplicated_key', key: 'projects-active', index: 9 },
      ]);
    });

    it('una clave de indicadores en la lista de bloques es desconocida (y viceversa)', () => {
      const issues = diagnoseDashboardCards({ blocks: [...visible(DASHBOARD_BLOCK_KEYS), { key: 'forecast', visible: true }], kpis: visible(DASHBOARD_KPI_KEYS) });
      expect(issues).toEqual([{ list: 'blocks', issue: 'unknown_key', key: 'forecast', index: 7 }]);
    });
  });

  describe('esquema estricto (la regla del parámetro)', () => {
    it('rechaza claves desconocidas, repetidas y faltantes con la ruta del campo', () => {
      const bad = dashboardCardsSchema.safeParse({
        blocks: [...visible(DASHBOARD_BLOCK_KEYS).slice(1), { key: 'otra', visible: true }],
        kpis: visible(DASHBOARD_KPI_KEYS),
      });
      expect(bad.success).toBe(false);
      if (!bad.success) {
        expect(bad.error.issues.map((issue) => issue.path.join('.'))).toEqual(['blocks.6.key', 'blocks']);
      }
    });

    it('rechaza campos extra y visibles no booleanos', () => {
      expect(dashboardCardsSchema.safeParse({ blocks: visible(DASHBOARD_BLOCK_KEYS), kpis: visible(DASHBOARD_KPI_KEYS), x: 1 }).success).toBe(false);
      expect(dashboardCardsSchema.safeParse({ blocks: [{ key: 'hero', visible: 'sí' }], kpis: [] }).success).toBe(false);
      expect(dashboardCardsSchema.safeParse({ blocks: [{ key: 'hero', visible: true, extra: 1 }], kpis: [] }).success).toBe(false);
    });
  });

  describe('normalizeDashboardCards (lector tolerante, RN-AJ1.4)', () => {
    it('una composición correcta no se repara', () => {
      expect(normalizeDashboardCards(DEFAULT_DASHBOARD_CARDS)).toEqual({ cards: DEFAULT_DASHBOARD_CARDS, repairs: [] });
    });

    it('descarta desconocidas y repetidas (gana la primera) y añade las faltantes al final como visibles', () => {
      const result = normalizeDashboardCards({
        blocks: [
          { key: 'activity', visible: false },
          { key: 'hero', visible: true },
          { key: 'activity', visible: true },
          { key: 'zzz', visible: true },
        ],
        kpis: [{ key: 'forecast', visible: false }],
      });
      expect(result?.cards.blocks).toEqual([
        { key: 'activity', visible: false },
        { key: 'hero', visible: true },
        { key: 'safety-minute', visible: true },
        { key: 'mine', visible: true },
        { key: 'kpis', visible: true },
        { key: 'alerts', visible: true },
        { key: 'access', visible: true },
      ]);
      expect(result?.cards.kpis[0]).toEqual({ key: 'forecast', visible: false });
      expect(result?.cards.kpis).toHaveLength(9);
      expect(result?.cards.kpis.slice(1).every((entry) => entry.visible)).toBe(true);
      expect(result?.repairs).toEqual(expect.arrayContaining(['duplicated_key', 'unknown_key', 'missing_key']));
    });

    it('un indicador nuevo de una versión futura queda al final y visible', () => {
      const old = { blocks: DEFAULT_DASHBOARD_CARDS.blocks, kpis: DEFAULT_DASHBOARD_CARDS.kpis.slice(0, 8) };
      const result = normalizeDashboardCards(old);
      expect(result?.cards.kpis.at(-1)).toEqual({ key: 'targets', visible: true });
      expect(result?.repairs).toEqual(['missing_key']);
    });

    it('RN-AJ1.3: el minuto de seguridad siempre queda visible', () => {
      const result = normalizeDashboardCards({
        blocks: DEFAULT_DASHBOARD_CARDS.blocks.map((entry) => (entry.key === 'safety-minute' ? { key: entry.key, visible: false } : entry)),
        kpis: DEFAULT_DASHBOARD_CARDS.kpis,
      });
      expect(result?.cards.blocks[0]).toEqual({ key: 'safety-minute', visible: true });
      expect(result?.repairs).toEqual(['forced_visible']);
    });

    it('entradas mal formadas se descartan y se reponen', () => {
      const result = normalizeDashboardCards({ blocks: [null, 7, { key: 'hero' }, { key: 'mine', visible: 'x' }], kpis: [] });
      expect(result?.cards.blocks).toHaveLength(7);
      expect(result?.repairs).toContain('invalid_entry');
    });

    it.each([[null], [undefined], ['texto'], [42], [[]], [{}], [{ blocks: [] }], [{ blocks: 'x', kpis: [] }]])(
      'valor ilegible %j → null (cae al valor por defecto)',
      (value) => {
        expect(normalizeDashboardCards(value)).toBeNull();
      },
    );
  });
});
