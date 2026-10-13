import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { OpportunityDetail } from './opportunities.api';
import { OpportunityDetailPage } from './OpportunityDetailPage';
import { detail, FORM_OPTIONS, NO_CAPABILITIES, STAGES } from './testing/opportunity-fixtures';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos/oportunidades/:opportunityId" element={<OpportunityDetailPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: ['/proyectos/oportunidades/o-1'] },
  );
}

const HISTORY = {
  stages: [
    { id: 'h-2', fromStage: STAGES.contactado, toStage: STAGES.cotizando, comment: 'Pidió precios', changedBy: { id: 'u-1', displayName: 'Ana Asesora' }, changedAt: '2026-10-11T15:00:00.000Z' },
    { id: 'h-1', fromStage: null, toStage: STAGES.contactado, comment: null, changedBy: { id: 'u-1', displayName: 'Ana Asesora' }, changedAt: '2026-10-10T15:00:00.000Z' },
  ],
  results: [],
};

function api(opportunity: OpportunityDetail | (() => Response), extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /opportunities/o-1': typeof opportunity === 'function' ? opportunity : () => jsonResponse(opportunity),
    'GET /opportunities/o-1/history': () => jsonResponse(HISTORY),
    'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['oportunidades.ver', 'oportunidades.editar', 'oportunidades.eliminar']);
});
afterEach(signOut);

describe('OpportunityDetailPage (F-17, F-18)', () => {
  it('muestra la estimación con la tasa aplicada y su fecha, el historial de etapas y el enlace al proyecto (AC-03.94, AC-03.47)', async () => {
    api(detail());
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: /OPO-2026-00001/ })).toBeInTheDocument();
    const estimate = screen.getByRole('region', { name: 'Estimación' });
    expect(within(estimate).getByText('GTQ 7,750.00')).toBeInTheDocument();
    expect(within(estimate).getByText('USD 1,000.00')).toBeInTheDocument();
    expect(within(estimate).getByText(/^7\.75 GTQ por USD, vigente desde el /)).toBeInTheDocument();
    expect(within(estimate).getByText('120.50 t')).toBeInTheDocument();

    const stages = screen.getByRole('region', { name: 'Historial de etapas' });
    expect(await within(stages).findByText('Contactado → Cotizando')).toBeInTheDocument();
    expect(within(stages).getByText('Alta en Contactado')).toBeInTheDocument();
    expect(within(stages).getByText('Pidió precios')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'PRY-2026-00042 · Torre Norte' })).toHaveAttribute('href', '/proyectos/p-1?seccion=oportunidades');
  });

  it('las acciones salen de capabilities y allowedTransitions; sin ellas, solo lectura', async () => {
    api(detail());
    const { unmount } = renderPage();
    expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar etapa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modificar resultado' })).not.toBeInTheDocument();
    unmount();

    api(detail({ capabilities: NO_CAPABILITIES }));
    renderPage();
    expect(await screen.findByText('Puedes consultar esta oportunidad, pero no editarla.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument();
  });

  it('eliminar con dependencias explica el bloqueo; sin ellas vuelve a la ficha del proyecto (AC-03.50)', async () => {
    let calls = 0;
    api(detail(), {
      'DELETE /opportunities/o-1': () => {
        calls += 1;
        return calls === 1
          ? errorResponse(409, 'OPPORTUNITY_HAS_DEPENDENCIES', [{ dependency: 'activeProducts', count: 2 }])
          : new Response(null, { status: 204 });
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar oportunidad' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialog).findByText('No se puede eliminar: tiene 2 productos asociados activos.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('En /proyectos/p-1?seccion=oportunidades')).toBeInTheDocument();
  });

  it('inexistente o fuera de alcance: "no existe o no tienes acceso"', async () => {
    api(() => errorResponse(404, 'RESOURCE_NOT_FOUND'));
    renderPage();
    expect(await screen.findByText('Esta oportunidad no existe o no tienes acceso')).toBeInTheDocument();
  });
});
