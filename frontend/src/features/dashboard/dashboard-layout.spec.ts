import { describe, expect, it } from 'vitest';

import { DEFAULT_UI_SETTINGS, type DashboardBlockKey } from '@/services/ui-settings';

import {
  buildGridAreas,
  isBlockPermitted,
  mergeSubset,
  moveEntry,
  visibleBlockKeys,
  visibleKpiKeys,
  type BlockAvailability,
} from './dashboard-layout';
import { resolveDashboardAccess } from './dashboard.permissions';

const ALL_AVAILABLE: BlockAvailability = {
  'safety-minute': true,
  hero: true,
  mine: true,
  kpis: true,
  alerts: true,
  activity: true,
  access: true,
};

const entries = (keys: DashboardBlockKey[], hidden: DashboardBlockKey[] = []) =>
  keys.map((key) => ({ key, visible: !hidden.includes(key) }));

function accessFor(...permissions: string[]) {
  const granted = new Set(permissions);
  return resolveDashboardAccess((permission) => granted.has(permission));
}

describe('visibleBlockKeys', () => {
  it('respeta el orden configurado y descarta lo oculto o sin nada que mostrar', () => {
    const blocks = entries(['access', 'hero', 'mine', 'alerts', 'kpis'], ['mine']);
    const keys = visibleBlockKeys(blocks, { ...ALL_AVAILABLE, alerts: false });
    expect(keys).toEqual(['access', 'hero', 'kpis']);
  });

  it('el minuto de seguridad no se oculta aunque llegue con visible = false', () => {
    const blocks = entries(['safety-minute', 'hero'], ['safety-minute']);
    expect(visibleBlockKeys(blocks, ALL_AVAILABLE)).toEqual(['safety-minute', 'hero']);
    expect(visibleBlockKeys(blocks, { ...ALL_AVAILABLE, 'safety-minute': false })).toEqual(['hero']);
  });

  it('descarta claves repetidas', () => {
    const blocks = entries(['hero', 'hero', 'mine']);
    expect(visibleBlockKeys(blocks, ALL_AVAILABLE)).toEqual(['hero', 'mine']);
  });

  it('con la composición por defecto muestra los siete bloques', () => {
    expect(visibleBlockKeys(DEFAULT_UI_SETTINGS.dashboard.blocks, ALL_AVAILABLE)).toHaveLength(7);
  });
});

describe('buildGridAreas', () => {
  it('reproduce la disposición por defecto con los bloques medios emparejados', () => {
    const areas = buildGridAreas(['safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity', 'access']);
    expect(areas.md).toBe(
      '"safety-minute hero" "mine mine" "kpis kpis" "alerts activity" "access access"',
    );
    expect(areas.xs).toBe('"safety-minute" "hero" "mine" "kpis" "alerts" "activity" "access"');
  });

  it('empareja bloques consecutivos y deja solo (fila completa) al que no tiene pareja', () => {
    expect(buildGridAreas(['hero', 'mine', 'kpis', 'alerts', 'activity', 'access']).md).toBe(
      '"hero mine" "kpis kpis" "alerts activity" "access access"',
    );
    expect(buildGridAreas(['hero', 'kpis', 'mine']).md).toBe('"hero hero" "kpis kpis" "mine mine"');
  });

  it('kpis y access nunca se emparejan', () => {
    expect(buildGridAreas(['kpis', 'access', 'hero']).md).toBe('"kpis kpis" "access access" "hero hero"');
  });

  it('en móvil conserva el orden configurado, una columna', () => {
    expect(buildGridAreas(['access', 'hero']).xs).toBe('"access" "hero"');
  });

  it('sin bloques no hay áreas', () => {
    expect(buildGridAreas([])).toEqual({ xs: '', md: '' });
  });
});

describe('visibleKpiKeys', () => {
  const kpis = DEFAULT_UI_SETTINGS.dashboard.kpis;

  it('combina visibilidad y permiso: un visible sin permiso no se pinta', () => {
    const access = accessFor('proyectos.ver', 'forecast.ver');
    expect(visibleKpiKeys(kpis, access)).toEqual(['projects-active', 'forecast']);
  });

  it('respeta el orden y lo oculto por preferencia', () => {
    const access = accessFor('oportunidades.ver', 'proyectos.ver');
    const custom = [
      { key: 'opportunities-lost' as const, visible: true },
      { key: 'opportunities-open' as const, visible: false },
      { key: 'projects-active' as const, visible: true },
    ];
    expect(visibleKpiKeys(custom, access)).toEqual(['opportunities-lost', 'projects-active']);
  });
});

describe('isBlockPermitted', () => {
  it('alertas y actividad dependen de permisos; el resto siempre', () => {
    const none = accessFor();
    expect(isBlockPermitted('hero', none)).toBe(true);
    expect(isBlockPermitted('alerts', none)).toBe(false);
    expect(isBlockPermitted('activity', none)).toBe(false);
    expect(isBlockPermitted('alerts', accessFor('visitas.ver'))).toBe(true);
    expect(isBlockPermitted('activity', accessFor('visitas.ver'))).toBe(true);
  });
});

describe('mergeSubset', () => {
  const full = entries(['safety-minute', 'hero', 'mine', 'kpis', 'alerts', 'activity', 'access']);

  it('reordena el subconjunto conservando las posiciones y las claves fuera de él', () => {
    const subset = [full[0], full[1], full[2], full[3], full[6]].filter(Boolean) as typeof full;
    const reordered = [subset[1], subset[0], subset[2], subset[3], subset[4]] as typeof full;
    const merged = mergeSubset(full, reordered);
    expect(merged.map((entry) => entry.key)).toEqual([
      'hero',
      'safety-minute',
      'mine',
      'kpis',
      'alerts',
      'activity',
      'access',
    ]);
  });

  it('aplica el cambio de visibilidad y no pierde las claves sin acceso', () => {
    const subset = [{ key: 'hero' as const, visible: false }];
    const merged = mergeSubset(full, subset);
    expect(merged).toHaveLength(full.length);
    expect(merged.find((entry) => entry.key === 'hero')?.visible).toBe(false);
    expect(merged.find((entry) => entry.key === 'alerts')?.visible).toBe(true);
  });
});

describe('moveEntry', () => {
  it('sube y baja una posición y no sale de los extremos', () => {
    expect(moveEntry(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveEntry(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveEntry(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveEntry(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
