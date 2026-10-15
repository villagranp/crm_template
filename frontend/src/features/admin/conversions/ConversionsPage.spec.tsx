import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { ConversionRule, FamilyOption, UnitOption } from './conversions.api';
import { ConversionsPage } from './ConversionsPage';

const TON: UnitOption = {
  id: 'unit-ton',
  code: 'TON',
  name: 'Tonelada',
  symbol: 't',
  dimension: 'MASS',
};
const KG: UnitOption = {
  id: 'unit-kg',
  code: 'KG',
  name: 'Kilogramo',
  symbol: 'kg',
  dimension: 'MASS',
};
const FAMILY: FamilyOption = { id: 'fam-1', code: 'ACERO', name: 'Acero' };

function rule(overrides: Partial<ConversionRule>): ConversionRule {
  return {
    id: 'rule-kg',
    fromUnit: { id: KG.id, code: KG.code, symbol: KG.symbol },
    toUnit: { id: TON.id, code: TON.code, symbol: TON.symbol },
    factor: '0.00100000',
    scope: 'GLOBAL',
    product: null,
    productFamily: null,
    projectType: null,
    description: null,
    isActive: true,
    isIdentity: false,
    isProtected: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const IDENTITY = rule({
  id: 'rule-ton',
  fromUnit: { id: TON.id, code: TON.code, symbol: TON.symbol },
  factor: '1.00000000',
  isIdentity: true,
  isProtected: true,
});
const KG_RULE = rule({});
const FAMILY_RULE = rule({
  id: 'rule-fam',
  scope: 'PRODUCT_FAMILY',
  productFamily: FAMILY,
  factor: '0.00095000',
});

function page<T>(data: T[]) {
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
    'GET /unit-conversion-rules': () => jsonResponse(page([IDENTITY, KG_RULE, FAMILY_RULE])),
    'GET /units-of-measure': () => jsonResponse(page([TON, KG])),
    'GET /product-families': () => jsonResponse(page([FAMILY])),
    'GET /parameters': () =>
      jsonResponse({
        data: [
          { group: 'crm', parameters: [{ key: 'crm.forecast.unidad_tonelaje', value: 'TON' }] },
        ],
      }),
    ...extra,
  });
}

function ruleQueries(fetchMock: Mock): Record<string, string>[] {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET' &&
        String(input).includes('/unit-conversion-rules'),
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

describe('ConversionsPage', () => {
  it('lista reglas con su ámbito; la identidad aparece protegida; sin productos.configurar no hay acciones', async () => {
    signInWith(['productos.ver']);
    api();

    renderWithProviders(<ConversionsPage />);

    const table = await screen.findByRole('table', { name: 'Reglas de conversión' });
    const identityRow = within(table).getByText('TON → TON').closest('tr') as HTMLElement;
    expect(within(identityRow).getByText('Identidad protegida')).toBeInTheDocument();
    const familyRow = within(table).getByText('0.00095').closest('tr') as HTMLElement;
    expect(within(familyRow).getByText('Familia')).toBeInTheDocument();
    expect(await within(familyRow).findByText('Acero')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva regla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it('la regla identidad no se puede desactivar; las demás sí', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({
      'PATCH /unit-conversion-rules/rule-kg': () => jsonResponse({ ...KG_RULE, isActive: false }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ConversionsPage />);
    await screen.findByRole('table', { name: 'Reglas de conversión' });

    expect(screen.queryByRole('button', { name: 'Desactivar TON → TON' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar TON → TON' })).toBeInTheDocument();

    const [kgDeactivate] = screen.getAllByRole('button', { name: 'Desactivar KG → TON' });
    await user.click(kgDeactivate as HTMLElement);
    const confirm = screen.getByRole('dialog', { name: 'Desactivar regla' });
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'PATCH', '/unit-conversion-rules/rule-kg')).toHaveLength(1),
    );
    const [patch] = callsTo(fetchMock, 'PATCH', '/unit-conversion-rules/rule-kg');
    expect(JSON.parse(String(patch?.body))).toEqual({ isActive: false });
  });

  it('filtra por ámbito y unidad de origen en la consulta', async () => {
    signInWith(['productos.ver']);
    const fetchMock = api();
    const user = userEvent.setup();

    renderWithProviders(<ConversionsPage />);
    await screen.findByRole('table', { name: 'Reglas de conversión' });

    await user.click(screen.getByRole('button', { name: /^Familia/ }));
    await user.click(screen.getByRole('combobox', { name: 'Unidad de origen' }));
    await user.click(await screen.findByRole('option', { name: 'Kilogramo (KG)' }));

    await waitFor(() =>
      expect(ruleQueries(fetchMock).at(-1)).toMatchObject({
        scope: 'PRODUCT_FAMILY',
        fromUnitId: 'unit-kg',
      }),
    );
  });

  it('crea una regla con el destino fijado en la unidad de tonelaje', async () => {
    signInWith(['productos.ver', 'productos.configurar', 'parametros.ver']);
    const fetchMock = api({ 'POST /unit-conversion-rules': () => jsonResponse(KG_RULE, 201) });
    const user = userEvent.setup();

    renderWithProviders(<ConversionsPage />);
    await screen.findByRole('table', { name: 'Reglas de conversión' });
    await user.click(screen.getByRole('button', { name: 'Nueva regla' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva regla de conversión' });

    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /Destino/ })).toHaveTextContent(
        'Tonelada (TON)',
      ),
    );
    expect(within(dialog).getByRole('combobox', { name: /Destino/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(within(dialog).getByRole('combobox', { name: /Origen/ }));
    await user.click(await screen.findByRole('option', { name: 'Kilogramo (KG)' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Ámbito/ }));
    await user.click(await screen.findByRole('option', { name: 'Familia' }));
    await user.click(await within(dialog).findByRole('combobox', { name: /Familia/ }));
    await user.click(await screen.findByRole('option', { name: 'Acero' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Factor/ }), {
      target: { value: '0,00095' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Crear regla' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [post] = callsTo(fetchMock, 'POST', '/unit-conversion-rules');
    expect(JSON.parse(String(post?.body))).toEqual({
      fromUnitId: 'unit-kg',
      toUnitId: 'unit-ton',
      factor: '0.00095',
      scope: 'PRODUCT_FAMILY',
      productFamilyId: 'fam-1',
    });
  });

  it('un duplicado explica el 409 y el destino incorrecto el 422 INVALID_CONVERSION_TARGET', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    let reply = errorResponse(409, 'RESOURCE_CONFLICT');
    api({ 'POST /unit-conversion-rules': () => reply });
    const user = userEvent.setup();

    renderWithProviders(<ConversionsPage />);
    await screen.findByRole('table', { name: 'Reglas de conversión' });
    await user.click(screen.getByRole('button', { name: 'Nueva regla' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva regla de conversión' });

    await user.click(within(dialog).getByRole('combobox', { name: /Origen/ }));
    await user.click(await screen.findByRole('option', { name: 'Kilogramo (KG)' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Destino/ }));
    await user.click(await screen.findByRole('option', { name: 'Kilogramo (KG)' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Factor/ }), {
      target: { value: '0.001' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Crear regla' }));
    expect(
      await within(dialog).findByText('Ya existe una regla con ese origen, destino y ámbito.'),
    ).toBeInTheDocument();

    reply = errorResponse(422, 'INVALID_CONVERSION_TARGET');
    await user.click(within(dialog).getByRole('button', { name: 'Crear regla' }));
    expect(
      await within(dialog).findByText(
        'La unidad destino debe ser la unidad de tonelaje configurada.',
      ),
    ).toBeInTheDocument();
  });

  it('editar la regla identidad bloquea el factor y sólo envía la descripción', async () => {
    signInWith(['productos.ver', 'productos.configurar']);
    const fetchMock = api({
      'PATCH /unit-conversion-rules/rule-ton': () => jsonResponse(IDENTITY),
    });
    const user = userEvent.setup();

    renderWithProviders(<ConversionsPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar TON → TON' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar regla TON → TON' });
    expect(within(dialog).getByRole('textbox', { name: /Factor/ })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Descripción/ }), {
      target: { value: 'Identidad' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'PATCH', '/unit-conversion-rules/rule-ton')).toHaveLength(1),
    );
    const [patch] = callsTo(fetchMock, 'PATCH', '/unit-conversion-rules/rule-ton');
    expect(JSON.parse(String(patch?.body))).toEqual({ description: 'Identidad' });
  });

  it('un error de carga se muestra traducido y se puede reintentar', async () => {
    signInWith(['productos.ver']);
    api({ 'GET /unit-conversion-rules': () => errorResponse(403, 'PERMISSION_DENIED') });

    renderWithProviders(<ConversionsPage />);

    expect(
      await screen.findByText('No tienes permiso para realizar esta acción.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
