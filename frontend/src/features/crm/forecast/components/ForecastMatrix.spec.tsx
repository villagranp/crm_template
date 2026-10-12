import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bodyOf, lastQuery, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { ForecastFilters } from '../forecast.api';
import { cell, KG, row, rowsPage, savedCell, TOTALS } from '../testing/forecast-fixtures';

import { ForecastMatrix } from './ForecastMatrix';

const FILTERS: ForecastFilters = { mode: 'WINDOW', projectId: 'p-1' };
const SAVE_RESULT = { created: 1, updated: 1, unchanged: 0, lines: [] };

function api(rows: RouteHandler, extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /forecast/rows': rows,
    'GET /forecast/totals': () => jsonResponse(TOTALS),
    'GET /units-of-measure': () => jsonResponse({ data: [] }),
    ...extra,
  });
}

/** Campo de una celda por producto y mes ("Cantidad de VAR-3 … en M+1 (ene 2027)"). */
function cellInput(month: string) {
  return screen.getByRole('textbox', { name: new RegExp(`^Cantidad de VAR-3 .*${month}`) });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['forecast.ver', 'forecast.editar']);
});
afterEach(signOut);

describe('ForecastMatrix (PF-03.101, PF-03.107)', () => {
  it('pinta los meses de la ventana, las celdas editables y de solo lectura, y el pie con los totales del backend (AC-03.72, AC-03.74, AC-03.76)', async () => {
    const fetchMock = api(() =>
      jsonResponse(rowsPage([row({ cells: [savedCell(1, '120.0000', { editable: false }), cell(2), cell(3, { hasConversion: false })] })])),
    );
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    const table = await screen.findByRole('table', { name: 'Matriz del forecast' });
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Producto (SKU · descripción)', 'Unidad', 'M+1 (ene 2027)', 'M+2 (feb 2027)', 'M+3 (mar 2027)', 'Total fila', 'Actualizado']);
    expect(within(table).getByText('PRY-2026-00042 · Torre Norte')).toBeInTheDocument();
    // Enero es de solo lectura: sin campo, con su fecha de actualización accesible.
    expect(screen.queryByRole('textbox', { name: /M\+1/ })).not.toBeInTheDocument();
    expect(within(table).getByLabelText(/M\+1 \(ene 2027\): 120 var\. Actualizado el .* por Ana Asesora/)).toBeInTheDocument();
    expect(cellInput('M\\+2')).toBeEnabled();

    const footer = within(table).getByLabelText('Totales del forecast');
    expect(within(footer).getByLabelText('Total toneladas M+2 (feb 2027)')).toHaveTextContent('1.00 t');
    expect(within(footer).getByLabelText('Acumulado M+2 (feb 2027)')).toHaveTextContent('1.40 t');
    expect(within(footer).getByLabelText('Total de la ventana')).toHaveTextContent('1.40 t');
    expect(within(footer).getByText('2 líneas sin conversión no suman en toneladas.')).toBeInTheDocument();
    await userEvent.click(within(footer).getByRole('button', { name: 'Cantidades por unidad' }));
    expect(within(footer).getByText('KG (kg)')).toBeInTheDocument();
    expect(within(footer).getAllByText('1,000 kg')).toHaveLength(2);

    expect(Object.fromEntries(lastQuery(fetchMock, '/forecast/rows'))).toEqual({ mode: 'WINDOW', projectId: 'p-1', page: '1', pageSize: '50' });
    expect(Object.fromEntries(lastQuery(fetchMock, '/forecast/totals'))).toEqual({ mode: 'WINDOW', projectId: 'p-1' });
  });

  it('borrador: marca las celdas, previsualiza con el factor del backend y guarda solo lo cambiado con expectedUpdatedAt (AC-03.70)', async () => {
    const fetchMock = api(() => jsonResponse(rowsPage([row()])), { 'PUT /forecast/lines': () => jsonResponse(SAVE_RESULT) });
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /M\+2/ }), '1000');
    expect(screen.getByText('≈ 3.35 t')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /M\+2 \(feb 2027\) \(cambio sin guardar\)/ })).toBeInTheDocument();
    const enero = cellInput('M\\+1');
    await userEvent.clear(enero);
    await userEvent.type(enero, '0');

    const bar = screen.getByRole('region', { name: 'Cambios sin guardar' });
    expect(within(bar).getByText('2 celdas cambiadas sin guardar.')).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Guardar cambios (2)' }));

    expect(await screen.findByText('Cambios guardados: 1 nueva, 1 actualizada.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/forecast/lines')[0])).toEqual({
      lines: [
        { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 1, quantity: '0', expectedUpdatedAt: '2026-12-01T15:00:00.000Z' },
        { projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 2, quantity: '1000' },
      ],
    });
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
  });

  it('valida en local y pinta en su celda los errores lines[i] del servidor (AC-03.71)', async () => {
    const fetchMock = api(() => jsonResponse(rowsPage([row()])), {
      'PUT /forecast/lines': () => errorResponse(422, 'PRODUCT_NOT_ASSOCIATED', [{ field: 'lines[0].productId', code: 'PRODUCT_NOT_ASSOCIATED', message: 'x', index: 0 }]),
    });
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    await userEvent.type(await screen.findByRole('textbox', { name: /M\+3/ }), '1,5');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios (1)' }));
    expect(screen.getByText('Corrige las celdas marcadas antes de guardar.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un número válido (punto como separador decimal).')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'PUT', '/forecast/lines')).toHaveLength(0);

    const marzo = screen.getByRole('textbox', { name: /M\+3/ });
    await userEvent.clear(marzo);
    await userEvent.type(marzo, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios (1)' }));
    expect(await screen.findByText('El producto ya no está asociado al proyecto.')).toBeInTheDocument();
  });

  it('409 FORECAST_LINE_STALE avisa y "Recargar" toma el valor del otro usuario conservando el resto del borrador (AC-03.82)', async () => {
    let version = 0;
    const fetchMock = api(
      () =>
        jsonResponse(
          rowsPage([row({ cells: [savedCell(1, version === 0 ? '120.0000' : '130.0000', { updatedAt: version === 0 ? '2026-12-01T15:00:00.000Z' : '2026-12-05T10:00:00.000Z' }), cell(2), cell(3)] })]),
        ),
      {
        'PUT /forecast/lines': () => {
          version = 1;
          return errorResponse(409, 'FORECAST_LINE_STALE', [{ index: 0, lineId: 'l-1', updatedAt: '2026-12-05T10:00:00.000Z' }]);
        },
      },
    );
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    const enero = await screen.findByRole('textbox', { name: /M\+1/ });
    await userEvent.clear(enero);
    await userEvent.type(enero, '150');
    await userEvent.type(cellInput('M\\+2'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios (2)' }));

    const alert = await screen.findByText(/Otro usuario modificó una de estas celdas/);
    expect(screen.getByText('Otro usuario modificó esta celda.')).toBeInTheDocument();
    await userEvent.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Recargar' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: /M\+1/ })).toHaveValue('130'));
    expect(screen.getByRole('button', { name: 'Guardar cambios (1)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /M\+2 .*cambio sin guardar/ })).toHaveValue('10');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/forecast/rows?')).length).toBeGreaterThan(1);
  });

  it('teclado: Enter baja a la fila siguiente y Escape revierte la celda', async () => {
    const second = row({ product: { id: 'pr-kg', sku: 'MAL-6', description: 'Malla', family: { id: 'f', code: 'MALLA', name: 'Malla' } }, unit: KG });
    api(() => jsonResponse(rowsPage([row(), second])));
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    const febrero = await screen.findByRole('textbox', { name: /^Cantidad de VAR-3 .*M\+2/ });
    await userEvent.type(febrero, '5{Enter}');
    expect(screen.getByRole('textbox', { name: /^Cantidad de MAL-6 .*M\+2/ })).toHaveFocus();

    await userEvent.click(screen.getByRole('textbox', { name: /^Cantidad de VAR-3 .*M\+2/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Cantidad de VAR-3 .*M\+2/ })).toHaveValue('');
  });

  it('vacío y error con reintento', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(rowsPage([]));
    });
    renderWithProviders(<ForecastMatrix filters={FILTERS} emptyTitle="Sin forecast" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin forecast')).toBeInTheDocument();
  });
});
