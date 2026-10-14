import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { OTHER_USER, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';

import { ParticipantsField } from './ParticipantsField';
import { participantValuesFrom, toParticipantInputs, withoutContacts, type ParticipantValue } from './participants';

function Harness({ initial = [], customerId = 'c-1' }: { initial?: ParticipantValue[]; customerId?: string | null }) {
  const [value, setValue] = useState<ParticipantValue[]>(initial);
  return (
    <>
      <ParticipantsField customerId={customerId} value={value} onChange={setValue} />
      <output>{JSON.stringify(toParticipantInputs(value))}</output>
    </>
  );
}

function sent(): unknown {
  return JSON.parse(screen.getByRole('status').textContent ?? '[]');
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['actividades.crear', 'contactos.ver']);
});

afterEach(signOut);

describe('ParticipantsField (RN-04.6)', () => {
  it('añade un contacto activo del cliente, un usuario y un externo, cada uno con un solo sujeto', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /customers/c-1/contacts': () => page([{ id: 'ct-1', fullName: 'Ana López', jobTitle: 'Compras' }]),
      'GET /commercial-activity/owner-options': () => page([OTHER_USER]),
    });
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Contacto del cliente' }));
    await user.click(await screen.findByRole('option', { name: 'Ana López · Compras' }));

    await user.click(screen.getByRole('combobox', { name: 'Añadir' }));
    await user.click(await screen.findByRole('option', { name: 'Usuario interno' }));
    await user.click(screen.getByRole('combobox', { name: 'Usuario interno' }));
    await user.click(await screen.findByRole('option', { name: 'Luis Gerente' }));

    await user.click(screen.getByRole('combobox', { name: 'Añadir' }));
    await user.click(await screen.findByRole('option', { name: 'Externo' }));
    await user.type(screen.getByLabelText('Nombre del participante externo'), 'Pedro Externo{Enter}');

    expect(sent()).toEqual([{ contactId: 'ct-1' }, { userId: 'u-2' }, { externalName: 'Pedro Externo' }]);
    expect(screen.getByText('Ana López · Contacto del cliente')).toBeInTheDocument();
  });

  it('no repite un sujeto y se puede quitar', async () => {
    const user = userEvent.setup();
    mockApi({});
    renderWithProviders(<Harness initial={[{ kind: 'EXTERNAL', externalName: 'Pedro', displayName: 'Pedro' }]} />);

    await user.click(screen.getByRole('combobox', { name: 'Añadir' }));
    await user.click(await screen.findByRole('option', { name: 'Externo' }));
    await user.type(screen.getByLabelText('Nombre del participante externo'), ' pedro {Enter}');
    expect(sent()).toEqual([{ externalName: 'Pedro' }]);

    await user.click(screen.getByTitle('Quitar a Pedro'));
    expect(sent()).toEqual([]);
  });

  it('sin contactos.ver no ofrece contactos; sin cliente pide elegirlo', async () => {
    signInWith(['actividades.crear']);
    mockApi({});
    const { unmount } = renderWithProviders(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Añadir' })).toHaveTextContent('Usuario interno');
    unmount();

    signInWith(['actividades.crear', 'contactos.ver']);
    renderWithProviders(<Harness customerId={null} />);
    expect(screen.getByText('Elige primero el cliente.')).toBeInTheDocument();
  });

  it('convierte los participantes de la respuesta y quita contactos al cambiar de cliente', () => {
    const values = participantValuesFrom([
      { id: '1', role: 'INVITED', kind: 'CONTACT', contactId: 'ct-1', userId: null, displayName: null },
      { id: '2', role: 'ATTENDED', kind: 'USER', userId: 'u-2', contactId: null, displayName: 'Luis' },
    ]);
    expect(values).toEqual([
      { kind: 'CONTACT', contactId: 'ct-1', displayName: null },
      { kind: 'USER', userId: 'u-2', displayName: 'Luis' },
    ]);
    expect(withoutContacts(values)).toEqual([{ kind: 'USER', userId: 'u-2', displayName: 'Luis' }]);
    expect(participantValuesFrom([{ id: '2', role: 'ATTENDED', kind: 'USER', userId: 'u-2', contactId: null, displayName: 'Luis' }], 'INVITED')).toEqual([]);
  });
});
