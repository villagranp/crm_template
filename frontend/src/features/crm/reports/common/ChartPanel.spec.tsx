import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { ChartPanel } from './ChartPanel';

const TABLE = (
  <table aria-label="Datos">
    <tbody>
      <tr>
        <td>Cotizando</td>
        <td>4</td>
      </tr>
    </tbody>
  </table>
);

describe('ChartPanel (05 E.1, AC-05.32, AC-05.33)', () => {
  it('sin gráfica muestra la tabla y no ofrece el conmutador', () => {
    renderWithProviders(<ChartPanel title="Distribución por etapa" table={TABLE} />);

    expect(screen.getByRole('region', { name: 'Distribución por etapa' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Datos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver como tabla' })).not.toBeInTheDocument();
  });

  it('con gráfica alterna "Ver como tabla" / "Ver como gráfica" con los mismos datos', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChartPanel title="Embudo" table={TABLE} chart={<p>Gráfica de barras</p>} />);

    expect(screen.getByText('Gráfica de barras')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver como tabla' }));
    expect(screen.getByRole('table', { name: 'Datos' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver como gráfica' }));
    expect(screen.getByText('Gráfica de barras')).toBeInTheDocument();
  });

  it('carga, error con "Reintentar" y vacío se pintan dentro del propio panel', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<ChartPanel title="Panel" table={TABLE} isLoading />);
    expect(screen.getByRole('status', { name: 'Cargando Panel' })).toBeInTheDocument();

    rerender(<ChartPanel title="Panel" table={TABLE} errorMessage="No se pudo calcular. Referencia: c-1" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo calcular. Referencia: c-1');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<ChartPanel title="Panel" table={TABLE} isEmpty />);
    expect(screen.getByRole('status')).toHaveTextContent('No hay datos para los filtros seleccionados.');
  });

  it('summary (aditivo) se pinta sobre ambas vistas y no mientras carga ni con error', async () => {
    const user = userEvent.setup();
    const summary = <p>Total: 12</p>;
    const { rerender } = renderWithProviders(<ChartPanel title="Proyectos" table={TABLE} chart={<p>Barras</p>} summary={summary} />);

    expect(screen.getByText('Total: 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver como tabla' }));
    expect(screen.getByText('Total: 12')).toBeInTheDocument();

    rerender(<ChartPanel title="Proyectos" table={TABLE} summary={summary} isLoading />);
    expect(screen.queryByText('Total: 12')).not.toBeInTheDocument();
    rerender(<ChartPanel title="Proyectos" table={TABLE} summary={summary} errorMessage="Falló" />);
    expect(screen.queryByText('Total: 12')).not.toBeInTheDocument();
  });
});
