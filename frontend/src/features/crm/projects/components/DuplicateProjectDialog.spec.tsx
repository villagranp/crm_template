import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { bodyOf, page, project, signInWith, signOut, simulateWideScreen } from '../testing/project-fixtures';

import { DuplicateProjectDialog } from './DuplicateProjectDialog';

const CUSTOMER = { id: 'c-1', crmCode: 'CLI-000001', legalName: 'Constructora Peña S.A.', country: { id: 'gt', isoCode: 'GT', name: 'Guatemala' } };

function api(extra = {}) {
  return mockApi({
    'GET /customers/c-1': () => jsonResponse(CUSTOMER),
    'POST /projects/p-1/duplicate': () => jsonResponse(project({ id: 'p-9', code: 'PRY-2026-00099' }), 201),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.crear', 'clientes.ver']);
});
afterEach(signOut);

describe('DuplicateProjectDialog (F-12)', () => {
  it('pide nombre nuevo, ofrece las casillas por defecto y la nota de lo que no se copia (AC-03.20, RN-03.21–RN-03.23)', async () => {
    const fetchMock = api();
    renderWithProviders(<DuplicateProjectDialog open project={project()} canAdminister={false} onClose={vi.fn()} onDuplicated={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicar proyecto' });

    expect(within(dialog).getByLabelText(/Nombre del proyecto nuevo/)).toHaveValue('');
    expect(within(dialog).getByText('Sugerencia: Copia de Torre Norte')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Ubicación (país, ciudad, dirección)')).toBeChecked();
    expect(within(dialog).getByLabelText('Descripción')).toBeChecked();
    expect(within(dialog).getByLabelText(/^Clasificación/)).toBeChecked();
    expect(within(dialog).getByLabelText('Productos asociados (sin oportunidad, estado inicial)')).not.toBeChecked();
    expect(within(dialog).getByText(/No se copian: código, oportunidades/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Asesor responsable')).toBeDisabled();
    expect(within(dialog).queryByLabelText('Código manual')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar' }));
    expect(await within(dialog).findByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/projects/p-1/duplicate')).toHaveLength(0);
  });

  it('envía sólo lo que cambia respecto al origen y las opciones de copia (AC-03.17, AC-03.19)', async () => {
    const onDuplicated = vi.fn();
    const fetchMock = api();
    renderWithProviders(<DuplicateProjectDialog open project={project()} canAdminister={false} onClose={vi.fn()} onDuplicated={onDuplicated} />);
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/Nombre del proyecto nuevo/), 'Torre Sur');
    await userEvent.clear(within(dialog).getByLabelText('Decisión estimada'));
    await userEvent.click(within(dialog).getByLabelText('Productos asociados (sin oportunidad, estado inicial)'));
    await userEvent.click(within(dialog).getByLabelText('Descripción'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar' }));

    await waitFor(() => expect(onDuplicated).toHaveBeenCalled());
    expect(onDuplicated.mock.calls[0]?.[0]).toMatchObject({ id: 'p-9' });
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects/p-1/duplicate')[0])).toEqual({
      name: 'Torre Sur',
      estimatedDecisionDate: null,
      copy: { location: true, description: false, classification: true, products: true },
    });
  });

  it('con administrar elige asesor y código; los errores del servidor se explican (AC-03.20)', async () => {
    const fetchMock = api({
      'GET /projects/owner-options': () => page([{ id: 'u-2', displayName: 'Luis Asesor', countryId: null, primaryTeam: null }]),
      'POST /projects/p-1/duplicate': () => errorResponse(422, 'CUSTOMER_INACTIVE', [{ field: 'customerId', code: 'CUSTOMER_INACTIVE' }]),
    });
    renderWithProviders(<DuplicateProjectDialog open project={project()} canAdminister onClose={vi.fn()} onDuplicated={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Usar la sugerencia' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Asesor responsable' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Luis Asesor' }));
    await userEvent.type(within(dialog).getByLabelText('Código manual'), 'PRY-X');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar' }));

    expect(await within(dialog).findByText('El cliente está inactivo y no admite proyectos nuevos.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects/p-1/duplicate')[0])).toMatchObject({ name: 'Copia de Torre Norte', ownerId: 'u-2', code: 'PRY-X' });
  });
});
