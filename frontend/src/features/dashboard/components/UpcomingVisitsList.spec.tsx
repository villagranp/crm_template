import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  dashboardRequests,
  resetSession,
  setSessionPermissions,
  upcomingVisit,
  upcomingVisitsPage,
  visitIndicators,
} from '../testing/dashboard-fixtures';
import { UpcomingVisitsList } from './UpcomingVisitsList';

beforeEach(() => setSessionPermissions(['visitas.ver', 'clientes.ver']));
afterEach(resetSession);

describe('UpcomingVisitsList', () => {
  it('lista las visitas en el orden del backend y marca "Recordatorio" si reminderDue (RN-01.25)', async () => {
    mockApi({
      'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
      'GET /dashboard/upcoming-visits': () =>
        jsonResponse(
          upcomingVisitsPage([
            upcomingVisit({ id: 'v-1', code: 'VIS-2026-00001', reminderDue: true }),
            upcomingVisit({
              id: 'v-2',
              code: 'VIS-2026-00002',
              scheduledStartAt: '2026-10-15T15:30:00Z',
              project: null,
            }),
          ]),
        ),
    });
    renderWithProviders(<UpcomingVisitsList />);

    const list = await screen.findByRole('list', { name: 'Próximas visitas' });
    const [first, second] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(first).toHaveTextContent('VIS-2026-00001');
    expect(within(first).getByText('Recordatorio')).toBeInTheDocument();
    expect(first).toHaveTextContent('Programada');
    expect(first).toHaveTextContent('CLI-000123 · Constructora Uno · PRY-2026-00042 · Torre Norte');
    expect(first).toHaveTextContent('Ana López · Presentar la cotización');
    expect(
      within(first).getByRole('link', { name: 'CLI-000123 · Constructora Uno' }),
    ).toHaveAttribute('href', '/clientes/c-1');
    // La ficha de visitas (Módulo 4) aún no está registrada: el código va sin enlace.
    expect(within(first).queryByRole('link', { name: 'VIS-2026-00001' })).not.toBeInTheDocument();

    expect(second).toHaveTextContent('VIS-2026-00002');
    expect(within(second).queryByText('Recordatorio')).not.toBeInTheDocument();
  });

  it('"Ver más" pide hasta 50 visitas', async () => {
    const fetchMock = mockApi({
      'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
      'GET /dashboard/upcoming-visits': () =>
        jsonResponse(upcomingVisitsPage([upcomingVisit()], 12)),
    });
    renderWithProviders(<UpcomingVisitsList />);

    expect(await screen.findByRole('list', { name: 'Próximas visitas' })).toBeInTheDocument();
    expect(dashboardRequests(fetchMock)).toContain('/dashboard/upcoming-visits?page=1&pageSize=5');

    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toContain(
        '/dashboard/upcoming-visits?page=1&pageSize=50',
      ),
    );
  });

  it('vacío con la ventana de días del parámetro', async () => {
    mockApi({
      'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
      'GET /dashboard/upcoming-visits': () => jsonResponse(upcomingVisitsPage([])),
    });
    renderWithProviders(<UpcomingVisitsList />);

    expect(
      await screen.findByText('No tienes visitas en los próximos 7 días.'),
    ).toBeInTheDocument();
  });

  it('error con reintento', async () => {
    mockApi({
      'GET /dashboard/indicators/visits': () => jsonResponse(visitIndicators()),
      'GET /dashboard/upcoming-visits': () => errorResponse(500, 'INTERNAL_ERROR'),
    });
    renderWithProviders(<UpcomingVisitsList />);

    expect(await screen.findByText(/Referencia: corr-test/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
