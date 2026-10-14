import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { endOfDayIso, formatDateTime, startOfDayIso } from '../common/date-time';
import { ASESOR_PERMISSIONS, lastQuery, ME, menu, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';
import { ACTIVITY_FOLLOW_UP_ROW, FROZEN_NOW, FULL_TRACE, followUpRow, PROJECT_FOLLOW_UP_ROW, TRACE_ATTACHMENT, TRACE_CONTENT_PATH } from '../testing/read-model-fixtures';

import { traceAttachmentPath } from './follow-up.api';
import { FollowUpPage } from './FollowUpPage';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const COUNTRIES = { countries: [{ id: 'mx', name: 'México' }] };

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function SearchProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

function renderPage(initialEntry = '/actividad/seguimiento') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/actividad/seguimiento"
        element={
          <>
            <FollowUpPage />
            <SearchProbe />
          </>
        }
      />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [initialEntry] },
  );
}

/** El drawer de MUI no lleva rol: se localiza por su papel. */
function drawer(): HTMLElement {
  const paper = document.querySelector<HTMLElement>('.MuiDrawer-paper');
  if (!paper) {
    throw new Error('El drawer no está abierto');
  }
  return paper;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
  vi.mocked(saveFile).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  signOut();
});

describe('FollowUpPage (F-23, PF-04.55)', () => {
  it('por cliente: envía groupBy=CUSTOMER y el orden por defecto, y pinta las columnas de RN-04.34 (AC-04.11)', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([followUpRow(), ACTIVITY_FOLLOW_UP_ROW]),
      'GET /customers/form-options': () => jsonResponse(COUNTRIES),
    });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Seguimiento por cliente' });
    const query = lastQuery(fetchMock, '/follow-ups');
    expect(query.get('groupBy')).toBe('CUSTOMER');
    expect(query.get('sortBy')).toBe('lastInteractionAt');
    expect(query.get('sortOrder')).toBe('desc');
    expect(query.get('page')).toBe('1');

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Cliente', 'Última interacción', 'Próxima acción', 'Fecha próxima acción', 'Responsable', 'Notas', 'Adjuntos']);

    const first = within(table).getByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' });
    expect(within(first).getByText('CLI-000001')).toBeInTheDocument();
    expect(within(first).getByText(`${formatDateTime('2026-10-05T16:00:00.000Z')} · Visita`)).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Ver visita VIS-2026-00001' })).toHaveAttribute('href', '/actividad/visitas/v-1');
    expect(within(first).getByText('Enviar cotización')).toBeInTheDocument();
    expect(within(first).getByText('1 oct 2026 (pasada)')).toBeInTheDocument();
    expect(within(first).getByText('Ana Asesora')).toBeInTheDocument();
    expect(within(first).getByLabelText('3 adjuntos')).toBeInTheDocument();

    const second = within(table).getByRole('link', { name: 'Ver la trazabilidad de Aceros del Norte S.A.' });
    expect(within(second).getByRole('link', { name: 'Ver actividad ACT-2026-000001' })).toHaveAttribute('href', '/actividad/actividades/a-1');
    expect(within(second).getByText('12 oct 2026 (hoy)')).toBeInTheDocument();
    expect(within(second).getByText('Pidió precios por volumen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Por cliente' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('el enlace al origen navega sin abrir el drawer (AC-04.13)', async () => {
    mockApi({ 'GET /follow-ups': () => page([followUpRow()]) });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver visita VIS-2026-00001' }));
    expect(await screen.findByText('En /actividad/visitas/v-1')).toBeInTheDocument();
    expect(document.querySelector('.MuiDrawer-paper')).toBeNull();
  });

  it('notas truncadas con "Ver más" accesible que las despliega', async () => {
    mockApi({ 'GET /follow-ups': () => page([followUpRow()]) });
    renderPage();

    const more = await screen.findByRole('button', { name: 'Ver más' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Interesados en la línea premium para la torre norte; piden muestras de acabados,…')).toBeInTheDocument();
    await userEvent.click(more);
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Interesados en la línea premium para la torre norte; piden muestras de acabados, plazos de entrega por fase y condiciones de crédito a 90 días.'),
    ).toBeInTheDocument();
    expect(document.querySelector('.MuiDrawer-paper')).toBeNull();
  });

  it('por proyecto: groupBy=PROJECT en la URL y en la API, columna de proyecto con enlace a su ficha (AC-04.11)', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([PROJECT_FOLLOW_UP_ROW]),
    });
    renderPage();
    await screen.findByRole('table', { name: 'Seguimiento por cliente' });

    await userEvent.click(screen.getByRole('button', { name: 'Por proyecto' }));
    const table = await screen.findByRole('table', { name: 'Seguimiento por proyecto' });
    expect(lastQuery(fetchMock, '/follow-ups').get('groupBy')).toBe('PROJECT');
    expect(screen.getByTestId('search')).toHaveTextContent('?groupBy=PROJECT');
    expect(screen.getByRole('button', { name: 'Por proyecto' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByRole('columnheader', { name: 'Proyecto' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Torre Norte' })).toHaveAttribute('href', '/proyectos/p-1');
    expect(within(table).getByText('20 oct 2026')).toBeInTheDocument();
  });

  it('cambia el orden a fecha de próxima acción y a cliente', async () => {
    const fetchMock = mockApi({ 'GET /follow-ups': () => page([followUpRow()]) });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Seguimiento por cliente' });

    await userEvent.click(within(table).getByRole('button', { name: 'Fecha próxima acción' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('sortBy')).toBe('nextActionDate'));
    expect(lastQuery(fetchMock, '/follow-ups').get('sortOrder')).toBe('asc');

    await userEvent.click(within(table).getByRole('button', { name: 'Cliente' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('sortBy')).toBe('customerName'));
    expect(screen.getByTestId('search')).toHaveTextContent('?sortBy=customerName&sortOrder=asc');
  });

  it('filtros en la URL y enviados: país, sin próxima acción y rango de última interacción; chips y "Limpiar"', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /customers/form-options': () => jsonResponse(COUNTRIES),
    });
    renderPage();
    await screen.findByRole('table', { name: 'Seguimiento por cliente' });

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const filters = screen.getByRole('search', { name: 'Filtros de seguimiento' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'País' }));
    await userEvent.click(await screen.findByRole('option', { name: 'México' }));
    await userEvent.click(within(filters).getByRole('checkbox', { name: 'Sin próxima acción' }));
    fireEvent.change(within(filters).getByLabelText('Última interacción desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(filters).getByLabelText('Última interacción hasta'), { target: { value: '2026-10-10' } });
    await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('withoutNextAction')).toBe('true'));
    const query = lastQuery(fetchMock, '/follow-ups');
    expect(query.get('countryId')).toBe('mx');
    expect(query.get('lastInteractionFrom')).toBe(startOfDayIso('2026-10-01'));
    expect(query.get('lastInteractionTo')).toBe(endOfDayIso('2026-10-10'));
    expect(query.get('groupBy')).toBe('CUSTOMER');
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?countryId=mx&withoutNextAction=true&lastInteractionFrom=2026-10-01&lastInteractionTo=2026-10-10',
    );

    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('País: México')).toBeInTheDocument();
    expect(within(chips).getByText('Sin próxima acción')).toBeInTheDocument();
    expect(within(chips).getByText('Última interacción desde: 1 oct 2026')).toBeInTheDocument();
    expect(within(chips).getByText('Última interacción hasta: 10 oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (4)' })).toBeInTheDocument();

    await userEvent.click(within(chips).getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('withoutNextAction')).toBeNull());
    expect(screen.queryByLabelText('Filtros activos')).not.toBeInTheDocument();
  });

  it('cliente, asesor y proyecto desde la URL se envían y se muestran como chips; quitar uno conserva la agrupación', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([PROJECT_FOLLOW_UP_ROW]),
      'GET /customers/c-1': () => jsonResponse({ ...followUpRow().customer, country: { id: 'mx' } }),
      'GET /commercial-activity/owner-options': () => page([ME]),
    });
    renderPage('/actividad/seguimiento?groupBy=PROJECT&customerId=c-1&ownerId=u-1&projectId=p-1');

    await screen.findByRole('table', { name: 'Seguimiento por proyecto' });
    const query = lastQuery(fetchMock, '/follow-ups');
    expect(query.get('customerId')).toBe('c-1');
    expect(query.get('ownerId')).toBe('u-1');
    expect(query.get('projectId')).toBe('p-1');
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('Cliente: Constructora Peña S.A.')).toBeInTheDocument();
    // El nombre del asesor sale de `owner-options?id=` (F6), no de las filas.
    expect(await within(chips).findByText('Asesor: Ana Asesora')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/commercial-activity/owner-options').getAll('id')).toEqual(['u-1']);
    expect(within(chips).getByText('Proyecto: Torre Norte')).toBeInTheDocument();

    const projectChip = within(chips).getByText('Proyecto: Torre Norte').closest('.MuiChip-root') as HTMLElement;
    await userEvent.click(within(projectChip).getByTestId('CancelIcon'));
    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('projectId')).toBeNull());
    expect(lastQuery(fetchMock, '/follow-ups').get('groupBy')).toBe('PROJECT');
  });

  it('con el módulo de Proyectos, filtra por el proyecto elegido con el selector de 03 (04 §E.4)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /me/menu': () => jsonResponse(menu(['actividad-seguimiento', 'proyectos-buscar'])),
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /projects': () => page([{ id: 'p-1', code: 'PRY-2026-00001', name: 'Torre Norte', customer: { id: 'c-1', legalName: 'Constructora Peña S.A.' } }]),
      'GET /projects/p-1': () => jsonResponse({ id: 'p-1', code: 'PRY-2026-00001', name: 'Torre Norte', customer: { id: 'c-1', legalName: 'Constructora Peña S.A.' } }),
    });
    renderPage();

    await screen.findByRole('table', { name: 'Seguimiento por cliente' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    await user.click(await screen.findByRole('combobox', { name: 'Proyecto' }));
    await user.click(await screen.findByRole('option', { name: 'PRY-2026-00001 · Torre Norte' }));
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(lastQuery(fetchMock, '/follow-ups').get('projectId')).toBe('p-1'));
    expect(await within(screen.getByLabelText('Filtros activos')).findByText('Proyecto: PRY-2026-00001 · Torre Norte')).toBeInTheDocument();
  });

  it('sin el módulo de Proyectos en el menú no ofrece el filtro de proyecto ni llama a /projects (D-02.10)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /me/menu': () => jsonResponse(menu(['actividad-seguimiento'])),
      'GET /follow-ups': () => page([followUpRow()]),
    });
    renderPage();

    await screen.findByRole('table', { name: 'Seguimiento por cliente' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(await screen.findByRole('combobox', { name: /Cliente/ })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Proyecto' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/projects'))).toBe(false);
  });

  it('nunca envía `search` a /follow-ups aunque llegue en la URL (la API responde 400)', async () => {
    const fetchMock = mockApi({ 'GET /follow-ups': () => page([followUpRow()]) });
    renderPage('/actividad/seguimiento?search=pe%C3%B1a&withoutNextAction=true');

    await screen.findByRole('table', { name: 'Seguimiento por cliente' });
    const query = lastQuery(fetchMock, '/follow-ups');
    expect(query.get('withoutNextAction')).toBe('true');
    expect(query.has('search')).toBe(false);
  });

  it('vacío sin filtros, vacío con filtros con "Limpiar filtros", y error con referencia y reintento', async () => {
    let calls = 0;
    const fetchMock = mockApi({
      'GET /follow-ups': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
      },
    });
    renderPage('/actividad/seguimiento?withoutNextAction=true');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ningún seguimiento coincide')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Aún no hay interacciones registradas')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/follow-ups').get('withoutNextAction')).toBeNull();
  });
});

describe('FollowUpTraceDrawer (AC-04.13, PF-04.55)', () => {
  it('abre la trazabilidad del cliente: resumen, línea de tiempo, próximos, adjuntos con descarga y enlace al historial', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /follow-ups/trace': () => jsonResponse(FULL_TRACE),
      [`GET ${TRACE_CONTENT_PATH}`]: () =>
        new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="acta de visita.pdf"' } }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' }));
    expect(await within(drawer()).findByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/follow-ups/trace');
    expect(query.get('customerId')).toBe('c-1');
    expect(query.get('projectId')).toBeNull();

    const panel = drawer();
    expect(within(panel).getByRole('heading', { name: 'Constructora Peña S.A.', level: 2 })).toBeInTheDocument();
    expect(within(panel).getByText('Cliente CLI-000001')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Constructora Peña S.A. (CLI-000001)' })).toHaveAttribute('href', '/clientes/c-1');
    expect(within(panel).getAllByRole('link', { name: 'Ver visita VIS-2026-00001' }).map((link) => link.getAttribute('href'))).toEqual([
      '/actividad/visitas/v-1',
      '/actividad/visitas/v-1',
      '/actividad/visitas/v-1',
    ]);
    expect(within(panel).getByText('1 oct 2026 (pasada)', { exact: false })).toBeInTheDocument();

    // Línea de tiempo cronológica (más reciente primero) con enlace a cada origen.
    expect(within(panel).getByRole('link', { name: 'Ver visita VIS-2026-00000' })).toHaveAttribute('href', '/actividad/visitas/v-0');
    expect(within(panel).getByRole('link', { name: 'Ver el historial completo' })).toHaveAttribute('href', '/actividad/historial?customerId=c-1');

    const upcoming = within(panel).getByRole('list', { name: 'Próximas visitas y actividades' });
    expect(within(upcoming).getByRole('link', { name: 'ACT-2026-000009 · Seguimiento de cotización' })).toHaveAttribute('href', '/actividad/actividades/a-9');
    expect(within(upcoming).getByText('Pendiente')).toBeInTheDocument();

    const attachments = within(panel).getByRole('list', { name: 'Adjuntos' });
    expect(within(attachments).getByText('acta de visita.pdf')).toBeInTheDocument();
    expect(within(attachments).getByText('2 KB', { exact: false })).toBeInTheDocument();
    expect(within(attachments).getByRole('link', { name: 'VIS-2026-00001' })).toHaveAttribute('href', '/actividad/visitas/v-1');

    await userEvent.click(within(attachments).getByRole('button', { name: 'Descargar acta de visita.pdf' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.anything(), 'acta de visita.pdf'));
    expect(callsTo(fetchMock, 'GET', `/api/v1${TRACE_CONTENT_PATH}`)).toHaveLength(1);
    expect(callsTo(fetchMock, 'GET', `/api/v1/api/v1${TRACE_CONTENT_PATH}`)).toHaveLength(0);
  });

  it('se abre con Enter; en la vista por proyecto pide la trazabilidad del proyecto', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([PROJECT_FOLLOW_UP_ROW]),
      'GET /follow-ups/trace': () => jsonResponse({ ...FULL_TRACE, row: PROJECT_FOLLOW_UP_ROW }),
    });
    renderPage('/actividad/seguimiento?groupBy=PROJECT');

    const row = await screen.findByRole('link', { name: 'Ver la trazabilidad de Torre Norte (Constructora Peña S.A.)' });
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(await within(drawer()).findByRole('heading', { name: 'Torre Norte', level: 2 })).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/follow-ups/trace');
    expect(query.get('projectId')).toBe('p-1');
    expect(query.get('customerId')).toBeNull();
    expect(await within(drawer()).findByRole('link', { name: 'Ver el historial completo' })).toHaveAttribute('href', '/actividad/historial?projectId=p-1');
    expect(within(drawer()).getByText('Proyecto PRY-2026-00001 · Constructora Peña S.A.')).toBeInTheDocument();
  });

  it('un 404 se muestra como vacío, no como error', async () => {
    mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /follow-ups/trace': () => errorResponse(404, 'RESOURCE_NOT_FOUND'),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' }));
    expect(await within(drawer()).findByText('Aún no hay interacciones registradas')).toBeInTheDocument();
    expect(within(drawer()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('otro error muestra la referencia y "Reintentar"; al cerrar desaparece', async () => {
    let calls = 0;
    mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /follow-ups/trace': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(FULL_TRACE);
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' }));
    const alert = await within(drawer()).findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la trazabilidad');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await within(drawer()).findByRole('heading', { name: 'Resumen' })).toBeInTheDocument();

    await userEvent.click(within(drawer()).getByRole('button', { name: 'Cerrar detalle' }));
    await waitFor(() => expect(document.querySelector('.MuiDrawer-paper')).toBeNull());
  });

  it('un fallo de descarga se avisa con su referencia', async () => {
    mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /follow-ups/trace': () => jsonResponse(FULL_TRACE),
      [`GET ${TRACE_CONTENT_PATH}`]: () => errorResponse(403, 'PERMISSION_DENIED'),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' }));
    await userEvent.click(await within(drawer()).findByRole('button', { name: 'Descargar acta de visita.pdf' }));
    const alert = await within(drawer()).findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo descargar el archivo.');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('traceAttachmentPath', () => {
  it('acepta sólo rutas de contenido de adjuntos del módulo, relativas a la base de la API', () => {
    const id = '0b6e1c2a-0000-4000-8000-000000000001';
    expect(traceAttachmentPath(TRACE_ATTACHMENT.contentPath)).toBe(TRACE_CONTENT_PATH);
    expect(traceAttachmentPath(`/activities/${id}/attachments/${id}/content`)).toBe(`/activities/${id}/attachments/${id}/content`);
    expect(traceAttachmentPath(`/visits/${id}/events/${id}/attachments/${id}/content`)).toBe(`/visits/${id}/events/${id}/attachments/${id}/content`);
    expect(traceAttachmentPath(`/api/v1/visits/${id}/attachments/${id}/content`)).toBeNull();
    expect(traceAttachmentPath('https://otro.example/x')).toBeNull();
    expect(traceAttachmentPath(`//otro.example/visits/${id}/attachments/${id}/content`)).toBeNull();
    expect(traceAttachmentPath(`/visits/${id}/attachments/${id}/content/../../../users`)).toBeNull();
    expect(traceAttachmentPath(`/customers/${id}/attachments/${id}/content`)).toBeNull();
  });

  it('una ruta de descarga inesperada no se pide y se avisa', async () => {
    const fetchMock = mockApi({
      'GET /follow-ups': () => page([followUpRow()]),
      'GET /follow-ups/trace': () => jsonResponse({ ...FULL_TRACE, attachments: [{ ...TRACE_ATTACHMENT, contentPath: 'https://otro.example/robar' }] }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Ver la trazabilidad de Constructora Peña S.A.' }));
    await userEvent.click(await within(drawer()).findByRole('button', { name: 'Descargar acta de visita.pdf' }));
    expect(await within(drawer()).findByRole('alert')).toHaveTextContent('No se pudo descargar el archivo: el enlace de descarga no es válido.');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('otro.example'))).toBe(false);
    expect(saveFile).not.toHaveBeenCalled();
  });
});
