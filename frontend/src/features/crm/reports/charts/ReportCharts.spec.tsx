import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';
import { chartColors } from '@/theme';

import { FunnelChart } from '../funnel/FunnelChart';
import { FUNNEL } from '../testing/report-fixtures';

import { LazyComboChart, LazyLineChart } from './LazyCharts';

/**
 * Prueba de humo con `@mui/x-charts` **real** (ADR-023, AC-05.47): el resto de pruebas de
 * pantalla usan dobles (`testing/chart-doubles`). Aquí se comprueba que la carga diferida
 * resuelve, que el embudo se dibuja con barras horizontales de `BarChart` y que los colores son
 * los del tema. La primera importación de la librería en jsdom tarda varios segundos.
 */

const IMPORT_TIMEOUT_MS = 30_000;
const WIDTH = 640;

beforeEach(() => {
  // jsdom no maqueta: la librería mide el ancho del lienzo con `getComputedStyle` (sin ancho,
  // dibuja en 100 px y las barras no caben). Se le da un ancho de escritorio.
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original(element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'width') {
          return `${WIDTH}px`;
        }
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
});

describe('gráficas con @mui/x-charts Community (ADR-023)', () => {
  it('PF-05.47: el embudo carga en diferido y se dibuja como BarChart HORIZONTAL, una barra por etapa, con el color del tema', { timeout: IMPORT_TIMEOUT_MS * 2 }, async () => {
    const onStageClick = vi.fn();
    const { container } = renderWithProviders(<FunnelChart funnel={FUNNEL} onStageClick={onStageClick} />);

    expect(screen.getByLabelText('Cargando gráfica')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('rect.MuiBarElement-root')).toHaveLength(FUNNEL.stages.length), { timeout: IMPORT_TIMEOUT_MS });

    const bars = [...container.querySelectorAll('rect.MuiBarElement-root')];
    expect(bars.map((bar) => bar.getAttribute('layout'))).toEqual(['horizontal', 'horizontal']);
    expect(bars.map((bar) => bar.getAttribute('fill'))).toEqual([chartColors.light.series[0], chartColors.light.series[0]]);
    expect(screen.getByRole('figure', { name: 'Embudo comercial por etapa' })).toBeInTheDocument();
    expect(screen.getByText('Contactado')).toBeInTheDocument();
    expect(screen.getByText('4 · 57.14 %')).toBeInTheDocument();
    expect(container.querySelector('.MuiFunnelChart-root, [class*="Funnel"]')).toBeNull();

    // `fireEvent` y no `userEvent`: jsdom no implementa `createSVGPoint`, que usa el puntero de la librería.
    fireEvent.click(bars[1] as Element);
    expect(onStageClick).toHaveBeenCalledWith(FUNNEL.stages[1]?.stage.id);
  });

  it('líneas y combinada (barras + línea en un solo eje) cargan en diferido con leyenda de texto', { timeout: IMPORT_TIMEOUT_MS * 2 }, async () => {
    const { container } = renderWithProviders(
      <>
        <LazyLineChart ariaLabel="Tendencia" categories={['sep 2026', 'oct 2026']} series={[{ key: 'won', label: 'Ganadas', tone: 'primary', values: [3, 0] }]} />
        <LazyComboChart
          ariaLabel="Forecast"
          categories={['sep 2026', 'oct 2026']}
          bars={{ key: 'tonnage', label: 'Toneladas del mes', tone: 'primary', values: [10, 12.5] }}
          line={{ key: 'cumulative', label: 'Acumulado', tone: 'secondary', values: [10, 22.5] }}
        />
      </>,
    );

    await waitFor(() => expect(container.querySelectorAll('svg.MuiChartsSurface-root')).toHaveLength(2), { timeout: IMPORT_TIMEOUT_MS });
    expect(container.querySelectorAll('.MuiLineChart-root path, path.MuiLineElement-root').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('rect.MuiBarElement-root')).toHaveLength(2);
    // Un solo eje de valores en la combinada (nunca dos escalas).
    const forecast = screen.getByRole('figure', { name: 'Forecast' });
    expect(forecast.querySelectorAll('.MuiChartsAxis-directionY')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Leyenda' })).toHaveTextContent('Toneladas del mesAcumulado');
  });
});
