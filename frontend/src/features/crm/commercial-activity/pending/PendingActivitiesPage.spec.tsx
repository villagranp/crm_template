import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ACTIVITY_DETAIL, ASESOR_PERMISSIONS, bodyOf, FORM_OPTIONS, lastQuery, pendingItem, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';

import { PendingActivitiesPage } from './PendingActivitiesPage';

const COUNTS = { overdue: 1, dueSoon: 2, pending: 3, total: 6 };

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(initialEntry = '/actividad/pendientes') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/pendientes" element={<PendingActivitiesPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function pendingResponse(items: ReturnType<typeof pendingItem>[], counts = COUNTS) {
  return jsonResponse({ data: items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 }, counts });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(signOut);

describe('PendingActivitiesPage (F-22, PF-04.50)', () => {
  it('pestañas con contador y orden por prioridad por defecto (AC-04.7, AC-04.9)', async () => {
    const fetchMock = mockApi({
      'GET /activities/pending': () => pendingResponse([pendingItem()]),
      'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Actividades pendientes' });
    expect(within(table).getByText('Llamar para cotización')).toBeInTheDocument();
    expect(within(table).getByText('Vencida')).toBeInTheDocument();
    expect(within(table).getByText('Alta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas, 6' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vencidas, 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximas a vencer, 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pendientes, 3' })).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/activities/pending').get('sortBy')).toBe('priority');

    await userEvent.click(screen.getByRole('button', { name: 'Vencidas, 1' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/activities/pending').get('bucket')).toBe('OVERDUE'));
  });

  it('completar quita la fila de la bandeja (AC-04.10)', async () => {
    let completed = false;
    const fetchMock = mockApi({
      'GET /activities/pending': () => (completed ? pendingResponse([], { ...COUNTS, overdue: 0, total: 5 }) : pendingResponse([pendingItem()])),
      'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /activities/a-1/completion': () => {
        completed = true;
        return jsonResponse({ ...ACTIVITY_DETAIL, allowedActions: [] });
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Completar ACT-2026-000001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completar actividad' });
    await userEvent.type(await within(dialog).findByLabelText('Notas del resultado'), 'Listo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));

    expect(await screen.findByText('No tienes actividades pendientes')).toBeInTheDocument();
    expect(screen.getByText('Actividad ACT-2026-000001 completada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Todas, 5' })).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities/a-1/completion')[0]).resultNotes).toBe('Listo');
  });

  it('sin COMPLETE en allowedActions no se ofrece "Completar"; "Ver" abre el detalle (AC-04.57)', async () => {
    mockApi({
      'GET /activities/pending': () => pendingResponse([pendingItem({ allowedActions: ['EDIT'] })]),
      'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage();

    await screen.findByText('Llamar para cotización');
    expect(screen.queryByRole('button', { name: 'Completar ACT-2026-000001' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver ACT-2026-000001' }));
    expect(await screen.findByText('En /actividad/actividades/a-1')).toBeInTheDocument();
  });

  it('error con referencia y reintento; vacío con filtros', async () => {
    let calls = 0;
    mockApi({
      'GET /activities/pending': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : pendingResponse([]);
      },
      'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage('/actividad/pendientes?bucket=DUE_SOON');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ninguna actividad pendiente coincide')).toBeInTheDocument();
  });

  it('cambia el orden a vencimiento y filtra por prioridad', async () => {
    const fetchMock = mockApi({
      'GET /activities/pending': () => pendingResponse([pendingItem()]),
      'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Actividades pendientes' });

    await userEvent.click(within(table).getByRole('button', { name: 'Vencimiento' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/activities/pending').get('sortBy')).toBe('dueAt'));

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de pendientes' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Prioridad' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Media' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/activities/pending').get('priorityId')).toBe('pr-media'));
  });
});
