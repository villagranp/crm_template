import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import { callsTo, jsonResponse, mockApi, mockUpload } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { page, signInWith, signOut, simulateWideScreen } from '../testing/fixtures';

import { commercialAttachmentsPath, stashPendingAttachments, takePendingAttachments } from './attachment-owner';
import { AttachmentsPanel } from './AttachmentsPanel';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const FILE_DTO = {
  id: 'att-1',
  fileName: 'acta.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  description: null,
  createdAt: '2026-10-01T15:30:00.000Z',
  createdBy: { id: 'u-1', displayName: 'Ana Asesora' },
};

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['actividades.ver']);
});

afterEach(() => {
  signOut();
  takePendingAttachments({ type: 'activity', activityId: 'a-1' });
});

describe('commercialAttachmentsPath (04 §F.4, DC-2)', () => {
  it('cuelga la ruta del dueño', () => {
    expect(commercialAttachmentsPath({ type: 'activity', activityId: 'a-1' })).toBe('/activities/a-1/attachments');
    expect(commercialAttachmentsPath({ type: 'visit', visitId: 'v-1' })).toBe('/visits/v-1/attachments');
    expect(commercialAttachmentsPath({ type: 'visitEvent', visitId: 'v-1', eventId: 'e-1' })).toBe('/visits/v-1/events/e-1/attachments');
  });
});

describe('AttachmentsPanel (PF-04.56)', () => {
  it('lista y descarga por la ruta del dueño (actividad)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      'GET /activities/a-1/attachments': () => page([FILE_DTO]),
      'GET /activities/a-1/attachments/att-1/content': () =>
        new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="acta.pdf"' } }),
    });
    renderWithProviders(<AttachmentsPanel owner={{ type: 'activity', activityId: 'a-1' }} canManage />);

    expect(await screen.findByText('acta.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descargar acta.pdf' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.anything(), 'acta.pdf'));
    expect(callsTo(fetchMock, 'GET', '/activities/a-1/attachments/att-1/content')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Eliminar acta.pdf' })).toBeInTheDocument();
  });

  it('con el dueño no editable oculta subir y eliminar; el vacío lleva el texto del dueño', async () => {
    mockApi({ 'GET /visits/v-1/attachments': () => page([]) });
    renderWithProviders(<AttachmentsPanel owner={{ type: 'visit', visitId: 'v-1' }} canManage={false} />);

    expect(await screen.findByText('Esta visita no tiene adjuntos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir archivos' })).not.toBeInTheDocument();
  });

  it('en un evento de visita deja subir pero nunca eliminar', async () => {
    mockApi({ 'GET /visits/v-1/events/e-1/attachments': () => page([FILE_DTO]) });
    renderWithProviders(<AttachmentsPanel owner={{ type: 'visitEvent', visitId: 'v-1', eventId: 'e-1' }} canManage />);

    expect(await screen.findByText('acta.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir archivos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar acta.pdf' })).not.toBeInTheDocument();
  });

  it('valida antes de subir con los límites y traduce el 413 y el 422 del backend', async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockApi({ 'GET /activities/a-1/attachments': () => page([]) });
    const replies = [
      { status: 413 },
      { status: 422, body: { statusCode: 422, code: 'ATTACHMENT_TYPE_NOT_ALLOWED', message: 'x', details: [], correlationId: 'c' } },
    ];
    const uploads = mockUpload(() => replies.shift() ?? { status: 500 });
    renderWithProviders(
      <AttachmentsPanel owner={{ type: 'activity', activityId: 'a-1' }} canManage limits={{ maxMb: 10, allowedTypes: ['application/pdf'] }} />,
    );
    await screen.findByText('Esta actividad no tiene adjuntos');

    await user.upload(screen.getByLabelText('Seleccionar archivos para subir'), [
      file('macro.exe', 'application/x-msdownload'),
      file('grande.pdf', 'application/pdf'),
      file('falso.pdf', 'application/pdf'),
    ]);

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('macro.exe: El tipo de archivo no está permitido.'),
        expect.stringContaining('grande.pdf: El archivo supera el tamaño máximo permitido (10 MB).'),
        expect.stringContaining('falso.pdf: El tipo de archivo no está permitido.'),
      ]),
    );
    expect(uploads.map((upload) => upload.path)).toEqual(['/activities/a-1/attachments', '/activities/a-1/attachments']);
  });

  it('sube al montar los archivos que dejó el alta, una sola vez', async () => {
    mockApi({ 'GET /activities/a-1/attachments': () => page([]) });
    const uploads = mockUpload(() => ({ status: 201, body: FILE_DTO }));
    stashPendingAttachments({ type: 'activity', activityId: 'a-1' }, [file('acta.pdf', 'application/pdf')]);

    renderWithProviders(<AttachmentsPanel owner={{ type: 'activity', activityId: 'a-1' }} canManage uploadPendingFromCreation />);

    expect(await screen.findByText('Se subió «acta.pdf».')).toBeInTheDocument();
    expect(uploads).toHaveLength(1);
    expect(takePendingAttachments({ type: 'activity', activityId: 'a-1' })).toEqual([]);
  });

  it('sin uploadPendingFromCreation no toca los archivos pendientes', async () => {
    mockApi({ 'GET /activities/a-1/attachments': () => jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }) });
    const uploads = mockUpload(() => ({ status: 201, body: FILE_DTO }));
    stashPendingAttachments({ type: 'activity', activityId: 'a-1' }, [file('acta.pdf', 'application/pdf')]);

    renderWithProviders(<AttachmentsPanel owner={{ type: 'activity', activityId: 'a-1' }} canManage />);
    await screen.findByText('Esta actividad no tiene adjuntos');

    expect(uploads).toHaveLength(0);
    expect(takePendingAttachments({ type: 'activity', activityId: 'a-1' })).toHaveLength(1);
  });
});
