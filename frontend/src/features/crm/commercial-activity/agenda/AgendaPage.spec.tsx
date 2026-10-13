import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callsTo, deferred, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  AGENDA_ACTIVITY,
  AGENDA_VISIT,
  agendaItem,
  calendarResponse,
  countriesResponse,
  customerLookupResponse,
  localEndOfDayIso,
  localIso,
  simulateNarrowScreen,
} from '../testing/agenda-fixtures';
import { ACTIVITY_DETAIL, ASESOR_PERMISSIONS, bodyOf, FORM_OPTIONS, lastQuery, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';

import { AgendaPage } from './AgendaPage';

const ACTIVITY_LABEL = '10:00 a.m., Llamada: Seguimiento de cotización; cliente: Constructora Peña S.A.; estado: Pendiente';
const VISIT_LABEL = '9:00 a.m., Visita: Presentar catálogo; cliente: Constructora Peña S.A.; estado: Cancelada, Reprogramada; 2 adjuntos';
const DETAIL_A9 = { ...ACTIVITY_DETAIL, id: 'a-9', code: 'ACT-2026-000009', subject: 'Seguimiento de cotización' };

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry = '/actividad/agenda') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/actividad/agenda"
        element={
          <>
            <AgendaPage />
            <LocationProbe />
          </>
        }
      />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

function currentUrl(): string {
  return screen.getByTestId('location').textContent ?? '';
}

function api(routes: { calendar?: RouteHandler; list?: RouteHandler; [route: string]: RouteHandler | undefined }) {
  const { calendar, list, ...rest } = routes;
  const handlers: Record<string, RouteHandler> = {
    'GET /agenda/calendar': calendar ?? (() => calendarResponse([AGENDA_ACTIVITY, AGENDA_VISIT])),
    'GET /agenda': list ?? (() => page([AGENDA_ACTIVITY, AGENDA_VISIT])),
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /customers/form-options': () => countriesResponse(),
    'GET /customers/c-1': () => customerLookupResponse(),
    'GET /activities/a-9': () => jsonResponse(DETAIL_A9),
  };
  for (const [key, handler] of Object.entries(rest)) {
    if (handler) {
      handlers[key] = handler;
    }
  }
  return mockApi(handlers);
}

function calendarQuery(fetchMock: Parameters<typeof lastQuery>[0]) {
  return lastQuery(fetchMock, '/agenda/calendar');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 12, 8, 0));
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(() => {
  signOut();
  vi.useRealTimers();
});

describe('AgendaPage — calendario (F-21, PF-04.48)', () => {
  it('abre en Mes con el rango de la rejilla visible, cada evento en su día y hoy marcado (AC-04.1)', async () => {
    const fetchMock = api({});
    renderPage();

    expect(screen.getByRole('heading', { name: 'Agenda', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'octubre de 2026', level: 2 })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');

    const thursday = await screen.findByRole('region', { name: 'jueves, 15 de octubre de 2026: 1 evento' });
    expect(within(thursday).getByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
    const today = screen.getByRole('region', { name: 'lunes, 12 de octubre de 2026: 1 evento' });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(within(today).getByRole('button', { name: VISIT_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'domingo, 1 de noviembre de 2026: Sin eventos' })).not.toHaveAttribute('aria-current');

    const query = calendarQuery(fetchMock);
    expect(query.get('from')).toBe(localIso(2026, 9, 28));
    expect(query.get('to')).toBe(localEndOfDayIso(2026, 11, 1));
    expect(query.get('kind')).toBeNull();
  });

  it('navega anterior / hoy / siguiente y entre Mes, Semana y Día, con el estado en la URL (AC-04.3)', async () => {
    const fetchMock = api({});
    renderPage();
    await screen.findByRole('button', { name: ACTIVITY_LABEL });

    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('heading', { name: 'noviembre de 2026', level: 2 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/actividad/agenda?date=2026-11-12');
    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 26)));
    expect(calendarQuery(fetchMock).get('to')).toBe(localEndOfDayIso(2026, 12, 6));

    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByRole('heading', { name: 'octubre de 2026', level: 2 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/actividad/agenda');

    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(screen.getByRole('heading', { name: '12 – 18 oct 2026', level: 2 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/actividad/agenda?mode=week');
    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 12)));
    expect(calendarQuery(fetchMock).get('to')).toBe(localEndOfDayIso(2026, 10, 18));
    expect(await screen.findByRole('region', { name: 'jueves, 15 de octubre de 2026: 1 evento' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(screen.getByRole('heading', { name: '5 – 11 oct 2026', level: 2 })).toBeInTheDocument();
    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 5)));

    await userEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect(screen.getByRole('heading', { name: 'lunes, 5 de octubre de 2026', level: 2 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(screen.getByRole('heading', { name: 'martes, 6 de octubre de 2026', level: 2 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/actividad/agenda?mode=day&date=2026-10-06');
    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 6)));
    expect(calendarQuery(fetchMock).get('to')).toBe(localEndOfDayIso(2026, 10, 6));
  });

  it('recargar con la URL conserva vista, modo y fecha; la cabecera de un día de la semana abre su vista Día', async () => {
    const fetchMock = api({});
    renderPage('/actividad/agenda?mode=week&date=2026-10-14');

    expect(screen.getByRole('heading', { name: '12 – 18 oct 2026', level: 2 })).toBeInTheDocument();
    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 12)));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver el día jueves, 15 de octubre de 2026' }));
    expect(currentUrl()).toBe('/actividad/agenda?mode=day&date=2026-10-15');
    expect(await screen.findByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
  });

  it('una celda del mes muestra 3 eventos y "+N más" abre la vista Día de esa fecha', async () => {
    const items = [9, 10, 11, 12].map((hour) => agendaItem({ id: `a-${hour}`, subject: `Llamada ${hour}`, date: localIso(2026, 10, 20, hour, 0) }));
    api({ calendar: () => calendarResponse(items) });
    renderPage();

    const cell = await screen.findByRole('region', { name: 'martes, 20 de octubre de 2026: 4 eventos' });
    expect(within(cell).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(within(cell).getByRole('button', { name: '+1 más: ver los 4 eventos del martes, 20 de octubre de 2026' }));
    expect(currentUrl()).toBe('/actividad/agenda?mode=day&date=2026-10-20');
    expect(await screen.findAllByRole('button', { name: /^\d{1,2}:00 [ap]\.m\., Llamada: Llamada \d+;/ })).toHaveLength(4);
  });
});

describe('AgendaPage — filtros (AC-04.3)', () => {
  it('tipo Visita ⇒ kind=VISIT; tipo de actividad ⇒ activityTypeId; estado y país; chips y "Limpiar"', async () => {
    const fetchMock = api({});
    renderPage();
    await screen.findByRole('button', { name: ACTIVITY_LABEL });

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de la agenda' });
    expect(within(form).queryByLabelText('Desde')).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('combobox', { name: 'Tipo' }));
    const typeOptions = await screen.findByRole('listbox');
    expect(within(typeOptions).getAllByRole('option').map((option) => option.textContent)).toEqual(['Todos', 'Visita', 'Llamada', 'Correo', 'Tarea']);
    await userEvent.click(within(typeOptions).getByRole('option', { name: 'Visita' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(calendarQuery(fetchMock).get('kind')).toBe('VISIT'));
    expect(calendarQuery(fetchMock).get('activityTypeId')).toBeNull();
    expect(currentUrl()).toBe('/actividad/agenda?type=VISIT');
    expect(screen.getByRole('button', { name: 'Filtros (1)' })).toBeInTheDocument();
    expect(screen.getByText('Tipo: Visita')).toBeInTheDocument();

    await userEvent.click(within(form).getByRole('combobox', { name: 'Tipo' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Llamada' }));
    await userEvent.click(within(form).getByRole('combobox', { name: 'Estado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Vencida' }));
    await userEvent.click(within(form).getByRole('combobox', { name: 'País' }));
    await userEvent.click(await screen.findByRole('option', { name: 'México' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(calendarQuery(fetchMock).get('activityTypeId')).toBe('t-call'));
    const query = calendarQuery(fetchMock);
    expect(query.get('kind')).toBeNull();
    expect(query.get('statusGroup')).toBe('OVERDUE');
    expect(query.get('countryId')).toBe('co-mx');
    expect(query.get('from')).toBe(localIso(2026, 9, 28));
    expect(screen.getByText('Tipo: Llamada')).toBeInTheDocument();
    expect(screen.getByText('Estado: Vencida')).toBeInTheDocument();
    expect(screen.getByText('País: México')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(calendarQuery(fetchMock).get('activityTypeId')).toBeNull());
    expect(calendarQuery(fetchMock).get('statusGroup')).toBeNull();
    expect(calendarQuery(fetchMock).get('countryId')).toBeNull();
    expect(currentUrl()).toBe('/actividad/agenda');
    expect(screen.queryByText('Tipo: Llamada')).not.toBeInTheDocument();
  });

  it('asesor y cliente de la URL viajan a la API y muestran su chip; quitar un chip quita solo ese filtro', async () => {
    const fetchMock = api({});
    renderPage('/actividad/agenda?ownerId=u-2&customerId=c-1&statusGroup=CANCELLED');

    await waitFor(() => expect(calendarQuery(fetchMock).get('ownerId')).toBe('u-2'));
    expect(calendarQuery(fetchMock).get('customerId')).toBe('c-1');
    expect(calendarQuery(fetchMock).get('statusGroup')).toBe('CANCELLED');
    expect(await screen.findByText('Cliente: Constructora Peña S.A.')).toBeInTheDocument();
    expect(screen.getByText('Asesor: Seleccionado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toHaveAttribute('aria-expanded', 'true');

    const chip = screen.getByText('Estado: Cancelada').closest('.MuiChip-root');
    expect(chip).not.toBeNull();
    await userEvent.click(within(chip as HTMLElement).getByTestId('CancelIcon'));
    await waitFor(() => expect(calendarQuery(fetchMock).get('statusGroup')).toBeNull());
    expect(calendarQuery(fetchMock).get('ownerId')).toBe('u-2');
    expect(currentUrl()).toBe('/actividad/agenda?ownerId=u-2&customerId=c-1');
  });

  it('sin `visitas.ver` el tipo no ofrece "Visita"; sin permisos de alta no hay acciones', async () => {
    signInWith(['actividades.ver']);
    api({});
    renderPage();
    await screen.findByRole('button', { name: ACTIVITY_LABEL });

    expect(screen.queryByRole('button', { name: 'Planificar visita' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de la agenda' });
    expect(within(form).queryByRole('combobox', { name: 'País' })).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('combobox', { name: 'Tipo' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Todos', 'Llamada', 'Correo', 'Tarea']);
  });
});

describe('AgendaPage — listado (AC-04.2)', () => {
  it('conmuta a Listado (URL `view`), ordena por fecha asc por defecto, por Tipo (`kind`) y pagina en el servidor', async () => {
    const fetchMock = api({ list: () => page([AGENDA_ACTIVITY, AGENDA_VISIT], 45) });
    renderPage();
    await screen.findByRole('button', { name: ACTIVITY_LABEL });

    await userEvent.click(screen.getByRole('button', { name: 'Listado' }));
    expect(currentUrl()).toBe('/actividad/agenda?view=list');
    expect(screen.getByRole('button', { name: 'Listado' })).toHaveAttribute('aria-pressed', 'true');
    const table = await screen.findByRole('table', { name: 'Agenda' });
    expect(within(table).getByText('Seguimiento de cotización')).toBeInTheDocument();
    expect(within(table).getByText('Torre Norte')).toBeInTheDocument();
    expect(within(table).getByText('Luis Gerente')).toBeInTheDocument();
    expect(within(table).getByText('Reprogramada')).toBeInTheDocument();
    expect(within(table).getByLabelText('2 adjuntos')).toBeInTheDocument();

    let query = lastQuery(fetchMock, '/agenda');
    expect(query.get('sortBy')).toBe('date');
    expect(query.get('sortOrder')).toBe('asc');
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('20');
    expect(query.get('from')).toBeNull();

    await userEvent.click(within(table).getByRole('button', { name: 'Tipo' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/agenda').get('sortBy')).toBe('kind'));
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/agenda').get('page')).toBe('2'));
    query = lastQuery(fetchMock, '/agenda');
    expect(query.get('sortBy')).toBe('kind');
    expect(currentUrl()).toBe('/actividad/agenda?view=list&sortBy=kind&sortOrder=asc&page=2');
  });

  it('el listado pide el rango "Desde"/"Hasta" y lo envía como instantes del día completo', async () => {
    const fetchMock = api({});
    renderPage('/actividad/agenda?view=list');
    await screen.findByRole('table', { name: 'Agenda' });

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de la agenda' });
    await userEvent.type(within(form).getByLabelText('Desde'), '2026-10-31');
    await userEvent.type(within(form).getByLabelText('Hasta'), '2026-10-01');
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));
    expect(within(form).getByText('La fecha "Hasta" no puede ser anterior a "Desde".')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/agenda').get('from')).toBeNull();

    await userEvent.clear(within(form).getByLabelText('Desde'));
    await userEvent.type(within(form).getByLabelText('Desde'), '2026-09-01');
    await userEvent.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/agenda').get('from')).toBe(localIso(2026, 9, 1)));
    expect(lastQuery(fetchMock, '/agenda').get('to')).toBe(localEndOfDayIso(2026, 10, 1));
    expect(screen.getByText('Desde: 1 sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Hasta: 1 oct 2026')).toBeInTheDocument();
  });

  it('una fila abre el panel de resumen', async () => {
    api({});
    renderPage('/actividad/agenda?view=list');
    const table = await screen.findByRole('table', { name: 'Agenda' });

    await userEvent.click(within(table).getByRole('link', { name: 'Abrir el resumen de VIS-2026-00007: Presentar catálogo' }));
    expect(await screen.findByRole('heading', { name: 'Presentar catálogo', level: 2 })).toBeInTheDocument();
  });
});

describe('AgendaPage — panel de resumen (AC-04.4)', () => {
  it('muestra el resumen de una visita y "Ver detalle" navega a su `detailPath`', async () => {
    const fetchMock = api({});
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: VISIT_LABEL }));
    expect(await screen.findByRole('heading', { name: 'Presentar catálogo', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Visita · VIS-2026-00007')).toBeInTheDocument();
    expect(screen.getByText('Luis Gerente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Constructora Peña S.A.' })).toHaveAttribute('href', '/clientes/c-1');
    expect(screen.getByRole('link', { name: 'Torre Norte' })).toHaveAttribute('href', '/proyectos/p-1');
    expect(screen.getByText('Reprogramada')).toBeInTheDocument();
    expect(screen.getByLabelText('2 adjuntos')).toBeInTheDocument();
    expect(screen.getByText('Con recordatorio (se muestra en la agenda; no se envían notificaciones).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Completar' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/activities/v-7')).toHaveLength(0);

    await userEvent.click(screen.getByRole('link', { name: 'Ver detalle' }));
    expect(currentUrl()).toBe('/actividad/visitas/v-7');
  });

  it('el teclado abre el evento (`Enter`) y "Cerrar detalle" lo cierra', async () => {
    api({});
    renderPage();

    const event = await screen.findByRole('button', { name: ACTIVITY_LABEL });
    event.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Seguimiento de cotización', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Llamada · ACT-2026-000009')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Seguimiento de cotización', level: 2 })).not.toBeInTheDocument());
  });

  it('completa una actividad abierta desde el panel y la agenda se refresca (AC-04.56)', async () => {
    let completed = false;
    const fetchMock = api({
      calendar: () =>
        calendarResponse([completed ? agendaItem({ status: { id: 's-done', code: 'COMPLETADA', label: 'Completada', group: 'DONE' } }) : AGENDA_ACTIVITY]),
      'POST /activities/a-9/completion': () => {
        completed = true;
        return jsonResponse({ ...DETAIL_A9, allowedActions: [] });
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: ACTIVITY_LABEL }));
    await userEvent.click(await screen.findByRole('button', { name: 'Completar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completar actividad' });
    await userEvent.type(await within(dialog).findByLabelText('Notas del resultado'), 'Listo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));

    expect(await screen.findByText('Actividad ACT-2026-000009 completada.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities/a-9/completion')[0]).resultNotes).toBe('Listo');
    expect(
      await screen.findByRole('button', { name: '10:00 a.m., Llamada: Seguimiento de cotización; cliente: Constructora Peña S.A.; estado: Completada' }),
    ).toBeInTheDocument();
  });

  it('sin COMPLETE en `allowedActions` no ofrece "Completar"', async () => {
    const fetchMock = api({ 'GET /activities/a-9': () => jsonResponse({ ...DETAIL_A9, allowedActions: ['EDIT'] }) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: ACTIVITY_LABEL }));
    await screen.findByRole('heading', { name: 'Seguimiento de cotización', level: 2 });
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/activities/a-9')).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', '/actividad/actividades/a-9');
    expect(screen.queryByRole('button', { name: 'Completar' })).not.toBeInTheDocument();
  });
});

describe('AgendaPage — móvil (< md)', () => {
  beforeEach(simulateNarrowScreen);

  it('abre en Día con la tira de días de la semana y pide la semana entera', async () => {
    const fetchMock = api({});
    renderPage();

    expect(screen.getByRole('heading', { name: 'lunes, 12 de octubre de 2026', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Semana' })).not.toBeInTheDocument();

    const strip = await screen.findByRole('group', { name: 'Días de la semana' });
    expect(strip).toHaveClass('scroll-x');
    expect(within(strip).getAllByRole('button')).toHaveLength(7);
    const monday = within(strip).getByRole('button', { name: 'lunes, 12 de octubre de 2026: 1 evento' });
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    expect(monday).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: VISIT_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACTIVITY_LABEL })).not.toBeInTheDocument();

    await waitFor(() => expect(calendarQuery(fetchMock).get('from')).toBe(localIso(2026, 10, 12)));
    expect(calendarQuery(fetchMock).get('to')).toBe(localEndOfDayIso(2026, 10, 18));

    await userEvent.click(within(strip).getByRole('button', { name: 'jueves, 15 de octubre de 2026: 1 evento' }));
    expect(currentUrl()).toBe('/actividad/agenda?date=2026-10-15');
    expect(screen.getByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'jueves, 15 de octubre de 2026: 1 evento' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('`mode=week` en móvil se presenta como Día; Mes muestra indicadores por día y el detalle debajo', async () => {
    api({});
    renderPage('/actividad/agenda?mode=week&date=2026-10-12');
    expect(screen.getByRole('heading', { name: 'lunes, 12 de octubre de 2026', level: 2 })).toBeInTheDocument();
    await screen.findByRole('group', { name: 'Días de la semana' });

    await userEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(screen.getByRole('heading', { name: 'octubre de 2026', level: 2 })).toBeInTheDocument();
    const days = await screen.findByRole('group', { name: 'Días del mes' });
    const thursday = within(days).getByRole('button', { name: 'jueves, 15 de octubre de 2026: 1 evento' });
    expect(thursday).toHaveAttribute('aria-pressed', 'false');
    expect(within(days).getByRole('button', { name: 'lunes, 12 de octubre de 2026: 1 evento' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(days).queryByRole('button', { name: ACTIVITY_LABEL })).not.toBeInTheDocument();

    await userEvent.click(thursday);
    const detail = screen.getByRole('region', { name: 'Eventos del jueves, 15 de octubre de 2026' });
    expect(within(detail).getByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
    expect(currentUrl()).toBe('/actividad/agenda?mode=month&date=2026-10-15');
  });
});

describe('AgendaPage — estados (PF-04.49)', () => {
  it('cargando muestra el esqueleto de la cuadrícula', async () => {
    const reply = deferred<Response>();
    api({ calendar: () => reply.promise });
    renderPage();

    expect(await screen.findByRole('status', { name: 'Cargando agenda' })).toBeInTheDocument();
    reply.resolve(calendarResponse([AGENDA_ACTIVITY]));
    expect(await screen.findByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando agenda' })).not.toBeInTheDocument();
  });

  it('vacío sin filtros ofrece las acciones; con filtros, "Limpiar filtros"', async () => {
    const fetchMock = api({ calendar: () => calendarResponse([]) });
    renderPage('/actividad/agenda?statusGroup=DONE');

    expect(await screen.findByText('Ningún evento coincide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(calendarQuery(fetchMock).get('statusGroup')).toBeNull());
    const empty = await screen.findByText('No hay visitas ni actividades en este periodo');
    const state = empty.closest('[role="status"]') as HTMLElement;
    expect(within(state).getByRole('button', { name: 'Planificar visita' })).toBeInTheDocument();
    expect(within(state).getByRole('button', { name: 'Nueva actividad' })).toBeInTheDocument();
  });

  it('error con la referencia y "Reintentar"', async () => {
    let calls = 0;
    api({
      calendar: () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : calendarResponse([AGENDA_ACTIVITY]);
      },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la agenda');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
  });

  it('aviso no bloqueante cuando el rango supera el tope (D-04.12)', async () => {
    api({ calendar: () => calendarResponse([AGENDA_ACTIVITY], true) });
    renderPage();

    expect(await screen.findByText('Se muestran los primeros 500 eventos; acota los filtros.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACTIVITY_LABEL })).toBeInTheDocument();
  });

  it('"Planificar visita" abre el alta de visita', async () => {
    api({});
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Planificar visita' }));
    expect(currentUrl()).toBe('/actividad/visitas/nueva');
  });
});
