import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Customer } from '../customers.api';
import { bodyOf, contact, CUSTOMER, page, signInWith, signOut, simulateWideScreen } from '../testing/customer-fixtures';

import { CustomerContactsSection } from './CustomerContactsSection';

const PRIMARY = contact({ id: 'ct-p1', firstName: 'Pedro', lastName: 'Uno', fullName: 'Pedro Uno', isPrimary: true });
const SECOND = contact({ id: 'ct-p2', firstName: 'Paula', lastName: 'Dos', fullName: 'Paula Dos', email: 'paula@pena.example' });
const INACTIVE = contact({ id: 'ct-x', firstName: 'Inés', lastName: 'Inactiva', fullName: 'Inés Inactiva', isActive: false, email: null });

function lastQuery(fetchMock: Mock): URLSearchParams {
  const urls = fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/customers/c-1/contacts'));
  return urls[urls.length - 1]?.searchParams ?? new URLSearchParams();
}

function renderSection(routes: Record<string, RouteHandler> = {}, customer: Customer = CUSTOMER) {
  const fetchMock = mockApi({ 'GET /customers/c-1/contacts': () => page([PRIMARY, SECOND, INACTIVE]), ...routes });
  renderWithProviders(<CustomerContactsSection customer={customer} />);
  return fetchMock;
}

async function openActions(fullName: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Acciones de ${fullName}` }));
  return screen.findByRole('menu');
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['contactos.ver', 'contactos.crear', 'contactos.editar', 'contactos.eliminar']);
});
afterEach(signOut);

describe('CustomerContactsSection (F-09)', () => {
  it('lista por defecto los activos, con la insignia del principal, y filtra inactivos o todos (AC-02.45)', async () => {
    const fetchMock = renderSection();

    const table = await screen.findByRole('table', { name: 'Contactos' });
    expect(within(table).getByText('Principal')).toBeInTheDocument();
    expect(lastQuery(fetchMock).has('status')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
    await waitFor(() => expect(lastQuery(fetchMock).get('status')).toBe('INACTIVE'));
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(lastQuery(fetchMock).get('status')).toBe('ALL'));
  });

  it('vacío ofrece "Nuevo contacto" si puede crear', async () => {
    renderSection({ 'GET /customers/c-1/contacts': () => page([]) });
    expect(await screen.findByText('Este cliente no tiene contactos')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo contacto' }).length).toBeGreaterThanOrEqual(1);
  });

  it('sin canManageContacts no ofrece crear ni acciones de fila (cliente heredado o ajeno)', async () => {
    renderSection({}, { ...CUSTOMER, capabilities: { ...CUSTOMER.capabilities, canManageContacts: false } });

    await screen.findByRole('table', { name: 'Contactos' });
    expect(screen.queryByRole('button', { name: 'Nuevo contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('marca otro contacto como principal (AC-02.44)', async () => {
    const fetchMock = renderSection({
      'PUT /customers/c-1/primary-contact': () => jsonResponse({ primaryContact: { id: 'ct-p2', fullName: 'Paula Dos' } }),
    });

    const menu = await openActions('Paula Dos');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Marcar como principal/ }));

    expect(await screen.findByText('Paula Dos es ahora el contacto principal.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/customers/c-1/primary-contact')[0])).toEqual({ contactId: 'ct-p2' });
  });

  it('"Marcar como principal" está deshabilitado en un contacto inactivo, con explicación', async () => {
    renderSection();
    const menu = await openActions('Inés Inactiva');
    const item = within(menu).getByRole('menuitem', { name: /Marcar como principal/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).getByText('Un contacto inactivo no puede ser el principal.')).toBeInTheDocument();
  });

  it('desactivar el principal avisa de que el cliente quedará sin principal', async () => {
    const fetchMock = renderSection({
      'PATCH /customers/c-1/contacts/ct-p1': () => jsonResponse({ ...PRIMARY, isActive: false, isPrimary: false }),
    });

    const menu = await openActions('Pedro Uno');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar contacto principal' });
    expect(within(dialog).getByText(/quedará sin contacto principal/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/customers/c-1/contacts/ct-p1')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/customers/c-1/contacts/ct-p1')[0])).toEqual({ isActive: false });
  });

  it('eliminar un contacto con historia ofrece desactivarlo (AC-02.47)', async () => {
    const fetchMock = renderSection({
      'DELETE /customers/c-1/contacts/ct-p2': () => errorResponse(409, 'CONTACT_HAS_HISTORY'),
      'PATCH /customers/c-1/contacts/ct-p2': () => jsonResponse({ ...SECOND, isActive: false }),
    });

    const menu = await openActions('Paula Dos');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Eliminar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminar contacto' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Eliminar' }));

    const fallback = await screen.findByRole('dialog', { name: 'No se puede eliminar el contacto' });
    await userEvent.click(within(fallback).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/customers/c-1/contacts/ct-p2')).toHaveLength(1));
    expect(await screen.findByText('Paula Dos está inactivo.')).toBeInTheDocument();
  });

  it('sin contactos.eliminar no ofrece eliminar ni la vista de eliminados', async () => {
    signInWith(['contactos.ver', 'contactos.editar']);
    renderSection();

    const menu = await openActions('Paula Dos');
    expect(within(menu).queryByRole('menuitem', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminados' })).not.toBeInTheDocument();
  });

  it('con contactos.eliminar lista los eliminados y los restaura (F16)', async () => {
    const deleted = contact({ id: 'ct-del', fullName: 'Dora Borrada', firstName: 'Dora', lastName: 'Borrada', isDeleted: true });
    const fetchMock = renderSection({
      'GET /customers/c-1/contacts': () => page([deleted]),
      'POST /customers/c-1/contacts/ct-del/restore': () => jsonResponse({ ...deleted, isDeleted: false }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminados' }));
    await waitFor(() => expect(lastQuery(fetchMock).get('deleted')).toBe('true'));
    const menu = await openActions('Dora Borrada');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Restaurar' }));
    expect(await screen.findByText('Dora Borrada restaurado.')).toBeInTheDocument();
  });
});
