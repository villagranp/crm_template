import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, mockUpload, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import {
  ACTIVITY_DETAIL,
  ASESOR_PERMISSIONS,
  bodyOf,
  FORM_OPTIONS,
  menu,
  page,
  RESULT_OK,
  signInWith,
  signOut,
  simulateWideScreen,
} from '../testing/fixtures';

import type { ActivityDetail } from './activities.api';
import { ActivityDetailPage } from './ActivityDetailPage';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}`}</p>;
}

function renderPage(state?: unknown) {
  return renderWithProviders(
    <Routes>
      <Route path="/actividad/actividades/:activityId" element={<ActivityDetailPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [state ? ({ pathname: '/actividad/actividades/a-1', state } as unknown as string) : '/actividad/actividades/a-1'] },
  );
}

function api(detail: ActivityDetail | (() => Response), extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /activities/a-1': typeof detail === 'function' ? detail : () => jsonResponse(detail),
    'GET /activities/a-1/attachments': () => page([]),
    'GET /activities/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /me/menu': () => jsonResponse(menu(['actividad-actividades'])),
    ...extra,
  });
}

const COMPLETED: ActivityDetail = {
  ...ACTIVITY_DETAIL,
  status: { id: 's-done', code: 'COMPLETADA', label: 'Completada', group: 'DONE' },
  dueBucket: null,
  result: { id: RESULT_OK.id, code: RESULT_OK.code, label: RESULT_OK.label },
  completion: { completedAt: '2026-10-12T15:00:00.000Z', completedBy: { id: 'u-1', displayName: 'Ana Asesora' }, comment: 'Todo bien' },
  allowedActions: [],
};

beforeEach(() => {
  simulateWideScreen();
  signInWith([...ASESOR_PERMISSIONS, 'actividades.eliminar']);
});

afterEach(signOut);

describe('ActivityDetailPage (F-30, F-33)', () => {
  it('ante 404 dice que no existe o no hay acceso, sin distinguir (ADR-008)', async () => {
    api(() => errorResponse(404, 'RESOURCE_NOT_FOUND'));
    renderPage();

    expect(await screen.findByText('La actividad no existe o no tienes acceso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a actividades' }));
    expect(await screen.findByText('En /actividad/actividades')).toBeInTheDocument();
  });

  it('un error muestra la referencia y reintenta', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(ACTIVITY_DETAIL);
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Llamar para cotización/ })).toBeInTheDocument();
  });

  it('muestra generales, los campos del tipo y las acciones de allowedActions (AC-04.42)', async () => {
    api(ACTIVITY_DETAIL);
    renderPage({ notice: 'Actividad ACT-2026-000001 creada.', severity: 'success' });

    expect(await screen.findByText('Actividad ACT-2026-000001 creada.')).toBeInTheDocument();
    const info = screen.getByRole('region', { name: 'Información de la actividad' });
    expect(within(info).getByRole('link', { name: 'CLI-000001 · Constructora Peña S.A.' })).toHaveAttribute('href', '/clientes/c-1');
    expect(within(info).getByText('30 min')).toBeInTheDocument();
    expect(within(info).getByText('Pedro Externo (externo)')).toBeInTheDocument();
    expect(within(info).getByText('Próxima a vencer')).toBeInTheDocument();
    for (const name of ['Completar', 'Editar', 'Cancelar', 'Eliminar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(await screen.findByRole('button', { name: 'Subir archivos' })).toBeInTheDocument();
  });

  it('completada: sin acciones, con su finalización y adjuntos de solo lectura (D-04.6)', async () => {
    api({ ...COMPLETED, access: 'INHERITED' });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Finalización' })).toBeInTheDocument();
    expect(screen.getByText('Todo bien')).toBeInTheDocument();
    expect(screen.getByText(/su proyecto es visible para ti/)).toBeInTheDocument();
    for (const name of ['Completar', 'Editar', 'Cancelar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    await screen.findByText('Esta actividad no tiene adjuntos');
    expect(screen.queryByRole('button', { name: 'Subir archivos' })).not.toBeInTheDocument();
  });

  it('edita en la misma pantalla y envía sólo lo que cambia de cliente, tipo, responsable y estado (AC-04.45)', async () => {
    const fetchMock = api(ACTIVITY_DETAIL, {
      'PATCH /activities/a-1': () => jsonResponse({ ...ACTIVITY_DETAIL, subject: 'Llamar de nuevo' }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const subject = await screen.findByLabelText(/Asunto/);
    expect(subject).toHaveValue('Llamar para cotización');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Llamar de nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Actividad ACT-2026-000001 actualizada.')).toBeInTheDocument();
    const body = bodyOf(callsTo(fetchMock, 'PATCH', '/activities/a-1')[0]);
    expect(body.subject).toBe('Llamar de nuevo');
    expect(body.durationMinutes).toBe(30);
    expect(body.participants).toEqual([{ externalName: 'Pedro Externo' }]);
    for (const key of ['customerId', 'typeId', 'ownerId', 'statusId']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('un 409 RECORD_READ_ONLY al guardar se explica en el formulario', async () => {
    api(ACTIVITY_DETAIL, { 'PATCH /activities/a-1': () => errorResponse(409, 'RECORD_READ_ONLY') });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/El registro ya está cerrado y es de solo lectura\./)).toBeInTheDocument();
  });

  it('completa con el diálogo: exige resultado y envía la finalización (AC-04.54, AC-04.55)', async () => {
    const fetchMock = api(ACTIVITY_DETAIL, { 'POST /activities/a-1/completion': () => jsonResponse(COMPLETED) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Completar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completar actividad' });
    expect(await within(dialog).findByText(/Pasará al estado «Completada»/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));
    expect(await within(dialog).findByText('Indica un resultado de la lista o escribe notas.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Notas del resultado'), 'Pidió propuesta');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));

    expect(await screen.findByText('Actividad ACT-2026-000001 completada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const body = bodyOf(callsTo(fetchMock, 'POST', '/activities/a-1/completion')[0]);
    expect(body.resultNotes).toBe('Pidió propuesta');
    expect(body.completedAt).toMatch(/Z$/);
  });

  it('el diálogo sube los archivos antes de completar y, si uno falla, no completa', async () => {
    const fetchMock = api(ACTIVITY_DETAIL, { 'POST /activities/a-1/completion': () => jsonResponse(COMPLETED) });
    const uploads = mockUpload(() => ({ status: 413 }));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Completar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completar actividad' });
    await userEvent.type(await within(dialog).findByLabelText('Notas del resultado'), 'Hecho');
    await userEvent.upload(within(dialog).getByLabelText('Elegir archivos para adjuntar'), new File(['x'], 'grande.pdf', { type: 'application/pdf' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));

    expect(await within(dialog).findByText(/grande\.pdf: El archivo supera el tamaño máximo permitido\. La actividad no se completó/)).toBeInTheDocument();
    expect(uploads[0]?.path).toBe('/activities/a-1/attachments');
    expect(callsTo(fetchMock, 'POST', '/activities/a-1/completion')).toHaveLength(0);
  });

  it('un 403 al completar se muestra con su mensaje y la referencia (AC-04.57)', async () => {
    api(ACTIVITY_DETAIL, { 'POST /activities/a-1/completion': () => errorResponse(403, 'PERMISSION_DENIED') });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Completar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completar actividad' });
    await userEvent.type(await within(dialog).findByLabelText('Notas del resultado'), 'Hecho');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }));
    expect(await within(dialog).findByText('No tienes permiso para realizar esta acción. Referencia: corr-test')).toBeInTheDocument();
  });

  it('cancela con comentario opcional', async () => {
    const fetchMock = api(ACTIVITY_DETAIL, {
      'POST /activities/a-1/cancellation': () =>
        jsonResponse({ ...ACTIVITY_DETAIL, status: { id: 's-canc', code: 'CANCELADA', label: 'Cancelada', group: 'CANCELLED' }, allowedActions: ['DELETE'] }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar actividad' });
    await userEvent.type(within(dialog).getByLabelText('Comentario (opcional)'), 'Ya no aplica');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar actividad' }));

    expect(await screen.findByText('Actividad ACT-2026-000001 cancelada.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/activities/a-1/cancellation')[0])).toEqual({ comment: 'Ya no aplica' });
  });

  it('elimina tras confirmar y vuelve al listado; un 409 se muestra en el diálogo', async () => {
    let attempts = 0;
    api(ACTIVITY_DETAIL, {
      'DELETE /activities/a-1': () => {
        attempts += 1;
        return attempts === 1 ? errorResponse(409, 'RECORD_READ_ONLY') : new Response(null, { status: 204 });
      },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar actividad' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialog).findByText(/El registro ya está cerrado y es de solo lectura\./)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('En /actividad/actividades')).toBeInTheDocument();
  });
});
