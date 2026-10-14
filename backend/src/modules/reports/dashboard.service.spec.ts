import { dashboardForecastMonths, dashboardPeriod, type DashboardOwnerRow, topOwners } from './dashboard.service';

const CLOCK = { now: new Date('2026-10-13T18:00:00Z'), businessTimeZone: 'America/Guatemala' };

describe('dashboardPeriod (E.7, C.2)', () => {
  it('por defecto: los 12 meses cerrados anteriores + el mes en curso', () => {
    expect(dashboardPeriod({}, CLOCK)).toEqual({ from: '2025-10-01', to: '2026-10-31' });
  });

  it('el mes en curso es el de la zona del negocio (31/10 23:30 local = 01/11 UTC)', () => {
    expect(dashboardPeriod({}, { now: new Date('2026-11-01T05:30:00Z'), businessTimeZone: 'America/Guatemala' })).toEqual({ from: '2025-10-01', to: '2026-10-31' });
  });

  it('from/to juntos, from ≤ to (400) y como mucho 24 meses de calendario (422 PERIOD_TOO_LONG)', () => {
    expect(() => dashboardPeriod({ from: '2026-01-01' }, CLOCK)).toThrow(expect.objectContaining({ details: [{ field: 'to', issue: 'from and to must be sent together' }] }));
    expect(() => dashboardPeriod({ to: '2026-01-01' }, CLOCK)).toThrow(expect.objectContaining({ details: [{ field: 'from', issue: 'from and to must be sent together' }] }));
    expect(() => dashboardPeriod({ from: '2026-02-01', to: '2026-01-31' }, CLOCK)).toThrow(expect.objectContaining({ details: [{ field: 'to', issue: 'to must be on or after from' }] }));
    expect(dashboardPeriod({ from: '2024-11-15', to: '2026-10-01' }, CLOCK)).toEqual({ from: '2024-11-15', to: '2026-10-01' });
    expect(() => dashboardPeriod({ from: '2024-10-31', to: '2026-10-01' }, CLOCK)).toThrow(
      expect.objectContaining({ code: 'PERIOD_TOO_LONG', details: [expect.objectContaining({ field: 'to', maxMonths: 24 })] }),
    );
  });
});

describe('dashboardForecastMonths', () => {
  it('meses del período ∪ M+1…M+H, sin repetir y en orden', () => {
    const months = dashboardForecastMonths({ from: '2026-08-01', to: '2026-11-30' }, CLOCK, 3);
    expect(months).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });
});

describe('topOwners (E.7 "Distribución por asesor")', () => {
  function owner(index: number, open: number, won: number, tonnage: string): DashboardOwnerRow {
    return { owner: { id: `u${index}`, displayName: `Asesor ${String(index).padStart(2, '0')}` }, openOpportunities: open, won, forecastTonnage: tonnage };
  }

  it('top 10 por abiertas + ganadas (después toneladas y nombre) y el resto sumado en "Otros"', () => {
    const rows = Array.from({ length: 12 }, (_, index) => owner(index, index, 0, '1.0000'));
    rows.push(owner(99, 0, 0, '9.5000'));
    const result = topOwners(rows);
    expect(result).toHaveLength(11);
    expect(result.slice(0, 3).map((row) => row.owner?.id)).toEqual(['u11', 'u10', 'u9']);
    expect(result[10]).toEqual({ owner: null, openOpportunities: 1, won: 0, forecastTonnage: '11.5000' });
  });

  it('con 10 o menos no añade "Otros"', () => {
    expect(topOwners([owner(1, 0, 1, '0.0000'), owner(2, 0, 1, '2.0000')]).map((row) => row.owner?.id)).toEqual(['u2', 'u1']);
  });
});
