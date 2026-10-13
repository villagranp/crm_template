import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { FORM_OPTIONS, productsPage, project, projectProduct, READ_ONLY, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { ProjectProductsSection } from './ProjectProductsSection';

const KG = { id: 'u-kg', code: 'KG', symbol: 'kg', dimension: 'MASS' as const };
const VAR = { id: 'u-var', code: 'VAR', symbol: 'var', dimension: 'COUNT' as const };

const LINES = [
  projectProduct(),
  projectProduct({
    id: 'pp-2',
    product: { id: 'pr-mal', sku: 'MAL-6', description: 'Malla 6x6', family: { id: 'f', code: 'MALLA', name: 'Malla' }, isActive: false },
    quantity: '50.0000',
    unit: KG,
    conversion: null,
    tonnage: null,
  }),
  projectProduct({ id: 'pp-3', status: { id: 'ps-descartado', code: 'DESCARTADO', label: 'Descartado', isActive: false } }),
];

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.editar', 'productos.ver']);
});
afterEach(signOut);

describe('ProjectProductsSection (F-19)', () => {
  it('pinta tonelaje o "Sin conversión" y los totales del backend: toneladas, cantidades por unidad y líneas sin conversión (AC-03.62, AC-03.67)', async () => {
    mockApi({
      'GET /projects/p-1/products': () =>
        productsPage(LINES, {
          tonnage: '0.4020',
          quantitiesByUnit: [
            { unit: VAR, quantity: '120.0000' },
            { unit: KG, quantity: '50.0000' },
          ],
          linesWithoutConversion: 1,
        }),
    });

    renderWithProviders(<ProjectProductsSection project={project()} options={FORM_OPTIONS} />);
    expect(await screen.findByText('MAL-6 · Malla 6x6')).toBeInTheDocument();
    expect(screen.getByText('Producto inactivo')).toBeInTheDocument();
    expect(screen.getByText('Sin conversión', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Descartado')).toBeInTheDocument();

    const totals = within(screen.getByLabelText('Totales de productos'));
    expect(totals.getByText('0.40 t')).toBeInTheDocument();
    expect(totals.getByText('120 var · 50 kg')).toBeInTheDocument();
    expect(totals.getByText('1 línea no suma en toneladas')).toBeInTheDocument();
  });

  it('vacío con "Asociar producto"; sin canEdit, sin acciones', async () => {
    mockApi({ 'GET /projects/p-1/products': () => productsPage([]) });

    const { unmount } = renderWithProviders(<ProjectProductsSection project={project()} options={FORM_OPTIONS} />);
    expect(await screen.findByText('Sin productos asociados')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Asociar producto' })).toHaveLength(2);
    unmount();

    mockApi({ 'GET /projects/p-1/products': () => productsPage([projectProduct()]) });
    renderWithProviders(<ProjectProductsSection project={project({ capabilities: READ_ONLY })} options={FORM_OPTIONS} />);
    expect(await screen.findByText('VAR-3 · Varilla corrugada #3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asociar producto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar VAR-3' })).not.toBeInTheDocument();
  });

  it('quitar con forecast en la ventana explica los períodos (AC-03.66); sin forecast la quita', async () => {
    let calls = 0;
    const fetchMock = mockApi({
      'GET /projects/p-1/products': () => productsPage([projectProduct()]),
      'GET /projects/p-1': () => jsonResponse(project()),
      'DELETE /projects/p-1/products/pp-1': () => {
        calls += 1;
        return calls === 1
          ? errorResponse(409, 'PRODUCT_HAS_FORECAST', [{ productId: 'pr-var3', periods: ['2026-11', '2026-12'] }])
          : new Response(null, { status: 204 });
      },
    });

    renderWithProviders(<ProjectProductsSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar VAR-3' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quitar producto' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    expect(await within(dialog).findByText(/tiene forecast en 2026-11, 2026-12/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Producto VAR-3 quitado.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'DELETE', '/projects/p-1/products/pp-1')).toHaveLength(2);
  });

  it('un error de la lista se puede reintentar', async () => {
    let calls = 0;
    mockApi({
      'GET /projects/p-1/products': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : productsPage([projectProduct()]);
      },
    });

    renderWithProviders(<ProjectProductsSection project={project()} options={FORM_OPTIONS} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('VAR-3 · Varilla corrugada #3')).toBeInTheDocument());
  });
});
