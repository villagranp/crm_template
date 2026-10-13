import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { takePendingAttachments } from '../common/attachment-owner';
import { fromDateTimeLocalValue } from '../common/date-time';
import { ASESOR_PERMISSIONS, bodyOf, CUSTOMER_REF, lastQuery, menu, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';
import { PENDING_VISIT, VISIT_FORM_OPTIONS } from '../testing/visit-fixtures';

import type { VisitNoticeState } from './VisitFormPage';
import { VisitFormPage } from './VisitFormPage';

const CUSTOMER_DTO = { ...CUSTOMER_REF, country: { id: 'gt', isoCode: 'GT', name: 'Guatemala', taxIdLabel: 'NIT' } };
const OTHER_CUSTOMER = { id: 'c-2', crmCode: 'CLI-000002', legalName: 'Ferretería El Sol', country: { id: 'gt', isoCode: 'GT', name: 'Guatemala' } };
const CREATED = { ...PENDING_VISIT, id: 'v-new', code: 'VIS-2026-00123' };
const FUTURE_START = '2099-10-20T10:00';
const FUTURE_END = '2099-10-20T11:30';

function DetailProbe() {
  const location = useLocation();
  const state = location.state as VisitNoticeState | null;
  return <p>{`Detalle ${location.pathname} · ${state?.notice ?? ''} · conflictos ${state?.scheduleConflicts?.length ?? 0}`}</p>;
}

function renderPage(search = '') {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/visitas/nueva" element={<VisitFormPage />} />
      <Route path="/actividad/visitas/:visitId" element={<DetailProbe />} />
      <Route path="/actividad/visitas" element={<p>Listado de visitas</p>} />
    </Routes>,
    { initialEntries: [`/actividad/visitas/nueva${search}`] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /visits/form-options': () => jsonResponse(VISIT_FORM_OPTIONS),
    'GET /me/menu': () => jsonResponse(menu(['actividad-visitas'])),
    'GET /customers/c-1': () => jsonResponse(CUSTOMER_DTO),
    'GET /visits/schedule-conflicts': () => jsonResponse({ mode: 'AVISAR', conflicts: [] }),
    'POST /visits': () => jsonResponse(CREATED, 201),
    ...extra,
  });
}

function setDateTime(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ASESOR_PERMISSIONS);
});

afterEach(() => {
  signOut();
  takePendingAttachments({ type: 'visit', visitId: 'v-new' });
});

describe('VisitFormPage (F-26, PF-04.51)', () => {
  it('si las opciones no cargan muestra el error con la referencia y "Reintentar"', async () => {
    let calls = 0;
    api({
      'GET /visits/form-options': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(VISIT_FORM_OPTIONS);
      },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Guardar visita' })).toBeInTheDocument();
  });

  it('valida los obligatorios antes de enviar (AC-04.25)', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Guardar visita' }));

    expect(await screen.findByText('Revisa los campos marcados.')).toBeInTheDocument();
    expect(screen.getAllByText('Este campo es obligatorio.')).toHaveLength(3);
    expect(callsTo(fetchMock, 'POST', '/visits')).toHaveLength(0);
  });

  it('preselecciona el cliente, planifica y lleva al detalle con los archivos pendientes y los solapes (AC-04.24, AC-04.27)', async () => {
    const conflict = { visitId: 'v-9', code: 'VIS-2026-00031', scheduledStartAt: '2099-10-20T16:00:00.000Z', effectiveEndAt: '2099-10-20T17:00:00.000Z', customerName: 'Otro cliente', isVisible: true };
    const fetchMock = api({ 'POST /visits': () => jsonResponse({ ...CREATED, scheduleConflicts: [conflict] }, 201) });
    renderPage('?customerId=c-1');

    expect(await screen.findByRole('combobox', { name: /Cliente/ })).toHaveValue('CLI-000001 · Constructora Peña S.A.');
    expect(screen.getByText(/Preseleccionado\. Si lo cambias/)).toBeInTheDocument();
    setDateTime(/Fecha y hora de inicio/, FUTURE_START);
    setDateTime('Fin', FUTURE_END);
    await userEvent.type(screen.getByLabelText(/Objetivo/), 'Presentar catálogo');
    await userEvent.type(screen.getByLabelText('Ubicación'), 'Planta norte');
    await userEvent.type(screen.getByLabelText('Recordatorio'), '2');
    await userEvent.click(screen.getByRole('combobox', { name: 'Unidad' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Horas antes' }));
    expect(screen.getByText('Se mostrará en la agenda; no se envían notificaciones.')).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'agenda.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar visita' }));

    expect(await screen.findByText('Detalle /actividad/visitas/v-new · Visita VIS-2026-00123 planificada. · conflictos 1')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/visits')[0])).toEqual({
      customerId: 'c-1',
      scheduledStartAt: fromDateTimeLocalValue(FUTURE_START),
      scheduledEndAt: fromDateTimeLocalValue(FUTURE_END),
      objective: 'Presentar catálogo',
      location: 'Planta norte',
      reminderMinutesBefore: 120,
    });
    expect(takePendingAttachments({ type: 'visit', visitId: 'v-new' }).map((file) => file.name)).toEqual(['agenda.pdf']);
  });

  it('avisa del conflicto horario sin deshabilitar "Guardar" y avisa de una fecha pasada (AC-04.26, D-04.5)', async () => {
    const fetchMock = api({
      'GET /visits/schedule-conflicts': () =>
        jsonResponse({
          mode: 'AVISAR',
          conflicts: [
            { visitId: 'v-9', code: 'VIS-2026-00031', scheduledStartAt: '2020-01-10T16:00:00.000Z', effectiveEndAt: '2020-01-10T17:00:00.000Z', customerName: 'Ferretería El Sol', isVisible: true },
            { visitId: null, code: null, scheduledStartAt: '2020-01-10T16:30:00.000Z', effectiveEndAt: '2020-01-10T17:30:00.000Z', customerName: null, isVisible: false },
          ],
        }),
    });
    renderPage('?customerId=c-1');

    await screen.findByRole('combobox', { name: /Cliente/ });
    setDateTime(/Fecha y hora de inicio/, '2020-01-10T10:00');

    expect(await screen.findByText('Ya tienes otra visita en ese horario')).toBeInTheDocument();
    expect(screen.getByText(/^VIS-2026-00031, de .* con Ferretería El Sol$/)).toBeInTheDocument();
    expect(screen.getByText(/^Otra visita del responsable, de /)).toBeInTheDocument();
    expect(screen.getByText('Puedes guardar igualmente.')).toBeInTheDocument();
    expect(screen.getByText('La fecha ya pasó: se registrará como planificación tardía.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar visita' })).toBeEnabled();
    const query = lastQuery(fetchMock, '/visits/schedule-conflicts');
    expect(query.get('start')).toBe(fromDateTimeLocalValue('2020-01-10T10:00'));
    expect(query.has('ownerId')).toBe(false);
    expect(query.has('excludeVisitId')).toBe(false);
  });

  it('con el modo NO no consulta los conflictos', async () => {
    const fetchMock = api({ 'GET /visits/form-options': () => jsonResponse({ ...VISIT_FORM_OPTIONS, conflictMode: 'NO' }) });
    renderPage('?customerId=c-1');

    await screen.findByRole('combobox', { name: /Cliente/ });
    setDateTime(/Fecha y hora de inicio/, FUTURE_START);
    await userEvent.type(screen.getByLabelText(/Objetivo/), 'x');
    expect(callsTo(fetchMock, 'GET', '/visits/schedule-conflicts')).toHaveLength(0);
  });

  it('cambiar de cliente quita los contactos invitados y conserva los demás (E.7)', async () => {
    api({
      'GET /customers/c-1/contacts': () => page([{ id: 'ct-1', fullName: 'Marta Contacto', jobTitle: 'Compras' }]),
      'GET /customers': () => page([{ ...CUSTOMER_DTO }, OTHER_CUSTOMER]),
    });
    renderPage('?customerId=c-1');

    const invitees = await screen.findByRole('group', { name: 'Invitados' });
    await userEvent.click(within(invitees).getByRole('combobox', { name: 'Contacto del cliente' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Marta Contacto · Compras' }));
    await userEvent.click(within(invitees).getByRole('combobox', { name: 'Añadir' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Externo' }));
    await userEvent.type(within(invitees).getByLabelText('Nombre del participante externo'), 'Pedro Externo');
    await userEvent.click(within(invitees).getByRole('button', { name: 'Añadir' }));
    expect(within(invitees).getByText('Marta Contacto · Contacto del cliente')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /Cliente/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'CLI-000002 · Ferretería El Sol' }));

    await waitFor(() => expect(within(invitees).queryByText('Marta Contacto · Contacto del cliente')).not.toBeInTheDocument());
    expect(within(invitees).getByText('Pedro Externo · Externo')).toBeInTheDocument();
  });

  it('pinta bajo cada campo los 422 del backend y la referencia (AC-04.23)', async () => {
    api({
      'POST /visits': () =>
        errorResponse(422, 'PROJECT_CUSTOMER_MISMATCH', [
          { field: 'projectId', code: 'PROJECT_CUSTOMER_MISMATCH' },
          { field: 'location', code: 'REQUIRED_FIELD_MISSING' },
        ]),
    });
    renderPage('?customerId=c-1');

    await screen.findByRole('combobox', { name: /Cliente/ });
    setDateTime(/Fecha y hora de inicio/, FUTURE_START);
    await userEvent.type(screen.getByLabelText(/Objetivo/), 'Presentar');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar visita' }));

    const alert = await screen.findByText(/El proyecto no pertenece al cliente elegido\./);
    expect(alert).toHaveTextContent('Referencia: corr-test');
    expect(screen.getByText('No pertenece al cliente elegido.')).toBeInTheDocument();
    expect(screen.getByText('Este campo es obligatorio.')).toBeInTheDocument();
  });

  it('una preselección inexistente o fuera de alcance se informa y deja el cliente vacío (AC-04.49)', async () => {
    api({ 'GET /customers/c-x': () => errorResponse(404, 'RESOURCE_NOT_FOUND') });
    renderPage('?customerId=c-x');

    expect(await screen.findByText('El cliente indicado no existe o no tienes acceso. Elígelo de la lista.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Cliente/ })).toHaveValue('');
  });

  it('elegir el responsable sólo con visitas.administrar; con otro responsable consulta sus conflictos', async () => {
    api();
    const { unmount } = renderPage();
    const owner = await screen.findByRole('textbox', { name: 'Responsable' });
    expect(owner).toBeDisabled();
    expect(owner).toHaveValue('Ana Asesora');
    unmount();

    signInWith([...ASESOR_PERMISSIONS, 'visitas.administrar']);
    const fetchMock = api({ 'GET /commercial-activity/owner-options': () => page([{ id: 'u-2', displayName: 'Luis Gerente' }]) });
    renderPage();
    const picker = await screen.findByRole('combobox', { name: 'Responsable' });
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole('option', { name: 'Luis Gerente' }));
    setDateTime(/Fecha y hora de inicio/, FUTURE_START);

    await waitFor(() => expect(lastQuery(fetchMock, '/visits/schedule-conflicts').get('ownerId')).toBe('u-2'));
  });
});
