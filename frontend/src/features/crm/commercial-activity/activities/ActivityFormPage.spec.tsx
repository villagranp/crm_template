import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, mockUpload, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { takePendingAttachments } from '../common/attachment-owner';
import {
  ACTIVITY_DETAIL,
  ASESOR_PERMISSIONS,
  bodyOf,
  CUSTOMER_REF,
  FORM_OPTIONS,
  menu,
  page,
  PROJECT_REF,
  RESULT_OK,
  signInWith,
  signOut,
  simulateWideScreen,
  TYPE_CALL,
  TYPE_EMAIL,
  TYPE_TASK,
} from '../testing/fixtures';

import { ActivityFormPage } from './ActivityFormPage';

const CUSTOMER_DTO = { ...CUSTOMER_REF, country: { id: 'gt', isoCode: 'GT', name: 'Guatemala', taxIdLabel: 'NIT' } };
const CREATED = { ...ACTIVITY_DETAIL, id: 'a-new', code: 'ACT-2026-000123' };

function DetailProbe() {
  const location = useLocation();
  const state = location.state as { notice?: string } | null;
  return <p>{`Detalle ${location.pathname} · ${state?.notice ?? ''}`}</p>;
}

function renderPage(search = '') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/actividades/nueva" element={<ActivityFormPage />} />
      <Route path="/actividad/actividades/:activityId" element={<DetailProbe />} />
      <Route path="/actividad/actividades" element={<p>Listado</p>} />
    </Routes>,
    { initialEntries: [`/actividad/actividades/nueva${search}`] },
  );
}

function api(extra: Record<string, RouteHandler> = {}, menuKeys: string[] = ['actividad-actividades']) {
  return mockApi({
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /me/menu': () => jsonResponse(menu(menuKeys)),
    'GET /customers/c-1': () => jsonResponse(CUSTOMER_DTO),
    'POST /activities': () => jsonResponse(CREATED, 201),
    ...extra,
  });
}

async function chooseType(label: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: /Tipo de actividad/ }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(() => {
  signOut();
  takePendingAttachments({ type: 'activity', activityId: 'a-new' });
});

describe('ActivityFormPage (F-31, F-32, PF-04.53)', () => {
  it('si las opciones no cargan muestra el error con "Reintentar" y no deja guardar', async () => {
    let calls = 0;
    api({
      'GET /activities/form-options': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(FORM_OPTIONS);
      },
    });
    renderPage();

    expect(await screen.findByText('No se pudo cargar el formulario')).toBeInTheDocument();
    expect(screen.getByText(/Referencia: corr-test/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear actividad' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Crear actividad' })).toBeInTheDocument();
  });

  it('muestra solo los campos que declara metadata.fields del tipo y cambian al cambiar de tipo (AC-04.50)', async () => {
    api();
    renderPage();

    await chooseType('Llamada');
    expect(screen.getByLabelText('Duración (minutos)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Participantes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Siguiente acción')).toBeInTheDocument();

    await chooseType('Tarea');
    expect(screen.queryByLabelText('Duración (minutos)')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Participantes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fecha y hora')).toBeInTheDocument();

    await chooseType('Correo');
    expect(screen.getByText('Registro de un correo enviado o recibido fuera del CRM. No se envía nada.')).toBeInTheDocument();
  });

  it('preselecciona el cliente (y el tipo) desde la URL y crea sin enviar campos que el tipo no admite (AC-04.47)', async () => {
    const fetchMock = api();
    renderPage(`?customerId=c-1&typeId=${TYPE_TASK.id}`);

    expect(await screen.findByRole('combobox', { name: /Cliente/ })).toHaveValue('CLI-000001 · Constructora Peña S.A.');
    expect(screen.getByText(/Preseleccionado\. Si lo cambias/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Asunto/), 'Preparar propuesta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    expect(await screen.findByText('Detalle /actividad/actividades/a-new · Actividad ACT-2026-000123 creada.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities')[0])).toEqual({
      typeId: TYPE_TASK.id,
      subject: 'Preparar propuesta',
      customerId: 'c-1',
      priorityId: FORM_OPTIONS.defaults.priorityId,
      statusId: FORM_OPTIONS.defaults.statusId,
    });
  });

  it('con projectId preselecciona proyecto y cliente (AC-04.48)', async () => {
    const fetchMock = api(
      { 'GET /projects': () => page([{ ...PROJECT_REF, customer: { id: 'c-1', legalName: CUSTOMER_REF.legalName } }]) },
      ['actividad-actividades', 'proyectos-buscar'],
    );
    renderPage(`?customerId=c-1&projectId=p-1&typeId=${TYPE_TASK.id}`);

    expect(await screen.findByRole('combobox', { name: 'Proyecto' })).toHaveValue('PRY-2026-00001 · Torre Norte');
    await userEvent.type(screen.getByLabelText(/Asunto/), 'Visitar obra');
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    await screen.findByText(/Detalle \/actividad\/actividades\/a-new/);
    const body = bodyOf(callsTo(fetchMock, 'POST', '/activities')[0]);
    expect(body.customerId).toBe('c-1');
    expect(body.projectId).toBe('p-1');
  });

  it('una preselección inexistente o fuera de alcance se informa y deja el campo vacío (AC-04.49)', async () => {
    api({ 'GET /customers/c-x': () => errorResponse(404, 'RESOURCE_NOT_FOUND') });
    renderPage('?customerId=c-x&projectId=p-1');

    expect(await screen.findByText('El cliente indicado no existe o no tienes acceso. Elígelo de la lista.')).toBeInTheDocument();
    expect(screen.getByText('No se preseleccionó el proyecto porque falta su cliente.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Cliente/ })).toHaveValue('');
  });

  it('sin el módulo de Proyectos, avisa de que el proyecto no se preseleccionó y deja crear (Módulo 3 en otra rama)', async () => {
    const fetchMock = api();
    renderPage(`?customerId=c-1&projectId=p-1&typeId=${TYPE_TASK.id}`);

    expect(await screen.findByText('El módulo de Proyectos no está disponible: no se preseleccionó el proyecto.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/projects'))).toBe(false);
    await userEvent.type(screen.getByLabelText(/Asunto/), 'Llamar');
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));
    await screen.findByText(/Detalle \/actividad\/actividades\/a-new/);
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities')[0])).not.toHaveProperty('projectId');
  });

  it('valida antes de enviar: tipo, asunto y cliente obligatorios', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Crear actividad' }));
    expect((await screen.findAllByText('Este campo es obligatorio.')).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Revisa los campos marcados.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/activities')).toHaveLength(0);
  });

  it('"Ya realizada" exige resultado y crea completada en un paso con completion (AC-04.52)', async () => {
    const fetchMock = api();
    renderPage(`?customerId=c-1&typeId=${TYPE_CALL.id}`);

    await userEvent.type(await screen.findByLabelText(/Asunto/), 'Llamada hecha');
    await userEvent.click(screen.getByLabelText('Ya realizada: registrar la gestión como completada'));
    expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));
    expect(await screen.findByText('Indica un resultado de la lista o escribe notas.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/activities')).toHaveLength(0);

    await userEvent.click(screen.getByRole('combobox', { name: 'Resultado' }));
    await userEvent.click(await screen.findByRole('option', { name: RESULT_OK.label }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    expect(await screen.findByText('Detalle /actividad/actividades/a-new · Actividad ACT-2026-000123 registrada como realizada.')).toBeInTheDocument();
    const body = bodyOf(callsTo(fetchMock, 'POST', '/activities')[0]);
    expect(body).not.toHaveProperty('statusId');
    expect(body.completion).toEqual(expect.objectContaining({ resultId: RESULT_OK.id }));
    expect((body.completion as { completedAt: string }).completedAt).toMatch(/Z$/);
  });

  it('sin actividades.cerrar no ofrece "Ya realizada"', async () => {
    signInWith(ASESOR_PERMISSIONS.filter((permission) => permission !== 'actividades.cerrar'));
    api();
    renderPage();

    await screen.findByRole('button', { name: 'Crear actividad' });
    expect(screen.queryByLabelText('Ya realizada: registrar la gestión como completada')).not.toBeInTheDocument();
  });

  it('pinta bajo cada campo los 422 del backend y la referencia (AC-04.51)', async () => {
    api({
      'POST /activities': () =>
        errorResponse(422, 'FIELD_NOT_APPLICABLE', [
          { field: 'durationMinutes', code: 'FIELD_NOT_APPLICABLE' },
          { field: 'projectId', code: 'PROJECT_CUSTOMER_MISMATCH' },
        ]),
    });
    renderPage(`?customerId=c-1&typeId=${TYPE_CALL.id}`);

    await userEvent.type(await screen.findByLabelText(/Asunto/), 'Llamar');
    await userEvent.type(screen.getByLabelText('Duración (minutos)'), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    const alert = await screen.findByText(/Algún campo no aplica al tipo de actividad elegido\./);
    expect(alert).toHaveTextContent('Referencia: corr-test');
    expect(screen.getByText('No aplica a este tipo de actividad.')).toBeInTheDocument();
    expect(screen.getByText('No pertenece al cliente elegido.')).toBeInTheDocument();
  });

  it('sin "Ya realizada" deja los archivos para subirlos en el detalle tras el 201', async () => {
    api();
    renderPage(`?customerId=c-1&typeId=${TYPE_TASK.id}`);

    await userEvent.type(await screen.findByLabelText(/Asunto/), 'Con archivo');
    await userEvent.upload(screen.getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'plano.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    await screen.findByText(/Detalle \/actividad\/actividades\/a-new/);
    expect(takePendingAttachments({ type: 'activity', activityId: 'a-new' }).map((file) => file.name)).toEqual(['plano.pdf']);
  });

  it('"Ya realizada" con archivos: crea abierta, sube y después completa (E.12)', async () => {
    const order: string[] = [];
    const fetchMock = api({
      'POST /activities': () => {
        order.push('create');
        return jsonResponse(CREATED, 201);
      },
      'POST /activities/a-new/completion': () => {
        order.push('complete');
        return jsonResponse({ ...CREATED, status: { ...CREATED.status, group: 'DONE' } });
      },
    });
    const uploads = mockUpload(() => {
      order.push('upload');
      return { status: 201, body: { id: 'att-1', fileName: 'acta.pdf', contentType: 'application/pdf', sizeBytes: 1, description: null, createdAt: '2026-10-12T10:00:00Z', createdBy: null } };
    });
    renderPage(`?customerId=c-1&typeId=${TYPE_EMAIL.id}`);

    await userEvent.type(await screen.findByLabelText(/Asunto/), 'Correo enviado');
    await userEvent.click(screen.getByLabelText('Ya realizada: registrar la gestión como completada'));
    await userEvent.type(screen.getByLabelText('Notas del resultado'), 'Respondió que sí');
    await userEvent.upload(screen.getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'acta.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear actividad' }));

    expect(await screen.findByText(/registrada como realizada/)).toBeInTheDocument();
    expect(order).toEqual(['create', 'upload', 'complete']);
    expect(uploads[0]?.path).toBe('/activities/a-new/attachments');
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities')[0])).not.toHaveProperty('completion');
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities/a-new/completion')[0])).toEqual(
      expect.objectContaining({ resultNotes: 'Respondió que sí' }),
    );
  });

  it('elegir el responsable solo con actividades.administrar', async () => {
    api();
    const { unmount } = renderPage();
    const owner = await screen.findByRole('textbox', { name: 'Responsable' });
    expect(owner).toBeDisabled();
    expect(owner).toHaveValue('Ana Asesora');
    unmount();

    signInWith([...ASESOR_PERMISSIONS, 'actividades.administrar']);
    renderPage();
    const picker = await screen.findByRole('combobox', { name: 'Responsable' });
    await waitFor(() => expect(picker).toBeEnabled());
    expect(within(picker.closest('.MuiFormControl-root') as HTMLElement).getByText('Si lo dejas vacío, serás tú.')).toBeInTheDocument();
  });
});
