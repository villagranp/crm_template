import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { resolveDashboardAccess } from '../dashboard.permissions';
import {
  dashboardRequests,
  recentActivityItem,
  recentActivityPage,
  resetSession,
  setSessionPermissions,
} from '../testing/dashboard-fixtures';
import { RecentActivityPanel } from './RecentActivityPanel';

function accessFor(permissions: string[]) {
  setSessionPermissions(permissions);
  const granted = new Set(permissions);
  return resolveDashboardAccess((permission) => granted.has(permission));
}

afterEach(resetSession);

describe('RecentActivityPanel', () => {
  it('cada evento muestra tipo, fecha, responsable, cliente/proyecto, resumen y enlace a su ficha', async () => {
    mockApi({
      'GET /dashboard/recent-activity': () =>
        jsonResponse(
          recentActivityPage([
            recentActivityItem(),
            recentActivityItem({
              id: 'ACTIVIDAD_REGISTRADA:a-1',
              eventType: 'ACTIVIDAD_REGISTRADA',
              summary: 'Llamar a compras',
              project: null,
              source: { type: 'ACTIVITY', id: 'a-1', code: 'ACT-2026-000042', projectId: null },
            }),
          ]),
        ),
    });
    renderWithProviders(
      <RecentActivityPanel
        access={accessFor(['oportunidades.ver', 'actividades.ver', 'clientes.ver'])}
      />,
    );

    const list = await screen.findByRole('list', { name: 'Actividad reciente' });
    const [opportunity, activity] = within(list).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
    ];

    expect(opportunity).toHaveTextContent('Cambio de etapa · OPO-2026-00042');
    expect(opportunity).toHaveTextContent('Contactado → Cotizando');
    expect(opportunity).toHaveTextContent(
      'Ana López · CLI-000123 · Constructora Uno · PRY-2026-00042 · Torre Norte',
    );
    expect(within(opportunity).getByRole('link', { name: 'OPO-2026-00042' })).toHaveAttribute(
      'href',
      '/proyectos/oportunidades/o-1',
    );
    expect(opportunity.querySelector('time')).toHaveAttribute('dateTime', '2026-10-13T13:00:00Z');

    // La ficha de actividades aún no está registrada: código sin enlace.
    expect(activity).toHaveTextContent('Actividad registrada · ACT-2026-000042');
    expect(
      within(activity).queryByRole('link', { name: 'ACT-2026-000042' }),
    ).not.toBeInTheDocument();
  });

  it('el filtro por tipo sólo ofrece las categorías permitidas y filtra en el servidor', async () => {
    const fetchMock = mockApi({
      'GET /dashboard/recent-activity': () =>
        jsonResponse(recentActivityPage([recentActivityItem()])),
    });
    renderWithProviders(
      <RecentActivityPanel access={accessFor(['oportunidades.ver', 'actividades.ver'])} />,
    );

    const filters = await screen.findByRole('group', { name: 'Filtrar por tipo de evento' });
    expect(
      within(filters)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Todos', 'Actividades', 'Interacciones', 'Oportunidades']);

    await userEvent.click(within(filters).getByRole('button', { name: 'Oportunidades' }));
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toContain(
        '/dashboard/recent-activity?pageSize=20&types=OPORTUNIDAD_ETAPA%2COPORTUNIDAD_CERRADA%2COPORTUNIDAD_RESULTADO%2COPORTUNIDAD_CREADA%2COPORTUNIDAD_ACTUALIZADA&page=1',
      ),
    );
  });

  it('"Cargar más" pide la página siguiente y añade los eventos', async () => {
    const fetchMock = mockApi({
      'GET /dashboard/recent-activity': () => {
        const page =
          dashboardRequests(fetchMock).filter((url) => url.includes('page=2')).length > 0 ? 2 : 1;
        return jsonResponse(
          page === 1
            ? recentActivityPage([recentActivityItem()], 1, 21)
            : recentActivityPage(
                [
                  recentActivityItem({
                    id: 'PROYECTO_CREADO:p-9',
                    eventType: 'PROYECTO_CREADO',
                    summary: 'Alta del proyecto',
                  }),
                ],
                2,
                21,
              ),
        );
      },
    });
    renderWithProviders(
      <RecentActivityPanel access={accessFor(['proyectos.ver', 'oportunidades.ver'])} />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('Alta del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Contactado → Cotizando')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('PF-01.33: vacío "No hay actividad en los últimos 30 días."', async () => {
    mockApi({ 'GET /dashboard/recent-activity': () => jsonResponse(recentActivityPage([])) });
    renderWithProviders(<RecentActivityPanel access={accessFor(['actividades.ver'])} />);

    expect(await screen.findByText('No hay actividad en los últimos 30 días.')).toBeInTheDocument();
    // Con `actividades.ver` se ofrecen Actividades e Interacciones (más "Todos").
    expect(screen.getByRole('group', { name: 'Filtrar por tipo de evento' })).toBeInTheDocument();
  });

  it('PF-01.33: error con reintento y referencia', async () => {
    let calls = 0;
    mockApi({
      'GET /dashboard/recent-activity': () => {
        calls += 1;
        return calls === 1
          ? errorResponse(500, 'INTERNAL_ERROR')
          : jsonResponse(recentActivityPage([recentActivityItem()]));
      },
    });
    renderWithProviders(<RecentActivityPanel access={accessFor(['oportunidades.ver'])} />);

    expect(await screen.findByText(/Referencia: corr-test/)).toBeInTheDocument();
    // Una sola categoría permitida: no hay filtro que ofrecer.
    expect(
      screen.queryByRole('group', { name: 'Filtrar por tipo de evento' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Contactado → Cotizando')).toBeInTheDocument();
  });
});
