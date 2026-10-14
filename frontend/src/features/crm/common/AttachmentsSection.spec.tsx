import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import {
  callsTo,
  deferred,
  errorResponse,
  jsonResponse,
  mockApi,
  mockUpload,
  type RouteHandler,
} from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { AttachmentDto, AttachmentLimits } from './attachments.api';
import { AttachmentsSection, type AttachmentsSectionProps } from './AttachmentsSection';

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const BASE = '/customers/c-1/attachments';

const CONTRACT: AttachmentDto = {
  id: 'att-1',
  fileName: 'contrato.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2 * 1024 * 1024,
  description: 'Contrato marco',
  createdAt: '2026-10-01T15:30:00.000Z',
  createdBy: { id: 'u-1', displayName: 'Ana Pérez' },
};

const LIMITS: AttachmentLimits = {
  maxMb: 10,
  allowedTypes: ['application/pdf', 'image/png'],
};

/**
 * Contenido del Blob entregado a `saveFile`, sea el Blob nativo de Node (con `text()`) o
 * el de jsdom (sin `text()` según la versión de Node): solo `FileReader` lee este último.
 */
function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function page(items: AttachmentDto[]) {
  return jsonResponse({
    data: items,
    pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 },
  });
}

function file(name: string, type: string, sizeBytes = 1024): File {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: sizeBytes });
  return result;
}

function renderSection(props: Partial<AttachmentsSectionProps> = {}) {
  return renderWithProviders(
    <AttachmentsSection
      basePath={BASE}
      canManage
      limits={LIMITS}
      emptyMessage="Este cliente no tiene adjuntos"
      {...props}
    />,
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Seleccionar archivos para subir');
}

describe('AttachmentsSection', () => {
  beforeEach(() => {
    vi.mocked(saveFile).mockClear();
  });

  it('lista los adjuntos y descarga por el cliente HTTP, guardando con el nombre del servidor', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      [`GET ${BASE}`]: () => page([CONTRACT]),
      [`GET ${BASE}/att-1/content`]: () =>
        new Response('%PDF', {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': "attachment; filename*=UTF-8''contrato%20firmado.pdf",
          },
        }),
    });
    renderSection();

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('Contrato marco')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descargar contrato.pdf' }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.anything(), 'contrato firmado.pdf'));
    // Se comprueba el contenido y no `expect.any(Blob)`: la respuesta trae el `Blob`
    // nativo de Node y el global de jsdom es otra clase, así que `instanceof` falla.
    const [blob] = vi.mocked(saveFile).mock.calls[0] as [Blob, string];
    expect(blob.type).toBe('application/pdf');
    expect(await blobText(blob)).toBe('%PDF');
    expect(callsTo(fetchMock, 'GET', `${BASE}/att-1/content`)).toHaveLength(1);
  });

  it('muestra el estado vacío del dueño', async () => {
    mockApi({ [`GET ${BASE}`]: () => page([]) });
    renderSection();

    expect(await screen.findByText('Este cliente no tiene adjuntos')).toBeInTheDocument();
  });

  it('ante un error de la lista muestra el mensaje y reintenta', async () => {
    const user = userEvent.setup();
    let failures = 1;
    mockApi({
      [`GET ${BASE}`]: () => (failures-- > 0 ? errorResponse(500, 'INTERNAL_ERROR') : page([CONTRACT])),
    });
    renderSection();

    expect(await screen.findByText(/error en el servidor/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
  });

  it('sin permiso de gestión no ofrece subir ni eliminar, pero sí descargar', async () => {
    mockApi({ [`GET ${BASE}`]: () => page([CONTRACT]) });
    renderSection({ canManage: false });

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir archivos' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seleccionar archivos para subir')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar contrato.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar contrato.pdf' })).toBeInTheDocument();
  });

  it('con canDelete=false deja subir pero no eliminar (adjuntos de un evento de visita)', async () => {
    mockApi({ [`GET ${BASE}`]: () => page([CONTRACT]) });
    renderSection({ canDelete: false });

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir archivos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar contrato.pdf' })).not.toBeInTheDocument();
  });

  it('sube con progreso y, al terminar, refresca la lista y lo anuncia', async () => {
    const user = userEvent.setup();
    let listed: AttachmentDto[] = [];
    const fetchMock = mockApi({ [`GET ${BASE}`]: () => page(listed) });
    const release = deferred<void>();
    const uploads = mockUpload(() => ({
      status: 201,
      body: { ...CONTRACT, id: 'att-2', fileName: 'plano.png', contentType: 'image/png' },
      progress: [[30, 120]],
      hold: release.promise.then(() => {
        listed = [{ ...CONTRACT, id: 'att-2', fileName: 'plano.png', contentType: 'image/png' }];
      }),
    }));
    renderSection();
    await screen.findByText('Este cliente no tiene adjuntos');

    await user.upload(fileInput(), file('plano.png', 'image/png'));

    const progress = await screen.findByRole('progressbar', { name: 'Subiendo plano.png' });
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '25'));
    expect(screen.getByText('25 %')).toBeInTheDocument();

    release.resolve();

    expect(await screen.findByText('Se subió «plano.png».')).toBeInTheDocument();
    expect(await screen.findByText('plano.png')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Subiendo plano.png' })).not.toBeInTheDocument();

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.method).toBe('POST');
    expect(uploads[0]?.path).toBe(BASE);
    expect((uploads[0]?.body as FormData).get('file')).toBeInstanceOf(File);
    // La lista se volvió a pedir tras la subida (con su paginación en la query).
    const listCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes(`${BASE}?`));
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('muestra el error por archivo (413 sin JSON, 422 de tipo) y sigue con el resto de la cola', async () => {
    const user = userEvent.setup();
    mockApi({ [`GET ${BASE}`]: () => page([]) });
    const replies = [
      { status: 413 },
      {
        status: 422,
        body: { statusCode: 422, code: 'ATTACHMENT_TYPE_NOT_ALLOWED', message: 'x', details: [], correlationId: 'c' },
      },
      { status: 201, body: { ...CONTRACT, id: 'att-3', fileName: 'bueno.pdf' } },
    ];
    const uploads = mockUpload(() => replies.shift() ?? { status: 500 });
    renderSection();
    await screen.findByText('Este cliente no tiene adjuntos');

    await user.upload(fileInput(), [
      file('grande.pdf', 'application/pdf'),
      file('disfrazado.pdf', 'application/pdf'),
      file('bueno.pdf', 'application/pdf'),
    ]);

    expect(await screen.findByText('Se subió «bueno.pdf».')).toBeInTheDocument();
    expect(uploads).toHaveLength(3);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('grande.pdf: El archivo supera el tamaño máximo permitido (10 MB).');
    expect(alerts[1]).toHaveTextContent('disfrazado.pdf: El tipo de archivo no está permitido. Tipos admitidos: PDF, PNG.');

    await user.click(screen.getByRole('button', { name: 'Descartar el aviso de grande.pdf' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('avisa antes de subir un archivo que excede el límite o de un tipo no admitido, sin enviarlo', async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockApi({ [`GET ${BASE}`]: () => page([]) });
    const uploads = mockUpload(() => ({ status: 201, body: CONTRACT }));
    renderSection();
    await screen.findByText('Este cliente no tiene adjuntos');

    await user.upload(fileInput(), [
      file('enorme.pdf', 'application/pdf', 11 * 1024 * 1024),
      file('macro.exe', 'application/x-msdownload'),
    ]);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('enorme.pdf: El archivo supera el tamaño máximo permitido (10 MB).');
    expect(alerts[1]).toHaveTextContent('macro.exe: El tipo de archivo no está permitido.');
    expect(uploads).toHaveLength(0);
  });

  it('elimina tras confirmar y refresca la lista', async () => {
    const user = userEvent.setup();
    let listed = [CONTRACT];
    const remove: RouteHandler = () => {
      listed = [];
      return new Response(null, { status: 204 });
    };
    const fetchMock = mockApi({
      [`GET ${BASE}`]: () => page(listed),
      [`DELETE ${BASE}/att-1`]: remove,
    });
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Eliminar contrato.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar adjunto' });
    expect(within(dialog).getByText(/«contrato\.pdf» dejará de estar disponible/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Este cliente no tiene adjuntos')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(callsTo(fetchMock, 'DELETE', `${BASE}/att-1`)).toHaveLength(1);
  });

  it('si la eliminación falla, el diálogo sigue abierto con el error', async () => {
    const user = userEvent.setup();
    mockApi({
      [`GET ${BASE}`]: () => page([CONTRACT]),
      [`DELETE ${BASE}/att-1`]: () => errorResponse(403, 'PERMISSION_DENIED'),
    });
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Eliminar contrato.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar adjunto' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });

  it('sube una sola vez los archivos iniciales que entrega takeInitialFiles (alta, D-02.15)', async () => {
    mockApi({ [`GET ${BASE}`]: () => page([]) });
    const uploads = mockUpload(() => ({ status: 201, body: CONTRACT }));
    const pending = [file('contrato.pdf', 'application/pdf')];
    const takeInitialFiles = vi.fn(() => pending.splice(0));

    renderSection({ takeInitialFiles });

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]?.path).toBe(BASE);
    expect(await screen.findByText('Se subió «contrato.pdf».')).toBeInTheDocument();
  });

  it('avisa al dueño con onChanged tras subir y tras eliminar, y no si falla (opción aditiva)', async () => {
    const user = userEvent.setup();
    let listed: AttachmentDto[] = [CONTRACT];
    mockApi({
      [`GET ${BASE}`]: () => page(listed),
      [`DELETE ${BASE}/att-1`]: () => {
        listed = [];
        return new Response(null, { status: 204 });
      },
    });
    mockUpload((request) => (request.path === BASE ? { status: 201, body: { ...CONTRACT, id: 'att-2', fileName: 'plano.png' } } : { status: 500 }));
    const onChanged = vi.fn();
    renderSection({ onChanged });

    await screen.findByText('contrato.pdf');
    await user.upload(fileInput(), file('demasiado.pdf', 'application/pdf', 11 * 1024 * 1024));
    expect(await screen.findByText(/demasiado\.pdf/)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();

    await user.upload(fileInput(), file('plano.png', 'image/png'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Eliminar contrato.pdf' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar adjunto' })).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  });
});
