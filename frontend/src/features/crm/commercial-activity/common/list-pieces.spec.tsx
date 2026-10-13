import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { signInWith, signOut } from '../testing/fixtures';

import { AttachmentCount } from './AttachmentCount';
import { CountrySelect } from './CountrySelect';
import { NextActionDate } from './NextActionDate';

function CountryHarness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CountrySelect value={value} onChange={setValue} />
      <p>{`País: ${value || 'todos'}`}</p>
    </>
  );
}

afterEach(signOut);

describe('AttachmentCount (E.12)', () => {
  it('muestra el número con nombre accesible y una raya sin adjuntos', () => {
    const { rerender } = renderWithProviders(<AttachmentCount count={3} />);
    expect(screen.getByLabelText('3 adjuntos')).toHaveTextContent('3');
    rerender(<AttachmentCount count={1} />);
    expect(screen.getByLabelText('1 adjunto')).toBeInTheDocument();
    rerender(<AttachmentCount count={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('NextActionDate (E.4)', () => {
  it('resalta con texto la fecha de hoy y la pasada; la futura va sin marca', () => {
    const { rerender } = renderWithProviders(<NextActionDate date="2026-10-12" today="2026-10-12" />);
    expect(screen.getByText(/\(hoy\)$/)).toBeInTheDocument();
    rerender(<NextActionDate date="2026-10-01" today="2026-10-12" prefix=" · " />);
    expect(screen.getByText(/^· .*\(pasada\)$/)).toBeInTheDocument();
    rerender(<NextActionDate date="2026-10-20" today="2026-10-12" />);
    expect(screen.queryByText(/\(hoy\)|\(pasada\)/)).not.toBeInTheDocument();
    rerender(<NextActionDate date={null} today="2026-10-12" />);
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });
});

describe('CountrySelect (filtro de país, 04 §F.7)', () => {
  it('ofrece los países de /customers/form-options con clientes.ver', async () => {
    signInWith(['clientes.ver', 'visitas.ver']);
    mockApi({ 'GET /customers/form-options': () => jsonResponse({ countries: [{ id: 'gt', name: 'Guatemala' }, { id: 'sv', name: 'El Salvador' }] }) });
    renderWithProviders(<CountryHarness />);

    const select = screen.getByRole('combobox', { name: 'País' });
    await waitFor(() => expect(select).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'El Salvador' }));
    expect(screen.getByText('País: sv')).toBeInTheDocument();
  });

  it('sin clientes.ver no se ofrece ni se llama a la API', () => {
    signInWith(['visitas.ver']);
    const fetchMock = mockApi({});
    renderWithProviders(<CountryHarness />);

    expect(screen.queryByRole('combobox', { name: 'País' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si la lista falla, queda deshabilitado con su explicación', async () => {
    signInWith(['clientes.ver']);
    mockApi({ 'GET /customers/form-options': () => errorResponse(500, 'INTERNAL_ERROR') });
    renderWithProviders(<CountryHarness initial="gt" />);

    expect(await screen.findByText('No se pudieron cargar los países.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'País' })).toHaveAttribute('aria-disabled', 'true');
  });
});
