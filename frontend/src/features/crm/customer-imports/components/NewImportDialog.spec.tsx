import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deferred, mockUpload, type UploadReply } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { SETTINGS, signInWith, signOut, simulateWideScreen, testFile, VALIDATED_IMPORT } from '../testing/customer-import-fixtures';
import { NewImportDialog } from './NewImportDialog';

const MB = 1024 * 1024;

function renderDialog(overrides: Partial<Parameters<typeof NewImportDialog>[0]> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <NewImportDialog open settings={SETTINGS} canDownloadTemplate onClose={onClose} onCreated={onCreated} {...overrides} />,
  );
  return { onCreated, onClose };
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Archivo de clientes');
}

async function chooseAndSubmit(name = 'clientes.csv', size = 64) {
  await userEvent.upload(fileInput(), testFile(name, size));
  await userEvent.click(screen.getByRole('button', { name: 'Subir y validar' }));
}

function errorBody(statusCode: number, code: string, details: unknown[] = []) {
  return { statusCode, code, message: 'backend message', details, correlationId: 'corr-up' };
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['importaciones.ver', 'importaciones.crear', 'clientes.crear']);
});

afterEach(signOut);

describe('NewImportDialog (06 §E.3, PF-06.46)', () => {
  it('muestra la ayuda con formatos, límites de settings y la nota de UTF-8', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Nueva carga de clientes' });
    expect(dialog).toHaveTextContent('Formatos admitidos: CSV o Excel (.xlsx). Tamaño máximo: 10 MB. Máximo 5,000 filas por archivo.');
    expect(dialog).toHaveTextContent('guarde el CSV como UTF-8');
    expect(within(dialog).getByRole('button', { name: /Descargar plantilla/ })).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('accept', '.csv,.xlsx');
    expect(screen.getByRole('button', { name: 'Subir y validar' })).toBeDisabled();
  });

  it('avisa de una extensión no admitida sin subir nada (AC-06.3)', async () => {
    const uploads = mockUpload(() => ({ status: 201, body: VALIDATED_IMPORT }));
    renderDialog();

    // Sin `applyAccept`: el navegador deja elegir cualquier archivo con "Todos los archivos".
    await userEvent.setup({ applyAccept: false }).upload(fileInput(), testFile('clientes.xls'));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo debe ser CSV o Excel (.xlsx)');
    expect(screen.getByRole('button', { name: 'Subir y validar' })).toBeDisabled();
    expect(uploads).toHaveLength(0);
  });

  it('acepta un archivo soltado en la zona y rechaza soltar varios', async () => {
    renderDialog();
    const zone = screen.getByText('Arrastre aquí el archivo o');

    fireEvent.drop(zone, { dataTransfer: { files: [testFile('a.csv'), testFile('b.csv')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Seleccione un solo archivo.');

    fireEvent.drop(zone, { dataTransfer: { files: [testFile('clientes.csv')] } });
    expect(await screen.findByText(/Archivo elegido: clientes\.csv/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir y validar' })).toBeEnabled();
  });

  it('avisa de un archivo mayor que el límite sin subirlo (AC-06.3)', async () => {
    const uploads = mockUpload(() => ({ status: 201, body: VALIDATED_IMPORT }));
    renderDialog();

    await userEvent.upload(fileInput(), testFile('clientes.xlsx', 11 * MB));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera el tamaño máximo de 10 MB.');
    expect(uploads).toHaveLength(0);
  });

  it('sube un archivo válido con progreso y, con 201, entrega la carga creada (AC-06.3)', async () => {
    const hold = deferred<void>();
    const uploads = mockUpload(() => ({ status: 201, body: VALIDATED_IMPORT, progress: [[32, 64]], hold: hold.promise }));
    const { onCreated } = renderDialog();

    await chooseAndSubmit();

    expect(await screen.findByText('Subiendo el archivo (50 %)…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso de la subida' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar subida' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();

    hold.resolve();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(VALIDATED_IMPORT));
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path).toBe('/customer-imports');
    const body = uploads[0]?.body as FormData;
    expect((body.get('file') as File).name).toBe('clientes.csv');
  });

  it('al llegar al 100 % indica que el servidor está validando', async () => {
    const hold = deferred<void>();
    mockUpload(() => ({ status: 201, body: VALIDATED_IMPORT, progress: [[64, 64]], hold: hold.promise }));
    renderDialog();

    await chooseAndSubmit();

    expect(await screen.findByText(/Validando el archivo/)).toBeInTheDocument();
    hold.resolve();
  });

  it('"Cancelar subida" aborta la petición y vuelve al archivo elegido sin error', async () => {
    const hold = deferred<void>();
    mockUpload(() => ({ status: 201, body: VALIDATED_IMPORT, progress: [[10, 64]], hold: hold.promise }));
    const { onCreated } = renderDialog();

    await chooseAndSubmit();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar subida' }));

    expect(await screen.findByRole('button', { name: 'Subir y validar' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    hold.resolve();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('lista en el diálogo los problemas de estructura de un 422 y permite elegir otro archivo (PF-06.46)', async () => {
    mockUpload(() => ({
      status: 422,
      body: errorBody(422, 'INVALID_IMPORT_FILE', [
        { field: 'columns', issue: 'MISSING_COLUMN', column: 'Razón social' },
        { field: 'columns', issue: 'UNKNOWN_COLUMN', column: 'Observaciones' },
        { field: 'file', issue: 'INVALID_ENCODING' },
      ]),
    }));
    renderDialog();

    await chooseAndSubmit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El archivo no tiene la estructura de la plantilla.');
    expect(alert).toHaveTextContent('Referencia: corr-up');
    const problems = within(alert).getByRole('list', { name: 'Problemas del archivo' });
    expect(within(problems).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Falta la columna obligatoria «Razón social».',
      'La columna «Observaciones» no pertenece a la plantilla.',
      expect.stringContaining('guarde el CSV como UTF-8'),
    ]);
    expect(alert).not.toHaveTextContent('backend message');
    expect(within(alert).getByRole('button', { name: 'Elegir otro archivo' })).toBeInTheDocument();
  });

  it.each<[string, UploadReply, RegExp]>([
    ['409 IMPORTS_DISABLED', { status: 409, body: errorBody(409, 'IMPORTS_DISABLED') }, /La carga masiva no está habilitada en este entorno/],
    ['409 IMPORT_IN_PROGRESS', { status: 409, body: errorBody(409, 'IMPORT_IN_PROGRESS') }, /Ya tiene una carga validándose o importándose/],
    ['413 sin cuerpo (NGINX)', { status: 413 }, /El archivo supera el tamaño máximo de 10 MB/],
    ['413 FILE_TOO_LARGE', { status: 413, body: errorBody(413, 'FILE_TOO_LARGE') }, /El archivo supera el tamaño máximo de 10 MB/],
    ['415 UNSUPPORTED_FILE_TYPE', { status: 415, body: errorBody(415, 'UNSUPPORTED_FILE_TYPE') }, /Solo se admiten archivos CSV \(UTF-8\) o Excel/],
  ])('muestra un mensaje específico para %s (PF-06.46)', async (_label, reply, message) => {
    mockUpload(() => reply);
    const { onCreated } = renderDialog();

    await chooseAndSubmit('clientes.xlsx');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Subir y validar' })).toBeEnabled();
  });

  it('sin permiso de plantilla no ofrece descargarla', () => {
    renderDialog({ canDownloadTemplate: false });
    expect(screen.queryByRole('button', { name: /Descargar plantilla/ })).not.toBeInTheDocument();
  });
});
