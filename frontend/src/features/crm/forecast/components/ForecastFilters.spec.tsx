import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { WINDOW } from '../testing/forecast-fixtures';

import { ForecastFilters, type ForecastFilterValues } from './ForecastFilters';

beforeEach(() => {
  simulateWideScreen();
  signInWith(['forecast.ver', 'productos.ver']);
  mockApi({
    'GET /products': () => jsonResponse({ data: [PRODUCT], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } }),
  });
});
afterEach(signOut);

function renderFilters(values: ForecastFilterValues, onApply = vi.fn()) {
  const view = renderWithProviders(<ForecastFilters values={values} mode="WINDOW" windowPeriods={WINDOW.periods} onApply={onApply} />);
  return { ...view, onApply };
}

describe('ForecastFilters (AC-03.75)', () => {
  it('el filtro de producto se puede quitar vaciando el selector (revisión E5)', async () => {
    const { onApply, rerender } = renderFilters({});
    const picker = screen.getByRole('combobox', { name: 'Producto' });
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(PRODUCT.sku) }));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ productId: PRODUCT.id }));

    // La URL ya lleva el producto; el usuario vacía el selector y vuelve a aplicar.
    rerender(<ForecastFilters values={{ productId: PRODUCT.id }} mode="WINDOW" windowPeriods={WINDOW.periods} onApply={onApply} />);
    await userEvent.clear(screen.getByRole('combobox', { name: 'Producto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ productId: undefined }));
  });

  it('un producto de la URL sin resolver se conserva al aplicar otros filtros', async () => {
    const { onApply } = renderFilters({ productId: 'pr-url' });
    expect(screen.getByText('Hay un producto filtrado; elige otro o quítalo en los filtros activos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 'pr-url' }));
  });
});
