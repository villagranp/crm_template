import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import { httpClient } from '@/services/api';
import { deferred, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ADVISOR_PERMISSIONS, lastQuery, MANAGER_PERMISSIONS, signInWith, signOut, xlsxResponse } from '../testing/report-fixtures';

import { ExportButton, ExportFeedback } from './ExportButton';
import { useReportExport } from './use-report-export';

const EXPORT_QUERY = { countryId: 'gt', sortBy: 'updatedAt', sortOrder: 'desc', format: 'xlsx' };

function Harness() {
  const exporter = useReportExport({
    request: () => httpClient.download('/reports/projects/export', { query: EXPORT_QUERY }),
    fallbackFileName: 'reporte-proyectos.xlsx',
  });
  return (
    <>
      <ExportButton exporter={exporter} />
      <ExportFeedback exporter={exporter} />
    </>
  );
}

vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

afterEach(() => {
  signOut();
  vi.mocked(saveFile).mockClear();
});

describe('ExportButton (05 F-39, PF-05.35)', () => {
  it('no se muestra sin reportes.exportar (AC-05.28)', () => {
    signInWith(ADVISOR_PERMISSIONS);
    renderWithProviders(<Harness />);

    expect(screen.queryByRole('button', { name: 'Exportar a Excel' })).not.toBeInTheDocument();
  });

  it('descarga el .xlsx con los filtros y el orden de la pantalla, muestra progreso y las filas exportadas', async () => {
    signInWith(MANAGER_PERMISSIONS);
    const reply = deferred<Response>();
    const fetchMock = mockApi({ 'GET /reports/projects/export': () => reply.promise });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    expect(await screen.findByRole('button', { name: 'Generando archivo…' })).toBeDisabled();

    reply.resolve(xlsxResponse('reporte-proyectos-20261014-0830.xlsx', 1234));
    expect(await screen.findByText('Se descargó reporte-proyectos-20261014-0830.xlsx con 1,234 filas.')).toBeInTheDocument();
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }), 'reporte-proyectos-20261014-0830.xlsx');
    expect(Object.fromEntries(lastQuery(fetchMock, '/reports/projects/export'))).toEqual(EXPORT_QUERY);
    expect(screen.getByRole('button', { name: 'Exportar a Excel' })).toBeEnabled();
  });

  it('422 EXPORT_TOO_LARGE: explica N y M y no descarga nada (AC-05.26)', async () => {
    signInWith(MANAGER_PERMISSIONS);
    mockApi({ 'GET /reports/projects/export': () => errorResponse(422, 'EXPORT_TOO_LARGE', [{ rows: 150000, maxRows: 100000 }]) });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo exportar. El resultado tiene 150,000 filas y el máximo exportable es 100,000. Acota los filtros. Referencia: corr-test',
    );
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('429: indica cuánto esperar según Retry-After', async () => {
    signInWith(MANAGER_PERMISSIONS);
    mockApi({
      'GET /reports/projects/export': () =>
        new Response(JSON.stringify({ statusCode: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'x', details: [], correlationId: 'corr-429' }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '42' },
        }),
    });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Vuelve a intentarlo en 42 segundos. Referencia: corr-429');
  });

  it('503 REPORT_TIMEOUT: pide acotar los filtros; el aviso se puede cerrar', async () => {
    signInWith(MANAGER_PERMISSIONS);
    mockApi({ 'GET /reports/projects/export': () => errorResponse(503, 'REPORT_TIMEOUT') });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Acota los filtros/);

    await user.click(screen.getByRole('button', { name: /close|cerrar/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('sin X-Export-Rows informa solo el archivo', async () => {
    signInWith(MANAGER_PERMISSIONS);
    mockApi({
      'GET /reports/projects/export': () => new Response('xlsx', { status: 200, headers: { 'content-disposition': 'attachment; filename="r.xlsx"' } }),
      'GET /x': () => jsonResponse({}),
    });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Exportar a Excel' }));
    expect(await screen.findByText('Se descargó r.xlsx.')).toBeInTheDocument();
  });
});
