import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ACTIVITY_LIST_ITEM, FORM_OPTIONS, lastQuery, OTHER_USER, page, signInWith, signOut, simulateWideScreen, TYPE_CALL } from '../testing/fixtures';

import { ActivitiesPage } from './ActivitiesPage';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/actividad/actividades') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/actividades" element={<ActivitiesPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function api(list: () => Response | Promise<Response>, extra: Record<string, () => Response | Promise<Response>> = {}) {
  return mockApi({
    'GET /activities': list,
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    ...extra,
  });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['actividades.ver', 'actividades.crear']);
});

afterEach(signOut);

describe('ActivitiesPage (F-30, AC-04.42)', () => {
  it('muestra la carga y después las columnas del listado, con el orden por defecto por vencimiento', async () => {
    const reply = deferred<Response>();
    const fetchMock = api(() => reply.promise);
    renderPage();

    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    reply.resolve(page([ACTIVITY_LIST_ITEM]));

    const table = await screen.findByRole('table', { name: 'Actividades' });
    expect(within(table).getByText('ACT-2026-000001')).toBeInTheDocument();
    expect(within(table).getByText('Llamada')).toBeInTheDocument();
    expect(within(table).getByText('Torre Norte')).toBeInTheDocument();
    expect(within(table).getByText('Próxima a vencer')).toBeInTheDocument();
    expect(within(table).getByText('Alta')).toBeInTheDocument();
    expect(within(table).getByText('2')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/activities');
    expect(query.get('sortBy')).toBe('dueAt');
    expect(query.get('sortOrder')).toBe('asc');
  });

  it('restaura filtros de la URL y convierte el rango de fechas en instantes del día completo', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage(`/actividad/actividades?typeId=${TYPE_CALL.id}&dueFrom=2026-10-01&dueTo=2026-10-31&overdue=true`);

    await screen.findByText('ACT-2026-000001');
    const query = lastQuery(fetchMock, '/activities');
    expect(query.get('typeId')).toBe(TYPE_CALL.id);
    expect(query.get('overdue')).toBe('true');
    expect(query.get('dueFrom')).toBe(new Date('2026-10-01T00:00').toISOString());
    expect(query.get('dueTo')).toBe(new Date('2026-10-31T23:59:59.999').toISOString());
    expect(await screen.findByText('Tipo: Llamada', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Solo vencidas', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Vence desde: 1 oct 2026', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('aplica los filtros combinados desde el panel', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();
    await screen.findByText('ACT-2026-000001');

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de actividades' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Prioridad' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Alta' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/activities').get('priorityId')).toBe('pr-alta'));
  });

  it('vacío sin filtros ofrece crear; con filtros, limpiarlos; error con referencia y reintento', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
    });
    const first = renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay actividades visibles para ti')).toBeInTheDocument();
    first.unmount();

    renderPage('/actividad/actividades?search=zzz');
    expect(await screen.findByText('Ninguna actividad coincide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('"Nueva actividad" ofrece los tipos del catálogo y abre el alta con el tipo', async () => {
    api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();
    await screen.findByText('ACT-2026-000001');

    const [headerButton] = screen.getAllByRole('button', { name: 'Nueva actividad' });
    await userEvent.click(headerButton as HTMLElement);
    const options = await screen.findAllByRole('menuitem');
    expect(options.map((option) => option.textContent)).toEqual(['Llamada', 'Correo', 'Tarea']);
    await userEvent.click(options[0] as HTMLElement);
    expect(await screen.findByText(`En /actividad/actividades/nueva?typeId=${TYPE_CALL.id}`)).toBeInTheDocument();
  });

  it('un refresco de la lista no borra el borrador de filtros sin aplicar (F1)', async () => {
    const user = userEvent.setup();
    const reply = deferred<Response>();
    const fetchMock = api(() => reply.promise);
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de actividades' });
    await user.click(within(filters).getByRole('combobox', { name: 'Prioridad' }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));
    expect(within(filters).getByRole('combobox', { name: 'Prioridad' })).toHaveTextContent('Alta');

    // Llega la lista: la página vuelve a pintarse con los mismos filtros aplicados.
    reply.resolve(page([ACTIVITY_LIST_ITEM]));
    await screen.findByText('ACT-2026-000001');
    expect(within(filters).getByRole('combobox', { name: 'Prioridad' })).toHaveTextContent('Alta');

    await user.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/activities').get('priorityId')).toBe('pr-alta'));
  });

  it('tras recargar, el chip del asesor muestra su nombre (owner-options?id=); si no vuelve, "Seleccionado" (F6)', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]), {
      'GET /commercial-activity/owner-options': () => page([OTHER_USER]),
    });
    const first = renderPage(`/actividad/actividades?ownerId=${OTHER_USER.id}`);

    expect(await screen.findByText('Asesor: Luis Gerente', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/commercial-activity/owner-options').getAll('id')).toEqual([OTHER_USER.id]);
    first.unmount();

    api(() => page([ACTIVITY_LIST_ITEM]), { 'GET /commercial-activity/owner-options': () => page([]) });
    renderPage('/actividad/actividades?ownerId=u-fuera');
    await screen.findByText('ACT-2026-000001');
    expect(await screen.findByText('Asesor: Seleccionado', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('si fallan las opciones del formulario, lo avisa con reintento en lugar de dejar los filtros deshabilitados sin más (F10)', async () => {
    let optionCalls = 0;
    api(() => page([ACTIVITY_LIST_ITEM]), {
      'GET /activities/form-options': () => {
        optionCalls += 1;
        return optionCalls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(FORM_OPTIONS);
      },
    });
    renderPage();

    const alert = await screen.findByText(/No se pudieron cargar los tipos, estados y prioridades/);
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert.closest('.MuiAlert-root') as HTMLElement).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText(/No se pudieron cargar los tipos/)).not.toBeInTheDocument());
    expect(optionCalls).toBe(2);
  });

  it('convierte el rango de fechas en instantes del día en la zona del usuario, no en la del navegador (RN-04.9)', async () => {
    const fetchMock = api(() => page([ACTIVITY_LIST_ITEM]), {
      'GET /activities/form-options': () => jsonResponse({ ...FORM_OPTIONS, timeZone: 'Pacific/Kiritimati', businessTimeZone: 'Pacific/Kiritimati' }),
    });
    renderPage('/actividad/actividades?dueFrom=2026-10-01&dueTo=2026-10-01');

    // Kiritimati: UTC+14 todo el año.
    await waitFor(() => expect(lastQuery(fetchMock, '/activities').get('dueFrom')).toBe('2026-09-30T10:00:00.000Z'));
    expect(lastQuery(fetchMock, '/activities').get('dueTo')).toBe('2026-10-01T09:59:59.999Z');
  });

  it('sin actividades.crear no ofrece "Nueva actividad"; una fila abre el detalle con teclado', async () => {
    signInWith(['actividades.ver']);
    api(() => page([ACTIVITY_LIST_ITEM]));
    renderPage();

    const row = await screen.findByRole('link', { name: /Abrir la actividad ACT-2026-000001/ });
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('En /actividad/actividades/a-1')).toBeInTheDocument();
  });
});
