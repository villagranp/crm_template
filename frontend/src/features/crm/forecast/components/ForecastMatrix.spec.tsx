import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bodyOf, lastQuery, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';
import { bottomNavOffset } from '@/theme/tokens';

import type { ForecastFilters } from '../forecast.api';
import { cell, KG, row, rowsPage, savedCell, TOTALS, VAR } from '../testing/forecast-fixtures';

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

/** Pantalla estrecha (< md): tarjetas en lugar de tabla. */
function simulateNarrowScreen(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
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

  it('si la consulta falla con un borrador, el borrador sigue protegido y guardable (revisión E5, F1)', async () => {
    let failing = false;
    const fetchMock = api(() => (failing ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(rowsPage([row()]))), {
      'PUT /forecast/lines': () => jsonResponse(SAVE_RESULT),
    });
    const view = renderWithProviders(<ForecastMatrix filters={FILTERS} />);
    await userEvent.type(await screen.findByRole('textbox', { name: /M\+2/ }), '7');

    // Cambio de filtro → la nueva consulta falla.
    failing = true;
    view.rerender(<ForecastMatrix filters={{ ...FILTERS, productId: 'pr-otro' }} />);
    expect(await screen.findByText('No se pudo cargar el forecast')).toBeInTheDocument();
    expect(screen.getByText(/Tus cambios sin guardar se conservan/)).toBeInTheDocument();

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const bar = screen.getByRole('region', { name: 'Cambios sin guardar' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Guardar cambios (1)' }));
    await waitFor(() => expect(callsTo(fetchMock, 'PUT', '/forecast/lines')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/forecast/lines')[0])).toEqual({
      lines: [{ projectId: 'p-1', productId: 'pr-var3', year: 2027, month: 2, quantity: '7' }],
    });
  });

  it('la barra de guardado queda por encima de la barra inferior de móvil (revisión E5, F3)', async () => {
    api(() => jsonResponse(rowsPage([row()])));
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);
    await userEvent.type(await screen.findByRole('textbox', { name: /M\+2/ }), '7');

    // jsdom no entiende `env()` en getComputedStyle: se lee la regla que emotion generó para la barra.
    const bar = screen.getByRole('region', { name: 'Cambios sin guardar' });
    const css = Array.from(document.querySelectorAll('style'), (style) => style.textContent ?? '').join('\n');
    const rules = Array.from(bar.classList, (name) => name)
      .filter((name) => name.startsWith('css-'))
      .flatMap((name) => css.match(new RegExp(`\\.${name}\\{[^}]*\\}`, 'g')) ?? []);
    // Base (xs, con la barra inferior de móvil): encima de ella y de la safe area; desde md, abajo del todo.
    expect(rules.some((rule) => rule.includes('position:sticky'))).toBe(true);
    expect(rules).toContain(`.${rules[0]?.slice(1, rules[0].indexOf('{'))}{bottom:${bottomNavOffset};}`);
    expect(rules.filter((rule) => rule.endsWith('{bottom:0;}'))).toHaveLength(2);
  });

  it('cambiar solo la unidad de una fila sin líneas no deja un borrador que bloquee (revisión E5)', async () => {
    api(() => jsonResponse(rowsPage([row({ cells: [cell(1), cell(2), cell(3)] })])), {
      'GET /units-of-measure': () => jsonResponse({ data: [VAR, KG] }),
    });
    signInWith(['forecast.ver', 'forecast.editar', 'proyectos.ver']);
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    await userEvent.click(await screen.findByRole('combobox', { name: 'Unidad de VAR-3' }));
    await userEvent.click(await screen.findByRole('option', { name: /KG/ }));
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('con varias páginas el subtotal del proyecto se rotula como de la página; la celda de solo lectura tiene rol', async () => {
    api(() => jsonResponse(rowsPage([row({ cells: [savedCell(1, '120.0000', { editable: false }), cell(2), cell(3)] })], 120)));
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);

    expect(await screen.findByText('Asesor: Ana Asesora · Subtotal en esta página: 0.40 t')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /M\+1 \(ene 2027\): 120 var\./ })).toBeInTheDocument();
  });

  it('una sola página: "Subtotal"; en móvil, el total de la fila incluye las cantidades por unidad', async () => {
    api(() => jsonResponse(rowsPage([row()])));
    const view = renderWithProviders(<ForecastMatrix filters={FILTERS} />);
    expect(await screen.findByText('Asesor: Ana Asesora · Subtotal: 0.40 t')).toBeInTheDocument();
    view.unmount();

    simulateNarrowScreen();
    renderWithProviders(<ForecastMatrix filters={FILTERS} />);
    expect(await screen.findByText(/^Total fila: 120 var · 0\.40 t/)).toBeInTheDocument();
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
