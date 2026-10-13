import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CUSTOMER_REF, menu, page, PROJECT_REF, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';

import type { CommercialLinkValue } from './commercial-link';
import { CustomerProjectFields } from './CustomerProjectFields';

const CUSTOMER = { ...CUSTOMER_REF, countryId: 'gt' };
const OTHER_CUSTOMER = { id: 'c-2', crmCode: 'CLI-000002', legalName: 'Ferretería El Sol' };

function customerListItem(customer: { id: string; crmCode: string; legalName: string }) {
  return { ...customer, country: { id: 'gt', isoCode: 'GT', name: 'Guatemala' } };
}

function Harness({ initial }: { initial: CommercialLinkValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CustomerProjectFields withOpportunity value={value} onChange={setValue} />
      <p>{`Cliente: ${value.customer?.crmCode ?? 'ninguno'} · Proyecto: ${value.project?.code ?? 'ninguno'} · Oportunidad: ${value.opportunity?.code ?? 'ninguna'}`}</p>
    </>
  );
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['clientes.ver', 'actividades.crear', 'proyectos.ver']);
});

afterEach(signOut);

describe('CustomerProjectFields (RN-04.1, E.10)', () => {
  it('encadena cliente → proyecto → oportunidad con los contratos de 02 y 03', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])),
      'GET /projects': () => page([{ ...PROJECT_REF, customer: { id: CUSTOMER.id, legalName: CUSTOMER.legalName } }]),
      'GET /projects/p-1/opportunities': () => page([{ id: 'o-1', code: 'OPO-2026-00001', name: 'Fase 1', project: PROJECT_REF }]),
    });
    renderWithProviders(<Harness initial={{ customer: CUSTOMER, project: null, opportunity: null }} />);

    await user.click(await screen.findByRole('combobox', { name: 'Proyecto' }));
    await user.click(await screen.findByRole('option', { name: 'PRY-2026-00001 · Torre Norte' }));
    expect(screen.getByText(/Proyecto: PRY-2026-00001/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Oportunidad' }));
    await user.click(await screen.findByRole('option', { name: 'OPO-2026-00001 · Fase 1' }));
    expect(screen.getByText(/Oportunidad: OPO-2026-00001/)).toBeInTheDocument();
  });

  it('cambiar de cliente limpia proyecto y oportunidad', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])),
      'GET /customers': () => page([customerListItem(CUSTOMER_REF), customerListItem(OTHER_CUSTOMER)]),
    });
    renderWithProviders(<Harness initial={{ customer: CUSTOMER, project: PROJECT_REF, opportunity: { id: 'o-1', code: 'OPO-2026-00001' } }} />);

    await user.click(screen.getByRole('combobox', { name: /Cliente/ }));
    await user.click(await screen.findByRole('option', { name: 'CLI-000002 · Ferretería El Sol' }));

    expect(screen.getByText('Cliente: CLI-000002 · Proyecto: ninguno · Oportunidad: ninguna')).toBeInTheDocument();
  });

  it('sin el módulo de Proyectos en el menú no llama a /projects y lo explica (D-02.10)', async () => {
    const fetchMock = mockApi({ 'GET /me/menu': () => jsonResponse(menu(['clientes-buscar'])) });
    renderWithProviders(<Harness initial={{ customer: CUSTOMER, project: null, opportunity: null }} />);

    expect(await screen.findByText('Disponible cuando el módulo de Proyectos esté activo.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Proyecto' })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/projects'))).toBe(false);
  });

  it('si la API de Proyectos falla, avisa y deja el campo vacío sin romper el formulario', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])),
      'GET /projects': () => errorResponse(404, 'NOT_FOUND'),
    });
    renderWithProviders(<Harness initial={{ customer: CUSTOMER, project: null, opportunity: null }} />);

    await user.click(await screen.findByRole('combobox', { name: 'Proyecto' }));
    expect(await screen.findByText('No se pudieron cargar los proyectos. Puedes guardar sin proyecto.')).toBeInTheDocument();
    expect(screen.getByText('Cliente: CLI-000001 · Proyecto: ninguno · Oportunidad: ninguna')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Cliente/ })).toBeEnabled());
  });

  it('sin cliente, el proyecto pide elegirlo primero y la oportunidad pide el proyecto', async () => {
    mockApi({ 'GET /me/menu': () => jsonResponse(menu(['proyectos-buscar'])) });
    renderWithProviders(<Harness initial={{ customer: null, project: null, opportunity: null }} />);

    expect(await screen.findByText('Elige primero el cliente.')).toBeInTheDocument();
    expect(screen.getByText('Elige primero el proyecto.')).toBeInTheDocument();
  });
});
