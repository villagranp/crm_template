import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  ALL_SOURCE_PERMISSIONS,
  alertsPage,
  alertsSummary,
  dashboardAlert,
  dashboardRequests,
  resetSession,
  setSessionPermissions,
} from '../testing/dashboard-fixtures';
import { AlertsPanel } from './AlertsPanel';

const ACTIVITY_ALERT = dashboardAlert({
  id: 'ACTIVIDAD_VENCIDA:a-1',
  type: 'ACTIVIDAD_VENCIDA',
  description: 'Actividad ACT-2026-000042 «Llamar a compras» vencida hace 3 días',
  priority: { code: 'ALTA', label: 'Alta', weight: 3 },
  responsible: { id: 'u-2', displayName: 'Luis Pérez' },
  source: { type: 'ACTIVITY', id: 'a-1', code: 'ACT-2026-000042', projectId: null },
});

beforeEach(() => setSessionPermissions(ALL_SOURCE_PERMISSIONS));
afterEach(resetSession);

describe('AlertsPanel', () => {
  it('PF-01.38: cada alerta muestra todos sus campos y "Abrir" sólo si la ficha de origen está registrada', async () => {
    mockApi({
      'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
      'GET /dashboard/alerts': () => jsonResponse(alertsPage([dashboardAlert(), ACTIVITY_ALERT])),
    });
    renderWithProviders(<AlertsPanel />);

    const panel = screen.getByRole('region', { name: 'Alertas y pendientes' });
    const projectDescription = await within(panel).findByText(
      'Proyecto PRY-2026-00042 sin actualizaciones desde hace 31 días',
    );
    const projectRow = projectDescription.closest('li, tr, [class*="MuiPaper"]') as HTMLElement;

    expect(within(projectRow).getByText('Media')).toBeInTheDocument();
    expect(within(projectRow).getByText('Proyectos sin actualizar')).toBeInTheDocument();
    expect(within(projectRow).getByText('Ana López')).toBeInTheDocument();
    expect(projectRow.querySelector('time')).toHaveAttribute('dateTime', '2026-09-12T10:00:00Z');
    expect(projectRow.querySelector('time')?.getAttribute('title')).toMatch(/2026/);
    expect(within(projectRow).getByText('PRY-2026-00042')).toBeInTheDocument();
    expect(within(projectRow).getByText('PRY-2026-00042 · Torre Norte')).toBeInTheDocument();
    expect(
      within(projectRow).getByRole('link', { name: 'CLI-000123 · Constructora Uno' }),
    ).toHaveAttribute('href', '/clientes/c-1');
    expect(within(projectRow).getByRole('link', { name: 'Abrir PRY-2026-00042' })).toHaveAttribute(
      'href',
      '/proyectos/p-1',
    );

    // La ficha de actividades (Módulo 4) aún no está registrada: sin botón "Abrir".
    const activityRow = within(panel)
      .getByText('Actividad ACT-2026-000042 «Llamar a compras» vencida hace 3 días')
      .closest('li, tr, [class*="MuiPaper"]') as HTMLElement;
    expect(within(activityRow).getByText('Alta')).toBeInTheDocument();
    expect(within(activityRow).getByText('Luis Pérez')).toBeInTheDocument();
    expect(within(activityRow).queryByRole('link', { name: /abrir/i })).not.toBeInTheDocument();
  });

  it('resumen por tipo con conteo y prioridad; el tipo inválido aparece "Desactivada"', async () => {
    mockApi({
      'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
      'GET /dashboard/alerts': () => jsonResponse(alertsPage([])),
    });
    renderWithProviders(<AlertsPanel />);

    const summary = await screen.findByRole('group', { name: 'Resumen por tipo' });
    expect(
      within(summary).getByRole('button', { name: 'Actividades vencidas: 5 · Alta' }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole('button', { name: 'Proyectos sin actualizar: 1 · Media' }),
    ).toBeInTheDocument();
    expect(within(summary).getByText('Visitas sin confirmar: Desactivada')).toBeInTheDocument();
    expect(
      within(summary).queryByRole('button', { name: /visitas sin confirmar/i }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('No tienes alertas pendientes.')).toBeInTheDocument();
  });

  it('un chip del resumen y "Asignadas a mí" filtran la lista en el servidor', async () => {
    const fetchMock = mockApi({
      'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
      'GET /dashboard/alerts': () => jsonResponse(alertsPage([ACTIVITY_ALERT])),
    });
    renderWithProviders(<AlertsPanel />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actividades vencidas: 5 · Alta' }),
    );
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toContain(
        '/dashboard/alerts?page=1&pageSize=10&type=ACTIVIDAD_VENCIDA',
      ),
    );
    expect(screen.getByRole('button', { name: 'Actividades vencidas: 5 · Alta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Asignadas a mí' }));
    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toContain(
        '/dashboard/alerts?page=1&pageSize=10&type=ACTIVIDAD_VENCIDA&mine=true',
      ),
    );
  });

  it('los filtros se leen de la URL (tipo, prioridad, asignadas a mí y orden)', async () => {
    const fetchMock = mockApi({
      'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
      'GET /dashboard/alerts': () => jsonResponse(alertsPage([])),
    });
    renderWithProviders(<AlertsPanel />, {
      initialEntries: [
        '/?alertType=PROYECTO_SIN_ACTUALIZAR&alertPriority=MEDIA&mine=true&alertSort=referenceDate',
      ],
    });

    await waitFor(() =>
      expect(dashboardRequests(fetchMock)).toContain(
        '/dashboard/alerts?page=1&pageSize=10&type=PROYECTO_SIN_ACTUALIZAR&priority=MEDIA&mine=true&sortBy=referenceDate',
      ),
    );
    expect(screen.getByRole('checkbox', { name: 'Asignadas a mí' })).toBeChecked();
  });

  it('error de la bandeja: mensaje con referencia y reintento', async () => {
    let calls = 0;
    mockApi({
      'GET /dashboard/alerts/summary': () => jsonResponse(alertsSummary()),
      'GET /dashboard/alerts': () => {
        calls += 1;
        return calls === 1
          ? errorResponse(500, 'INTERNAL_ERROR')
          : jsonResponse(alertsPage([dashboardAlert()]));
      },
    });
    renderWithProviders(<AlertsPanel />);

    expect(await screen.findByText(/Referencia: corr-test/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Proyecto PRY-2026-00042 sin actualizaciones desde hace 31 días'),
    ).toBeInTheDocument();
  });
});
