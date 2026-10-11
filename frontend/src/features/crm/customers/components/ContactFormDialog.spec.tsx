import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { bodyOf, contact, signInWith, signOut, simulateWideScreen } from '../testing/customer-fixtures';

import { ContactFormDialog, type ContactFormDialogProps } from './ContactFormDialog';

const CUSTOMER_REF = { id: 'c-1', legalName: 'Constructora Peña S.A.', crmCode: 'CLI-000001' };

function renderDialog(props: Partial<ContactFormDialogProps> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithProviders(
    <ContactFormDialog open customer={CUSTOMER_REF} contact={null} onClose={onClose} onSaved={onSaved} {...props} />,
  );
  return { onClose, onSaved };
}

async function fillNames(first = 'Ana', last = 'López') {
  await userEvent.type(screen.getByLabelText(/^Nombre/), first);
  await userEvent.type(screen.getByLabelText(/^Apellidos/), last);
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['contactos.ver', 'contactos.crear', 'contactos.editar']);
});
afterEach(signOut);

describe('ContactFormDialog (F-09)', () => {
  it('crea un contacto activo por defecto con el cliente fijo (AC-02.40)', async () => {
    const fetchMock = mockApi({ 'POST /customers/c-1/contacts': () => jsonResponse(contact(), 201) });
    const { onSaved, onClose } = renderDialog();

    expect(screen.getAllByText('CLI-000001 · Constructora Peña S.A.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: /Cliente/ })).not.toBeInTheDocument();
    await fillNames();
    await userEvent.click(screen.getByRole('button', { name: 'Crear contacto' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('Ana López'));
    expect(onClose).toHaveBeenCalled();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/customers/c-1/contacts')[0])).toEqual({
      firstName: 'Ana',
      lastName: 'López',
      jobTitle: null,
      phone: null,
      email: null,
      isActive: true,
      comments: null,
      isPrimary: false,
    });
  });

  it('CONTACT_EMAIL_TAKEN se pinta en el correo (AC-02.43)', async () => {
    mockApi({
      'POST /customers/c-1/contacts': () => errorResponse(409, 'CONTACT_EMAIL_TAKEN', [{ field: 'email', contactId: 'ct-x', isDeleted: false }]),
    });
    renderDialog();

    await fillNames();
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'ANA@pena.example');
    await userEvent.click(screen.getByRole('button', { name: 'Crear contacto' }));

    expect(await screen.findByText('Otro contacto de este cliente ya usa este correo.')).toBeInTheDocument();
  });

  it('POSSIBLE_DUPLICATE pide confirmación y reenvía con los candidatos (AC-02.43)', async () => {
    let posts = 0;
    const fetchMock = mockApi({
      'POST /customers/c-1/contacts': () => {
        posts += 1;
        return posts > 1
          ? jsonResponse(contact({ id: 'ct-2' }), 201)
          : errorResponse(409, 'POSSIBLE_DUPLICATE', [
              { rule: 'nombreCompleto', reason: 'FULL_NAME', candidate: { id: 'ct-ana', fullName: 'Ana López', jobTitle: 'Compras', isDeleted: false } },
            ]);
      },
    });
    const { onSaved } = renderDialog();

    await fillNames();
    await userEvent.click(screen.getByRole('button', { name: 'Crear contacto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Posible contacto duplicado' });
    expect(within(dialog).getByText('Mismo nombre completo')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar de todos modos' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'POST', '/customers/c-1/contacts')[1]).acknowledgedDuplicateIds).toEqual(['ct-ana']);
  });

  it('valida el teléfono con el patrón del país del cliente', async () => {
    const fetchMock = mockApi({});
    renderDialog({ phonePattern: '[0-9]{8}' });

    await fillNames();
    await userEvent.type(screen.getByLabelText(/Teléfono/), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear contacto' }));

    expect(await screen.findByText('El teléfono no tiene un formato válido para el país.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('en edición envía sólo lo cambiado y marca el principal con F13', async () => {
    const fetchMock = mockApi({
      'PATCH /customers/c-1/contacts/ct-ana': () => jsonResponse(contact({ jobTitle: 'Gerencia' })),
      'PUT /customers/c-1/primary-contact': () => jsonResponse({ primaryContact: { id: 'ct-ana', fullName: 'Ana López' } }),
    });
    const { onSaved } = renderDialog({ contact: contact() });

    const jobTitle = screen.getByLabelText(/Cargo/);
    await userEvent.clear(jobTitle);
    await userEvent.type(jobTitle, 'Gerencia');
    await userEvent.click(screen.getByLabelText('Marcar como principal'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/customers/c-1/contacts/ct-ana')[0])).toEqual({ jobTitle: 'Gerencia' });
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/customers/c-1/primary-contact')[0])).toEqual({ contactId: 'ct-ana' });
  });

  it('no deja marcar como principal un contacto inactivo', async () => {
    mockApi({});
    renderDialog();

    await userEvent.click(screen.getByLabelText('Activo'));
    expect(screen.getByLabelText('Marcar como principal')).toBeDisabled();
    expect(screen.getByText('Un contacto inactivo no puede ser el principal.')).toBeInTheDocument();
  });
});
