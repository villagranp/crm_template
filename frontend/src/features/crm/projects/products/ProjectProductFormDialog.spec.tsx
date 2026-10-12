import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { bodyOf, FORM_OPTIONS, page, PRODUCT, project, projectProduct, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectProductFormDialog } from './ProjectProductFormDialog';

const RULE = {
  id: 'r-var',
  scope: 'PRODUCT',
  factor: '0.00335000',
  fromUnit: { id: 'u-var', code: 'VAR', symbol: 'var' },
  toUnit: { id: 'u-ton', code: 'TON', symbol: 't' },
};

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.editar', 'productos.ver']);
});
afterEach(signOut);

describe('ProjectProductFormDialog (F-19)', () => {
  it('asocia un producto del catálogo con su unidad base por defecto y la vista previa de la regla del backend (AC-03.59, AC-03.60, AC-03.61)', async () => {
    const onSaved = vi.fn();
    const fetchMock = mockApi({
      'GET /products': () => page([PRODUCT]),
      'GET /unit-conversions/resolve': () => jsonResponse({ rule: RULE }),
      'POST /projects/p-1/products': () => jsonResponse(projectProduct(), 201),
      'GET /projects/p-1': () => jsonResponse(project()),
    });

    renderWithProviders(<ProjectProductFormDialog open project={project()} options={FORM_OPTIONS} onClose={vi.fn()} onSaved={onSaved} />);
    const dialog = await screen.findByRole('dialog', { name: 'Asociar producto' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Producto/ }));
    await userEvent.click(await screen.findByRole('option', { name: /VAR-3 · Varilla corrugada #3/ }));
    expect(within(dialog).getByRole('combobox', { name: /Unidad/ })).toHaveTextContent('Varilla (var)');
    await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '120');

    expect(await within(dialog).findByText(/Regla aplicable: Por producto, 1 var = 0\.00335 t\. Tonelaje estimado: 0\.40 t\./)).toBeInTheDocument();
    const products = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/products?'))?.[0]), 'http://localhost');
    expect(products.searchParams.get('isActive')).toBe('true');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Asociar producto' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects/p-1/products')[0])).toEqual({
      productId: 'pr-var3',
      quantity: '120',
      unitId: 'u-var',
      statusId: 'ps-propuesto',
    });
  });

  it('sin regla avisa "Sin conversión"; un duplicado (409) se explica bajo el producto (AC-03.62, AC-03.63)', async () => {
    mockApi({
      'GET /products': () => page([PRODUCT]),
      'GET /unit-conversions/resolve': () => jsonResponse({ rule: null }),
      'POST /projects/p-1/products': () =>
        errorResponse(409, 'PROJECT_PRODUCT_DUPLICATE', [{ field: 'productId', projectProductId: 'pp-1', productId: 'pr-var3', opportunityId: null }]),
    });

    renderWithProviders(<ProjectProductFormDialog open project={project()} options={FORM_OPTIONS} onClose={vi.fn()} onSaved={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Producto/ }));
    await userEvent.click(await screen.findByRole('option', { name: /VAR-3/ }));
    await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '10');
    expect(await within(dialog).findByText(/Sin conversión: no hay regla de esta unidad a toneladas/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Asociar producto' }));
    expect(await within(dialog).findByText('Ese producto ya está asociado al proyecto (con la misma oportunidad).')).toBeInTheDocument();
    expect(within(dialog).getByText('Ya está asociado al proyecto.')).toBeInTheDocument();
  });

  it('edita sólo lo que cambió y no permite cambiar el producto (AC-03.65)', async () => {
    const onSaved = vi.fn();
    const fetchMock = mockApi({
      'GET /unit-conversions/resolve': () => jsonResponse({ rule: RULE }),
      'PATCH /projects/p-1/products/pp-1': () => jsonResponse(projectProduct({ quantity: '150.0000' })),
      'GET /projects/p-1': () => jsonResponse(project()),
    });

    renderWithProviders(
      <ProjectProductFormDialog open project={project()} options={FORM_OPTIONS} line={projectProduct()} onClose={vi.fn()} onSaved={onSaved} />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Editar producto asociado' });
    expect(within(dialog).getByLabelText('Producto')).toBeDisabled();
    const quantity = within(dialog).getByLabelText(/Cantidad/);
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '150');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/projects/p-1/products/pp-1')[0])).toEqual({ quantity: '150' });
  });
});
