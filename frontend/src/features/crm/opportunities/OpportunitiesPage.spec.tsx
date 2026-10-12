import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lastQuery, signInWith, signOut, simulateWideScreen } from '@/features/crm/projects/testing/project-fixtures';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { OpportunitiesPage } from './OpportunitiesPage';
import { detail, FORM_OPTIONS, listItem, paginated, STAGES } from './testing/opportunity-fixtures';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(entry = '/proyectos/oportunidades') {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos/oportunidades" element={<OpportunitiesPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

const USD_ITEM = listItem({
  id: 'o-2',
  code: 'OPO-2026-00002',
  estimatedAmount: '500.0000',
  currencyCode: 'USD',
  exchangeRate: '1.00000000',
  exchangeRateDate: null,
  estimatedAmountUsd: '500.0000',
  nextAction: null,
  nextActionDate: null,
  capabilities: { canEdit: false, canClose: false, canReopen: false, canDelete: false },
});

beforeEach(() => {
  simulateWideScreen();
  signInWith(['oportunidades.ver', 'oportunidades.editar']);
});
afterEach(signOut);

describe('OpportunitiesPage (F-17, 03 §E.7)', () => {
  it('lista: monto original con su moneda y equivalente en USD; aviso sin siguiente acción; abre el detalle (AC-03.94, PF-03.131)', async () => {
    mockApi({
      'GET /opportunities': () => jsonResponse(paginated([listItem(), USD_ITEM])),
      'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Oportunidades' });
    const first = within(table).getByRole('link', { name: /OPO-2026-00001/ });
    expect(within(first).getByText('GTQ 7,750.00')).toBeInTheDocument();
    expect(within(first).getByText('≈ USD 1,000.00')).toBeInTheDocument();
    const second = within(table).getByRole('link', { name: /OPO-2026-00002/ });
    expect(within(second).getByText('USD 500.00')).toBeInTheDocument();
    expect(within(second).queryByText(/≈/)).not.toBeInTheDocument();
    expect(within(second).getByText('Sin siguiente acción')).toBeInTheDocument();
    // Sin canEdit, sin "Cambiar etapa" en esa fila.
    expect(screen.getByRole('button', { name: 'Cambiar etapa de OPO-2026-00001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar etapa de OPO-2026-00002' })).not.toBeInTheDocument();

    await userEvent.click(first);
    expect(await screen.findByText('En /proyectos/oportunidades/o-1')).toBeInTheDocument();
  });

  it('los filtros de Inicio en la URL llegan tal cual a la API (AC-03.86, PF-03.120)', async () => {
    const fetchMock = mockApi({
      'GET /opportunities': () => jsonResponse(paginated([])),
      'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage('/proyectos/oportunidades?status=OPEN&outcome=WON,PARTIAL&decisionFrom=2026-01-01&decisionTo=2026-03-31&sortBy=estimatedAmountUsd&sortOrder=desc');

    expect(await screen.findByText('No hay oportunidades que coincidan con los filtros')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/opportunities');
    expect(Object.fromEntries(query)).toEqual({
      page: '1',
      pageSize: '20',
      sortBy: 'estimatedAmountUsd',
      sortOrder: 'desc',
      status: 'OPEN',
      outcome: 'WON,PARTIAL',
      decisionFrom: '2026-01-01',
      decisionTo: '2026-03-31',
    });
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Resultado: Ganado, Parcial')).toBeInTheDocument();
    expect(within(chips).getByText('Situación: Abiertas')).toBeInTheDocument();
  });

  it('tablero: una columna por etapa en orden con su conteo, "Ver más" y cambio de etapa solo con destinos permitidos (AC-03.46, PF-03.64)', async () => {
    const fetchMock = mockApi({
      'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
      'GET /opportunities/stage-summary': () =>
        jsonResponse({
          stages: [
            { stage: STAGES.ganado, count: 1 },
            { stage: STAGES.contactado, count: 11 },
            { stage: STAGES.cotizando, count: 0 },
          ],
        }),
      'GET /opportunities': (init) => {
        void init;
        const url = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
        const stageId = url.searchParams.get('stageId');
        const page = Number(url.searchParams.get('page'));
        if (stageId === STAGES.contactado.id) {
          return jsonResponse(paginated([listItem({ id: `o-c${page}`, code: `OPO-2026-0001${page}`, stage: STAGES.contactado })], 11, page, 10));
        }
        if (stageId === STAGES.ganado.id) {
          return jsonResponse(paginated([listItem({ id: 'o-g', code: 'OPO-2026-00099', stage: STAGES.ganado })], 1, 1, 10));
        }
        return jsonResponse(paginated([], 0, 1, 10));
      },
      'GET /opportunities/o-c1': () => jsonResponse(detail({ id: 'o-c1', stage: STAGES.contactado, allowedTransitions: [STAGES.cotizando] })),
    });
    renderPage('/proyectos/oportunidades?vista=tablero');

    const board = await screen.findByRole('region', { name: 'Tablero de oportunidades' });
    const columns = within(board).getAllByRole('heading', { level: 2 });
    expect(columns.map((heading) => heading.textContent)).toEqual(['Contactado', 'Cotizando', 'Ganado']);
    expect(within(board).getByLabelText('11 oportunidades')).toBeInTheDocument();
    expect(await within(board).findByText('Sin oportunidades en esta etapa.')).toBeInTheDocument();

    await userEvent.click(await within(board).findByRole('button', { name: 'Ver más' }));
    expect(await within(board).findByText('OPO-2026-00012')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/opportunities/stage-summary').has('page')).toBe(false);

    await userEvent.click(within(board).getByRole('button', { name: 'Cambiar etapa de OPO-2026-00011' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambiar etapa' });
    await userEvent.click(await within(dialog).findByRole('combobox', { name: /Etapa destino/ }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Cotizando']);
  });

  it('un error de la lista se puede reintentar', async () => {
    let calls = 0;
    mockApi({
      'GET /opportunities': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(paginated([listItem()]));
      },
      'GET /opportunities/form-options': () => jsonResponse(FORM_OPTIONS),
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('OPO-2026-00001')).toBeInTheDocument();
  });
});
