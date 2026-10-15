import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Currency, ExchangeRate } from './exchange-rates.api';
import { ExchangeRatesPage } from './ExchangeRatesPage';

const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2, isActive: true },
  { code: 'GTQ', name: 'Quetzal', symbol: 'Q', decimals: 2, isActive: true },
  { code: 'HNL', name: 'Lempira', symbol: 'L', decimals: 2, isActive: true },
  { code: 'VES', name: 'Bolívar', symbol: 'Bs', decimals: 2, isActive: false },
];

const GTQ_RATE: ExchangeRate = {
  id: 'rate-1',
  currencyCode: 'GTQ',
  effectiveDate: '2026-10-01',
  ratePerUsd: '7.75000000',
  source: 'Banguat',
  notes: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  updatedBy: { id: 'user-2', displayName: 'Tesorería' },
};

function page(data: ExchangeRate[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /exchange-rates': () => jsonResponse(page([GTQ_RATE])),
    'GET /currencies': () => jsonResponse({ data: CURRENCIES }),
    ...extra,
  });
}

/** Query string de las consultas `GET /exchange-rates` hechas, como objetos. */
function listQueries(fetchMock: Mock): Record<string, string>[] {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET' &&
        String(input).includes('/exchange-rates'),
    )
    .map(([input]) => Object.fromEntries(new URL(String(input), 'http://localhost').searchParams));
}

beforeEach(() => {
  // jsdom no implementa `matchMedia`: pantalla ancha (vista de tabla, diálogos no a pantalla completa).
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

describe('ExchangeRatesPage (PF-07.47, AC-07.40)', () => {
  it('con sólo parametros.ver consulta tasas y monedas, sin registrar ni corregir', async () => {
    signInWith(['parametros.ver']);
    const fetchMock = api();
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);

    const table = await screen.findByRole('table', { name: 'Tipos de cambio' });
    const row = within(table).getByText('GTQ').closest('tr') as HTMLElement;
    expect(within(row).getByText('01/10/2026')).toBeInTheDocument();
    expect(within(row).getByText('7.75')).toBeInTheDocument();
    expect(within(row).getByText('Tesorería')).toBeInTheDocument();
    expect(
      screen.getByText('Corregir una tasa no recalcula las oportunidades ya guardadas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo tipo de cambio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Corregir/ })).not.toBeInTheDocument();
    expect(listQueries(fetchMock)[0]).toMatchObject({ sortBy: 'effectiveDate', sortOrder: 'desc' });

    await user.click(screen.getByRole('tab', { name: 'Monedas' }));
    const currencies = await screen.findByRole('table', { name: 'Monedas' });
    expect(within(currencies).getByText('USD (base)')).toBeInTheDocument();
    expect(within(currencies).getByText('Inactiva')).toBeInTheDocument();
    expect(within(currencies).queryByRole('button')).not.toBeInTheDocument();
  });

  it('filtra por moneda y rango de fechas en la URL y la consulta; un rango invertido no se envía', async () => {
    signInWith(['parametros.ver']);
    const fetchMock = api();
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);
    await screen.findByRole('table', { name: 'Tipos de cambio' });

    await user.click(screen.getByRole('combobox', { name: 'Moneda' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByRole('option', { name: /^USD/ })).not.toBeInTheDocument();
    await user.click(within(listbox).getByRole('option', { name: 'GTQ — Quetzal' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } });

    await waitFor(() =>
      expect(listQueries(fetchMock).at(-1)).toMatchObject({
        currencyCode: 'GTQ',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    );

    const before = listQueries(fetchMock).length;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-15' } });
    expect(
      await screen.findByText('«Desde» no puede ser posterior a «Hasta».'),
    ).toBeInTheDocument();
    expect(listQueries(fetchMock)).toHaveLength(before);
  });

  it('registra un tipo de cambio: sólo monedas activas distintas de USD, tasa con coma admitida', async () => {
    signInWith(['parametros.ver', 'parametros.configurar']);
    const fetchMock = api({ 'POST /exchange-rates': () => jsonResponse(GTQ_RATE, 201) });
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo tipo de cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo tipo de cambio' });

    await user.click(within(dialog).getByRole('combobox', { name: /Moneda/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByRole('option', { name: /^USD/ })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /^VES/ })).not.toBeInTheDocument();
    await user.click(within(listbox).getByRole('option', { name: 'GTQ — Quetzal' }));
    fireEvent.change(within(dialog).getByLabelText(/Fecha de vigencia/), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Tasa/ }), {
      target: { value: '7,75' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Fuente/ }), {
      target: { value: 'Banguat' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [post] = callsTo(fetchMock, 'POST', '/exchange-rates');
    expect(JSON.parse(String(post?.body))).toEqual({
      currencyCode: 'GTQ',
      effectiveDate: '2026-10-01',
      ratePerUsd: '7.75',
      source: 'Banguat',
    });
  });

  it('valida la tasa en el cliente y explica el 409 EXCHANGE_RATE_DUPLICATE', async () => {
    signInWith(['parametros.ver', 'parametros.configurar']);
    const fetchMock = api({
      'POST /exchange-rates': () => errorResponse(409, 'EXCHANGE_RATE_DUPLICATE'),
    });
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo tipo de cambio' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo tipo de cambio' });
    await user.click(within(dialog).getByRole('combobox', { name: /Moneda/ }));
    await user.click(await screen.findByRole('option', { name: 'GTQ — Quetzal' }));
    fireEvent.change(within(dialog).getByLabelText(/Fecha de vigencia/), {
      target: { value: '2026-10-01' },
    });
    const rate = within(dialog).getByRole('textbox', { name: /Tasa/ });
    fireEvent.change(rate, { target: { value: '0' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Fuente/ }), {
      target: { value: 'Banguat' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByText('La tasa debe ser mayor que 0.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/exchange-rates')).toHaveLength(0);

    fireEvent.change(rate, { target: { value: '7.75' } });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(
      await within(dialog).findByText(
        /Ya hay un tipo de cambio para esa moneda y fecha de vigencia/,
      ),
    ).toBeInTheDocument();
  });

  it('corrige tasa, fuente y notas con la moneda y la fecha bloqueadas', async () => {
    signInWith(['parametros.ver', 'parametros.configurar']);
    const fetchMock = api({
      'PATCH /exchange-rates/rate-1': () => jsonResponse({ ...GTQ_RATE, ratePerUsd: '7.80000000' }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);
    await user.click(await screen.findByRole('button', { name: 'Corregir GTQ del 01/10/2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Corregir tipo de cambio GTQ' });

    expect(within(dialog).getByRole('combobox', { name: /Moneda/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(dialog).getByLabelText(/Fecha de vigencia/)).toBeDisabled();
    expect(
      within(dialog).getByText(/no recalcula las oportunidades ya guardadas/),
    ).toBeInTheDocument();

    const rate = within(dialog).getByRole('textbox', { name: /Tasa/ });
    expect(rate).toHaveValue('7.75');
    fireEvent.change(rate, { target: { value: '7.80' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Notas/ }), {
      target: { value: 'Ajuste' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar corrección' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = callsTo(fetchMock, 'PATCH', '/exchange-rates/rate-1');
    expect(JSON.parse(String(patch?.body))).toEqual({
      ratePerUsd: '7.80',
      source: 'Banguat',
      notes: 'Ajuste',
    });
  });

  it('traduce los motivos de 422 INVALID_EXCHANGE_RATE', async () => {
    signInWith(['parametros.ver', 'parametros.configurar']);
    api({
      'PATCH /exchange-rates/rate-1': () =>
        errorResponse(422, 'INVALID_EXCHANGE_RATE', [
          { field: 'currencyCode', issue: 'inactive_currency' },
        ]),
    });
    const user = userEvent.setup();

    renderWithProviders(<ExchangeRatesPage />);
    await user.click(await screen.findByRole('button', { name: 'Corregir GTQ del 01/10/2026' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar corrección' }));

    expect(
      await within(dialog).findByText(/El tipo de cambio no es válido.*La moneda está inactiva\./),
    ).toBeInTheDocument();
  });

  it('un error de carga se muestra traducido y se puede reintentar', async () => {
    signInWith(['parametros.ver']);
    mockApi({
      'GET /exchange-rates': () => errorResponse(403, 'PERMISSION_DENIED'),
      'GET /currencies': () => jsonResponse({ data: CURRENCIES }),
    });

    renderWithProviders(<ExchangeRatesPage />);

    expect(
      await screen.findByText('No tienes permiso para realizar esta acción.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
