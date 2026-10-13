import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lastQuery, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ForecastPage } from './ForecastPage';
import { row, rowsPage, TOTALS, WINDOW } from './testing/forecast-fixtures';

function api() {
  return mockApi({
    'GET /forecast/window': () => jsonResponse(WINDOW),
    'GET /forecast/rows': () => jsonResponse(rowsPage([row()])),
    'GET /forecast/totals': () => jsonResponse(TOTALS),
    'GET /units-of-measure': () => jsonResponse({ data: [] }),
  });
}

/** Pantalla estrecha (< md): `matchMedia` responde a las consultas `max-width`. */
function simulateNarrowScreen() {
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

describe('ForecastPage (F-20, 03 §E.8)', () => {
  it('sin filtros abre la ventana vigente y la cabecera muestra sus meses reales (AC-03.69)', async () => {
    const fetchMock = api();
    renderWithProviders(<ForecastPage />, { initialEntries: ['/proyectos/forecast'] });

    expect(await screen.findByText('Ventana vigente: M+1 (ene 2027) – M+3 (mar 2027). El mes en curso y los pasados son de solo lectura.')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Matriz del forecast' })).toBeInTheDocument();
    expect(Object.fromEntries(lastQuery(fetchMock, '/forecast/rows'))).toEqual({ mode: 'WINDOW', page: '1', pageSize: '50' });
  });

  it('los filtros de la URL llegan a filas y totales; el modo Historial envía mode=HISTORY con su rango (AC-03.75, AC-03.77)', async () => {
    const fetchMock = api();
    renderWithProviders(<ForecastPage />, { initialEntries: ['/proyectos/forecast?ownerId=u-1&periods=2027-01,2027-02'] });

    await screen.findByRole('table', { name: 'Matriz del forecast' });
    expect(Object.fromEntries(lastQuery(fetchMock, '/forecast/totals'))).toEqual({ mode: 'WINDOW', ownerId: 'u-1', periods: '2027-01,2027-02' });
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Meses: M+1 (ene 2027), M+2 (feb 2027)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Historial' }));
    expect(await screen.findByText('Modo historial: meses pasados, de solo lectura.')).toBeInTheDocument();
    expect(Object.fromEntries(lastQuery(fetchMock, '/forecast/totals'))).toEqual({ mode: 'HISTORY', ownerId: 'u-1' });
  });

  it('en móvil cada fila es una tarjeta con los meses como campos y los totales en un panel', async () => {
    simulateNarrowScreen();
    api();
    renderWithProviders(<ForecastPage />, { initialEntries: ['/proyectos/forecast'] });

    const list = await screen.findByRole('list', { name: 'Filas del forecast' });
    expect(within(list).getByRole('heading', { name: 'VAR-3 · Varilla #3' })).toBeInTheDocument();
    expect(within(list).getByRole('textbox', { name: /M\+2 \(feb 2027\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Totales del forecast' })).getByText('Total de la ventana: 1.40 t')).toBeInTheDocument();
  });
});
