import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CUSTOMER, GT, LIST_ITEM, page, signInWith, signOut } from '../testing/customer-fixtures';

import { CustomerPicker, type CustomerPickerProps, type CustomerPickerValue } from './CustomerPicker';

function Harness({ initial, onChange }: { initial: CustomerPickerProps['value']; onChange: (value: CustomerPickerValue | null) => void }) {
  const [value, setValue] = useState<CustomerPickerProps['value']>(initial);
  return (
    <CustomerPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(() => signInWith(['clientes.ver']));
afterEach(signOut);

describe('CustomerPicker (AC-02.10)', () => {
  it('busca sólo clientes activos, hasta 10, y entrega id, código CRM, razón social y país', async () => {
    const fetchMock = mockApi({ 'GET /customers': () => page([LIST_ITEM]) });
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={null} onChange={onChange} />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Cliente' }), 'peña');
    await waitFor(() => {
      const url = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
      expect(url.searchParams.get('search')).toBe('peña');
      expect(url.searchParams.get('activeOnly')).toBe('true');
      expect(url.searchParams.get('pageSize')).toBe('10');
    });
    await userEvent.click(await screen.findByRole('option', { name: 'CLI-000001 · Constructora Peña S.A.' }));

    expect(onChange).toHaveBeenCalledWith({ id: 'c-1', crmCode: 'CLI-000001', legalName: 'Constructora Peña S.A.', countryId: GT.id });
  });

  it('resuelve un valor preseleccionado sólo con el id', async () => {
    mockApi({ 'GET /customers/c-1': () => jsonResponse(CUSTOMER) });
    renderWithProviders(<Harness initial={{ id: 'c-1' }} onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('CLI-000001 · Constructora Peña S.A.'));
  });

  it('sin resultados y con error lo dice', async () => {
    let calls = 0;
    mockApi({
      'GET /customers': () => {
        calls += 1;
        return calls === 1 ? page([]) : errorResponse(500, 'INTERNAL_ERROR');
      },
    });
    renderWithProviders(<Harness initial={null} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox', { name: 'Cliente' });
    await userEvent.click(input);
    expect(await screen.findByText('Escribe para buscar')).toBeInTheDocument();
    await userEvent.type(input, 'zz');
    expect(await screen.findByText(/No se pudo buscar clientes/)).toBeInTheDocument();
  });
});
