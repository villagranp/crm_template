import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { SummaryCards, type SummaryCardItem } from './SummaryCards';

const ITEMS: SummaryCardItem[] = [
  { key: 'open', label: 'Abiertas', value: 1234, filterValue: 'OPEN', tone: 'info' },
  { key: 'won', label: 'Ganadas', value: 3, filterValue: 'WON', detail: 'de las cuales parciales: 2' },
  { key: 'amount', label: 'Estimación total (USD)', value: 'USD 125,000.00' },
];

describe('SummaryCards (05 E.1)', () => {
  it('cada tarjeta con filtro es un botón que lo aplica, y pulsarla de nuevo lo quita', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<SummaryCards label="Resumen" items={ITEMS} onSelect={onSelect} />);

    const open = screen.getByRole('button', { name: 'Abiertas: 1,234. Filtrar la tabla' });
    expect(open).toHaveAttribute('aria-pressed', 'false');
    await user.click(open);
    expect(onSelect).toHaveBeenLastCalledWith('OPEN');

    rerender(<SummaryCards label="Resumen" items={ITEMS} onSelect={onSelect} activeValue="OPEN" />);
    const active = screen.getByRole('button', { name: 'Abiertas: 1,234. Quitar el filtro' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    await user.click(active);
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('las tarjetas informativas no son botones y muestran el valor ya formateado y su detalle', () => {
    renderWithProviders(<SummaryCards label="Resumen" items={ITEMS} onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Estimación total/ })).not.toBeInTheDocument();
    expect(screen.getByText('USD 125,000.00')).toBeInTheDocument();
    expect(screen.getByText('de las cuales parciales: 2')).toBeInTheDocument();
  });

  it('cargando: esqueletos y aria-busy; error: alerta con "Reintentar"', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<SummaryCards label="Resumen de prueba" items={[]} isLoading />);
    expect(screen.getByRole('region', { name: 'Resumen de prueba' }).firstElementChild).toHaveAttribute('aria-busy', 'true');

    rerender(<SummaryCards label="Resumen de prueba" items={[]} errorMessage="La consulta tardó demasiado. Referencia: c-1" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el resumen. La consulta tardó demasiado. Referencia: c-1');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
