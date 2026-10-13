import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, mockUpload, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { fromDateTimeLocalValue } from '../common/date-time';
import { ASESOR_PERMISSIONS, bodyOf, menu, OTHER_USER, page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';
import {
  CANCEL_REASON,
  DONE_VISIT,
  PENDING_VISIT,
  RESCHEDULE_REASON,
  VISIT_FORM_OPTIONS,
  VISIT_STATUS_CANCELLED,
  VISIT_STATUS_CONFIRMED,
  VISIT_STATUS_RESCHEDULED,
  visitEvent,
} from '../testing/visit-fixtures';

import type { VisitDetail, VisitEvent } from './visits.api';
import { VisitDetailPage } from './VisitDetailPage';

const PATH = '/actividad/visitas/v-1';
const ATTACHMENT = { id: 'att-1', fileName: 'acta.pdf', contentType: 'application/pdf', sizeBytes: 10, description: null, createdAt: '2026-10-12T10:00:00Z', createdBy: null };

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(state?: unknown) {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/visitas/:visitId" element={<VisitDetailPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [state ? ({ pathname: PATH, state } as unknown as string) : PATH] },
  );
}

function api(detail: VisitDetail | (() => Response), extra: Record<string, RouteHandler> = {}, events: VisitEvent[] = [visitEvent()]) {
  return mockApi({
    'GET /visits/v-1': typeof detail === 'function' ? detail : () => jsonResponse(detail),
    'GET /visits/v-1/events': () => jsonResponse(events),
    'GET /visits/v-1/attachments': () => page([]),
    'GET /visits/form-options': () => jsonResponse(VISIT_FORM_OPTIONS),
    'GET /visits/schedule-conflicts': () => jsonResponse({ mode: 'AVISAR', conflicts: [] }),
    'GET /me/menu': () => jsonResponse(menu(['actividad-visitas'])),
    ...extra,
  });
}

async function openAction(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return screen.findByRole('dialog');
}

beforeEach(() => {
  simulateWideScreen();
  signInWith([...ASESOR_PERMISSIONS, 'visitas.editar', 'visitas.cerrar']);
});

afterEach(signOut);

describe('VisitDetailPage (F-25, PF-04.52, PF-04.68)', () => {
  it('ante 404 dice que no existe o no hay acceso, sin distinguir (ADR-008)', async () => {
    api(() => errorResponse(404, 'RESOURCE_NOT_FOUND'));
    renderPage();

    expect(await screen.findByText('La visita no existe o no tienes acceso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a visitas' }));
    expect(await screen.findByText('En /actividad/visitas')).toBeInTheDocument();
  });

  it('un error muestra la referencia y reintenta', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(PENDING_VISIT);
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /VIS-2026-00001/ })).toBeInTheDocument();
  });

  it('pendiente: planificación completa, historial y acciones de su estado; sin "Confirmar" (AC-04.20, AC-04.27)', async () => {
    const conflict = { visitId: 'v-9', code: 'VIS-2026-00031', scheduledStartAt: '2026-10-20T15:30:00.000Z', effectiveEndAt: '2026-10-20T16:30:00.000Z', customerName: 'Ferretería El Sol', isVisible: true };
    api(PENDING_VISIT);
    renderPage({ notice: 'Visita VIS-2026-00001 planificada.', severity: 'success', scheduleConflicts: [conflict] });

    expect(await screen.findByText('Visita VIS-2026-00001 planificada.')).toBeInTheDocument();
    expect(screen.getByText('La visita se guardó, pero se solapa con otra')).toBeInTheDocument();
    const info = screen.getByRole('region', { name: 'Información de la visita' });
    expect(within(info).getByRole('link', { name: 'CLI-000001 · Constructora Peña S.A.' })).toHaveAttribute('href', '/clientes/c-1');
    expect(within(info).getByRole('link', { name: 'PRY-2026-00001 · Torre Norte' })).toHaveAttribute('href', '/proyectos/p-1');
    expect(within(info).getByText('Presentar catálogo')).toBeInTheDocument();
    expect(within(info).getByText('Oficina del cliente')).toBeInTheDocument();
    expect(within(info).getByText(/^2 h antes · /)).toBeInTheDocument();
    expect(within(info).getByText('El recordatorio se muestra en la agenda; no se envían notificaciones.')).toBeInTheDocument();
    expect(within(info).getByText('Pedro Externo (externo), Luis Gerente (usuario interno)')).toBeInTheDocument();
    expect(within(info).getByText('Aún no se ha registrado como realizada.')).toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'Historial de la visita' });
    expect(await within(history).findByText('Planificada')).toBeInTheDocument();
    expect(within(history).getByText('Estado: Programada')).toBeInTheDocument();

    for (const name of ['Registrar realizada', 'Editar planificación', 'Reprogramar', 'Cancelar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir realización' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Subir archivos' })).toBeInTheDocument();
  });

  it('edita la planificación sin la fecha de inicio y sin enviarla (RN-04.15, AC-04.22)', async () => {
    const fetchMock = api(PENDING_VISIT, {
      'PATCH /visits/v-1': () => jsonResponse({ ...PENDING_VISIT, location: 'Planta' }),
    });
    renderPage();

    const dialog = await openAction('Editar planificación');
    expect(within(dialog).getByLabelText(/Fecha y hora de inicio/)).toBeDisabled();
    expect(within(dialog).getByText('Para cambiar la fecha, reprograma la visita.')).toBeInTheDocument();
    const location = within(dialog).getByLabelText('Ubicación');
    await userEvent.clear(location);
    await userEvent.type(location, 'Planta');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Visita VIS-2026-00001 actualizada.')).toBeInTheDocument();
    const body = bodyOf(callsTo(fetchMock, 'PATCH', '/visits/v-1')[0]);
    expect(body).toEqual({
      projectId: 'p-1',
      scheduledEndAt: null,
      objective: 'Presentar catálogo',
      location: 'Planta',
      reminderMinutesBefore: 120,
      participants: [{ externalName: 'Pedro Externo' }, { userId: OTHER_USER.id }],
    });
  });

  it('registrar realizada: asistentes desde los invitados, error del backend bajo su campo y archivos al evento COMPLETED (AC-04.29, AC-04.30)', async () => {
    let attempts = 0;
    const fetchMock = api(
      PENDING_VISIT,
      {
        'POST /visits/v-1/completion': () => {
          attempts += 1;
          return attempts === 1
            ? errorResponse(422, 'ACTUAL_DATE_IN_FUTURE', [{ field: 'actualStartAt', code: 'ACTUAL_DATE_IN_FUTURE' }])
            : jsonResponse({ ...DONE_VISIT, id: 'v-1' });
        },
      },
      [visitEvent(), visitEvent({ id: 'ev-c', eventType: 'COMPLETED', occurredAt: new Date().toISOString() })],
    );
    const uploads = mockUpload(() => ({ status: 201, body: ATTACHMENT }));
    renderPage();

    const dialog = await openAction('Registrar realizada');
    const attendees = within(dialog).getByRole('group', { name: 'Asistentes' });
    expect(within(attendees).getByText('Pedro Externo · Externo')).toBeInTheDocument();
    expect(within(attendees).getByText('Luis Gerente · Usuario interno')).toBeInTheDocument();
    await userEvent.click(within(attendees).getByTitle('Quitar a Luis Gerente'));
    await userEvent.type(within(dialog).getByLabelText('Temas tratados'), 'Precios');
    await userEvent.type(within(dialog).getByLabelText('Próxima acción'), 'Enviar cotización');
    fireEvent.change(within(dialog).getByLabelText('Fecha de la próxima acción'), { target: { value: '2099-01-15' } });
    await userEvent.upload(within(dialog).getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'acta.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar realizada' }));

    expect(await within(dialog).findByText('No puede ser futura.')).toBeInTheDocument();
    expect(within(dialog).getByText(/La fecha no puede ser futura\. Referencia: corr-test/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar realizada' }));
    expect(await screen.findByText('Visita VIS-2026-00001 registrada como realizada.')).toBeInTheDocument();
    const body = bodyOf(callsTo(fetchMock, 'POST', '/visits/v-1/completion')[1]);
    expect(body).toEqual(
      expect.objectContaining({
        attendees: [{ externalName: 'Pedro Externo' }],
        topics: 'Precios',
        nextAction: 'Enviar cotización',
        nextActionDate: '2099-01-15',
        resultId: null,
      }),
    );
    expect(uploads.map((upload) => upload.path)).toEqual(['/visits/v-1/events/ev-c/attachments']);
  });

  it('realizada propia: "Confirmar" exige resumen si la realización no lo tiene y sube los archivos al evento CONFIRMED (AC-04.33, AC-04.34)', async () => {
    const confirmed: VisitDetail = {
      ...DONE_VISIT,
      status: { ...DONE_VISIT.status, ...VISIT_STATUS_CONFIRMED },
      confirmation: { confirmedAt: '2026-10-12T10:00:00Z', confirmedBy: DONE_VISIT.owner, summary: 'Cliente interesado' },
      allowedActions: [],
    };
    let current = DONE_VISIT;
    const fetchMock = api(
      () => jsonResponse(current),
      {
        'POST /visits/v-1/confirmation': () => {
          current = confirmed;
          return jsonResponse(confirmed);
        },
      },
      [visitEvent(), visitEvent({ id: 'ev-conf', eventType: 'CONFIRMED', occurredAt: new Date().toISOString() })],
    );
    const uploads = mockUpload(() => ({ status: 201, body: ATTACHMENT }));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Corregir realización' })).toBeInTheDocument();
    const dialog = await openAction('Confirmar');
    expect(within(dialog).getByRole('region', { name: 'Realización registrada' })).toHaveTextContent('Interesado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialog).findByText('Escribe un resumen: la realización no tiene resumen ni comentarios.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/visits/v-1/confirmation')).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText(/Resumen de confirmación/), 'Cliente interesado');
    await userEvent.upload(within(dialog).getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'firma.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Visita VIS-2026-00001 confirmada.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/visits/v-1/confirmation')[0])).toEqual({ confirmationSummary: 'Cliente interesado' });
    expect(uploads.map((upload) => upload.path)).toEqual(['/visits/v-1/events/ev-conf/attachments']);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument());
    expect(screen.getByText('Cliente interesado')).toBeInTheDocument();
  });

  it('un manager o administrador que consulta la visita ajena no ve "Confirmar"; un 403 se muestra en español (AC-04.62, AC-04.63)', async () => {
    api({ ...DONE_VISIT, owner: OTHER_USER, allowedActions: ['CORRECT_COMPLETION'] });
    const { unmount } = renderPage();
    expect(await screen.findByRole('button', { name: 'Corregir realización' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.getByText('Pendiente de confirmar por el asesor dueño de la visita.')).toBeInTheDocument();
    unmount();

    api(DONE_VISIT, { 'POST /visits/v-1/confirmation': () => errorResponse(403, 'VISIT_CONFIRMATION_OWNER_ONLY') });
    renderPage();
    const dialog = await openAction('Confirmar');
    await userEvent.type(within(dialog).getByLabelText(/Resumen de confirmación/), 'Ok');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialog).findByText(/Solo el asesor dueño de la visita puede confirmarla\./)).toBeInTheDocument();
  });

  it('corregir la realización parte de lo guardado y envía PUT', async () => {
    const fetchMock = api(DONE_VISIT, { 'PUT /visits/v-1/completion': () => jsonResponse(DONE_VISIT) });
    renderPage();

    const dialog = await openAction('Corregir realización');
    expect(within(dialog).getByLabelText('Temas tratados')).toHaveValue('Precios');
    expect(within(dialog).getByText('La corrección sustituye la realización registrada. Queda en la auditoría y no genera un evento nuevo.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Comentarios'), 'Faltó el gerente');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar corrección' }));

    expect(await screen.findByText('Realización de la visita VIS-2026-00001 corregida.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PUT', '/visits/v-1/completion')[0])).toEqual(
      expect.objectContaining({ topics: 'Precios', comments: 'Faltó el gerente', actualStartAt: '2026-10-05T15:10:00.000Z' }),
    );
  });

  it('reprogramar: avisa del conflicto, mapea el 422 y muestra los solapes guardados (AC-04.37, AC-04.38)', async () => {
    const conflict = { visitId: 'v-9', code: 'VIS-2026-00031', scheduledStartAt: '2099-10-22T15:00:00.000Z', effectiveEndAt: '2099-10-22T16:00:00.000Z', customerName: 'Ferretería El Sol', isVisible: true };
    let attempts = 0;
    const fetchMock = api(PENDING_VISIT, {
      'GET /visits/schedule-conflicts': () => jsonResponse({ mode: 'AVISAR', conflicts: [conflict] }),
      'POST /visits/v-1/rescheduling': () => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(422, 'DATE_IN_PAST', [{ field: 'newScheduledStartAt', code: 'DATE_IN_PAST' }])
          : jsonResponse({ ...PENDING_VISIT, status: { ...PENDING_VISIT.status, ...VISIT_STATUS_RESCHEDULED }, rescheduleCount: 1, scheduleConflicts: [conflict] });
      },
    });
    renderPage();

    const dialog = await openAction('Reprogramar');
    fireEvent.change(within(dialog).getByLabelText(/Nueva fecha y hora/), { target: { value: '2099-10-22T10:00' } });
    expect(await within(dialog).findByText('Ya tienes otra visita en ese horario')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Motivo/ }));
    await userEvent.click(await screen.findByRole('option', { name: RESCHEDULE_REASON.label }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reprogramar' }));

    expect(await within(dialog).findByText('No puede estar en el pasado.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reprogramar' }));

    expect(await screen.findByText('Visita VIS-2026-00001 reprogramada.')).toBeInTheDocument();
    expect(screen.getByText('La visita se guardó, pero se solapa con otra')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/visits/v-1/rescheduling')[1])).toEqual({
      newScheduledStartAt: fromDateTimeLocalValue('2099-10-22T10:00'),
      reasonId: RESCHEDULE_REASON.id,
    });
    const conflictQuery = new URL(String(fetchMock.mock.calls.filter(([input]) => String(input).includes('schedule-conflicts')).at(-1)?.[0]), 'http://localhost');
    expect(conflictQuery.searchParams.get('excludeVisitId')).toBe('v-1');
  });

  it('cancelar exige motivo y avisa si un archivo no se adjuntó al evento (AC-04.39, AC-04.41)', async () => {
    const cancelled: VisitDetail = {
      ...PENDING_VISIT,
      status: { ...PENDING_VISIT.status, ...VISIT_STATUS_CANCELLED },
      cancelledAt: '2026-10-12T10:00:00Z',
      allowedActions: [],
    };
    let current = PENDING_VISIT;
    const fetchMock = api(
      () => jsonResponse(current),
      {
        'POST /visits/v-1/cancellation': () => {
          current = cancelled;
          return jsonResponse(cancelled);
        },
      },
      [visitEvent(), visitEvent({ id: 'ev-x', eventType: 'CANCELLED', occurredAt: new Date().toISOString() })],
    );
    mockUpload(() => ({ status: 422, body: { statusCode: 422, code: 'ATTACHMENT_TYPE_NOT_ALLOWED', message: 'x', details: [], correlationId: 'corr-up' } }));
    renderPage();

    const dialog = await openAction('Cancelar');
    expect(within(dialog).getByText('La visita quedará cancelada y no podrá reactivarse. Se conserva con su historial.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar visita' }));
    expect(await within(dialog).findByText('Indica un motivo de la lista o escríbelo.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/visits/v-1/cancellation')).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('combobox', { name: /Motivo/ }));
    await userEvent.click(await screen.findByRole('option', { name: CANCEL_REASON.label }));
    await userEvent.type(within(dialog).getByLabelText('Comentario'), 'Lluvia');
    await userEvent.upload(within(dialog).getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'correo.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar visita' }));

    expect(await screen.findByText(/^Visita VIS-2026-00001 cancelada\. «correo\.pdf» no se adjuntó: /)).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/visits/v-1/cancellation')[0])).toEqual({ reasonId: CANCEL_REASON.id, comment: 'Lluvia' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeInTheDocument());
    for (const name of ['Registrar realizada', 'Editar planificación', 'Cancelar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText('La visita se canceló sin realizarse.')).toBeInTheDocument();
  });

  it('confirmada o cancelada: solo lectura, sin acciones ni subida (D-04.6, RN-04.21)', async () => {
    api({
      ...DONE_VISIT,
      status: { ...DONE_VISIT.status, ...VISIT_STATUS_CONFIRMED },
      confirmation: { confirmedAt: '2026-10-12T10:00:00Z', confirmedBy: DONE_VISIT.owner, summary: 'Todo en orden' },
      allowedActions: [],
      access: 'INHERITED',
    });
    renderPage();

    expect(await screen.findByText('Todo en orden')).toBeInTheDocument();
    expect(screen.getByText(/su proyecto es visible para ti/)).toBeInTheDocument();
    for (const name of ['Confirmar', 'Corregir realización', 'Registrar realizada', 'Reprogramar', 'Cancelar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    await screen.findByText('Esta visita no tiene adjuntos');
    expect(screen.queryByRole('button', { name: 'Subir archivos' })).not.toBeInTheDocument();
  });

  it('historial: eventos con fechas y motivo; quien ejecutó un evento reciente puede adjuntarle archivos (D-04.18)', async () => {
    api(PENDING_VISIT, {}, [
      visitEvent(),
      visitEvent({
        id: 'ev-r',
        eventType: 'RESCHEDULED',
        fromStatus: { id: 'vs-prog', code: 'PROGRAMADA', label: 'Programada' },
        toStatus: { id: 'vs-repro', code: 'REPROGRAMADA', label: 'Reprogramada' },
        previousScheduledStartAt: '2026-10-18T15:00:00.000Z',
        newScheduledStartAt: '2026-10-20T15:00:00.000Z',
        reason: { id: RESCHEDULE_REASON.id, code: RESCHEDULE_REASON.code, label: RESCHEDULE_REASON.label },
        reasonText: 'Viaje',
        occurredAt: new Date().toISOString(),
        attachmentCount: 1,
      }),
      visitEvent({ id: 'ev-old', eventType: 'CANCELLED', performedBy: OTHER_USER, occurredAt: '2026-01-01T10:00:00.000Z', attachmentCount: 0 }),
      visitEvent({ id: 'ev-new', eventType: 'COMPLETED', occurredAt: new Date().toISOString(), attachmentCount: 0 }),
    ]);
    renderPage();

    const history = await screen.findByRole('list', { name: 'Eventos de la visita' });
    expect(within(history).getByText('Estado: Programada → Reprogramada')).toBeInTheDocument();
    expect(within(history).getByText(/^Fecha: .* → /)).toBeInTheDocument();
    expect(within(history).getByText('Motivo: Solicitud del cliente · Viaje')).toBeInTheDocument();
    // El evento propio reciente ofrece adjuntar; el ajeno o antiguo sin adjuntos, nada.
    expect(within(history).getAllByRole('button')).toHaveLength(2);
    expect(within(history).getByRole('button', { name: 'Adjuntos del evento (1)' })).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: 'Adjuntar archivos al evento' })).toBeInTheDocument();
  });
});
