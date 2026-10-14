import { FakeBarChart, FakeComboChart, FakeLineChart } from './ChartDoubles';

/**
 * Módulos sustitutos de las implementaciones de gráficas para `vi.mock` (ver `ChartDoubles.tsx`):
 *
 * `vi.mock('../charts/ReportBarChart', async () => (await import('../testing/chart-doubles')).barChartModule);`
 */
export const barChartModule = { default: FakeBarChart };
export const lineChartModule = { default: FakeLineChart };
export const comboChartModule = { default: FakeComboChart };
