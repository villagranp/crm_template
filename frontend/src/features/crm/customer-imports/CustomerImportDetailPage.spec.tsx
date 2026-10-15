import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from '@/lib/save-file';
import { errorResponse, jsonResponse } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { CustomerImport, CustomerImportRow } from './customer-imports.api';
import { CustomerImportDetailPage } from './CustomerImportDetailPage';
import {
  ALL_IMPORT_PERMISSIONS,
  DISABLED_SETTINGS,
  DUPLICATE_EXISTING_ROW,
  IMPORT_ID,
  IMPORTED_ROW,
  importWith,
  INVALID_ROW,
  mockImportApi,
  page,
  PURGED_ROW,
  SETTINGS,
  signInWith,
  signOut,
  simulateWideScreen,
  urlsTo,
  VALID_ROW,
  VALIDATED_IMPORT,
  type UrlRouteHandler,
} from './testing/customer-import-fixtures';

// jsdom no implementa `URL.createObjectURL`: se sustituye la entrega al navegador.
vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const DETAIL = `/customer-imports/${IMPORT_ID}`;
const ROWS = `${DETAIL}/rows`;

interface ApiOptions {
  detail?: UrlRouteHandler;
  rows?: CustomerImportRow[];
  /** Filas válidas con advertencias (consulta de recuento del diálogo de confirmación). */
  validWithWarnings?: number;
  settings?: typeof SETTINGS;
  extra?: Record<string, UrlRouteHandler>;
}

function api({ detail, rows = [VALID_ROW, INVALID_ROW, DUPLICATE_EXISTING_ROW], validWithWarnings = 2, settings = SETTINGS, extra = {} }: ApiOptions = {}) {
  return mockImportApi({
    'GET /customer-imports/settings': () => jsonResponse(settings),
    [`GET ${DETAIL}`]: detail ?? (() => jsonResponse(VALIDATED_IMPORT)),
    [`GET ${ROWS}`]: (url) =>
      url.searchParams.get('pageSize') === '1' && url.searchParams.get('hasWarnings') === 'true'
        ? page([VALID_ROW], validWithWarnings)
        : page(rows),
    ...extra,
  });
}

function detailOf(data: CustomerImport): UrlRouteHandler {
  return () => jsonResponse(data);
}

function renderPage(search = '') {
  return renderWithProviders(
    <Routes>
      <Route path="/integraciones/clientes/:importId" element={<CustomerImportDetailPage />} />
      <Route path="/integraciones/clientes" element={<p>Historial</p>} />
      <Route path="/clientes/:customerId" element={<p>Ficha del cliente abierta</p>} />
    </Routes>,
    { initialEntries: [`/integraciones/clientes/${IMPORT_ID}${search}`] },
  );
}

async function findRowsTable() {
  return screen.findByRole('table', { name: 'Filas de la carga' });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ALL_IMPORT_PERMISSIONS);
});

afterEach(signOut);

describe('CustomerImportDetailPage: vista previa VALIDATED (AC-06.13, AC-06.14)', () => {
  it('muestra cabecera, pasos, resumen y filas con la fila del archivo', async () => {
    api();
    renderPage();

    expect(await screen.findByRole('heading', { name: /IMP-2026-0007/ })).toHaveTextContent('Detalle de carga');
    expect(screen.getByText('Vista previa lista')).toBeInTheDocument();
    const summary = screen.getByLabelText('Resumen de la carga');
    expect(within(summary).getByText('Total de filas').nextElementSibling).toHaveTextContent('10');
    expect(within(summary).getByText('Válidas').nextElementSibling).toHaveTextContent('7');
    expect(within(summary).getByText('Con errores').nextElementSibling).toHaveTextContent('3');
    expect(within(summary).queryByText('Importadas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pasos de la carga')).toHaveTextContent('Confirmación');

    const table = await findRowsTable();
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2');
    expect(rows[1]).toHaveTextContent('Constructora Ficticia S.A.');
    expect(rows[1]).toHaveTextContent('Válida');
    expect(rows[1]).toHaveTextContent('Sin incidencias');
    expect(rows[2]).toHaveTextContent('7');
    expect(rows[2]).toHaveTextContent('Con errores');
  });

  it('lista todas las incidencias de una fila con su campo, distinguiendo advertencias de errores (AC-06.14)', async () => {
    api();
    renderPage();
    const table = await findRowsTable();

    const toggle = within(table).getByRole('button', { name: /Ver incidencias de la fila 7: 1 error · 1 advertencia/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    const items = within(list as HTMLElement).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Error · País: El país no existe o no está activo.',
      'Advertencia · NIT: Ya existe un cliente del mismo país con este NIT; puede tratarse de otro establecimiento del mismo cliente.',
    ]);
  });

  it('enlaza el cliente existente de un duplicado a su ficha', async () => {
    api();
    renderPage();
    const table = await findRowsTable();
    await userEvent.click(within(table).getByRole('link', { name: 'CLI-000009' }));
    expect(await screen.findByText('Ficha del cliente abierta')).toBeInTheDocument();
  });

  it('sin clientes.ver muestra el código del cliente sin enlace', async () => {
    signInWith(['importaciones.ver', 'importaciones.crear', 'clientes.crear']);
    api({ rows: [IMPORTED_ROW] });
    renderPage();
    const table = await findRowsTable();
    expect(within(table).getByText('CLI-000020')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'CLI-000020' })).not.toBeInTheDocument();
  });

  it('el filtro de filas consulta por estado o por advertencias y vive en la URL', async () => {
    const fetchMock = api();
    renderPage();
    await findRowsTable();

    await userEvent.click(screen.getByRole('button', { name: 'Con advertencias' }));
    await waitFor(() => expect(urlsTo(fetchMock, 'GET', ROWS).at(-1)?.searchParams.get('hasWarnings')).toBe('true'));

    await userEvent.click(screen.getByRole('button', { name: 'Duplicadas existentes' }));
    await waitFor(() => expect(urlsTo(fetchMock, 'GET', ROWS).at(-1)?.searchParams.get('status')).toBe('DUPLICATE_EXISTING'));
    expect(screen.getByRole('button', { name: 'Duplicadas existentes' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('restaura la vista de filas desde la URL', async () => {
    const fetchMock = api();
    renderPage('?rows.view=IMPORTED');
    await findRowsTable();
    expect(urlsTo(fetchMock, 'GET', ROWS).at(-1)?.searchParams.get('status')).toBe('IMPORTED');
    expect(screen.getByRole('button', { name: 'Importadas' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('CustomerImportDetailPage: confirmación (AC-06.15, PF-06.47)', () => {
  it('resume lo que se importará y, sin la casilla, confirma sin las filas con advertencias', async () => {
    const fetchMock = api({
      extra: { [`POST ${DETAIL}/confirmation`]: () => jsonResponse(importWith({ status: 'IMPORTING', confirmedAt: '2026-10-05T15:10:00.000Z', canConfirm: false, canCancel: false }), 202) },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar la importación de IMP-2026-0007' });
    expect(await within(dialog).findByText('Se importarán 5 clientes. 5 filas no se importarán.')).toBeInTheDocument();
    const checkbox = within(dialog).getByRole('checkbox', { name: 'Importar también las 2 filas con advertencias' });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar importación' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [request] = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/confirmation') && (init as RequestInit).method === 'POST');
    expect(JSON.parse(String((request?.[1] as RequestInit).body))).toEqual({ expectedValidRows: 7, includeRowsWithWarnings: false });
    expect(await screen.findByText('Importando clientes')).toBeInTheDocument();
  });

  it('la casilla de advertencias cambia el resumen y envía includeRowsWithWarnings = true', async () => {
    const fetchMock = api({
      extra: { [`POST ${DETAIL}/confirmation`]: () => jsonResponse(importWith({ status: 'IMPORTING', canConfirm: false, canCancel: false }), 202) },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Importar también las 2 filas con advertencias/ }));
    expect(within(dialog).getByText('Se importarán 7 clientes. 3 filas no se importarán.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar importación' }));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/confirmation'));
      expect(JSON.parse(String((request?.[1] as RequestInit).body))).toEqual({ expectedValidRows: 7, includeRowsWithWarnings: true });
    });
  });

  it('sin filas válidas con advertencias no muestra la casilla', async () => {
    api({ validWithWarnings: 0 });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Se importarán 7 clientes. 3 filas no se importarán.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('un 409 IMPORT_CHANGED se explica en el diálogo y recarga el detalle', async () => {
    let detailCalls = 0;
    const fetchMock = api({
      detail: () => {
        detailCalls += 1;
        return jsonResponse(VALIDATED_IMPORT);
      },
      extra: { [`POST ${DETAIL}/confirmation`]: () => errorResponse(409, 'IMPORT_CHANGED') },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Se importarán/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar importación' }));

    expect(await within(dialog).findByText(/La carga cambió desde que se mostró/)).toBeInTheDocument();
    await waitFor(() => expect(detailCalls).toBeGreaterThanOrEqual(2));
    expect(urlsTo(fetchMock, 'POST', `${DETAIL}/confirmation`)).toHaveLength(1);
  });

  it('sin filas válidas avisa y deja "Confirmar importación" deshabilitado', async () => {
    api({ detail: detailOf(importWith({ validRows: 0, invalidRows: 10, canConfirm: false, canCancel: true })) });
    renderPage();
    expect(await screen.findByText('No hay filas válidas para importar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar carga' })).toBeEnabled();
  });

  it('cancelar pide confirmación y deja la carga cancelada', async () => {
    const fetchMock = api({
      extra: { [`POST ${DETAIL}/cancellation`]: () => jsonResponse(importWith({ status: 'CANCELLED', canConfirm: false, canCancel: false })) },
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar carga' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la carga IMP-2026-0007?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar carga' }));

    expect(await screen.findByText('Carga cancelada')).toBeInTheDocument();
    expect(urlsTo(fetchMock, 'POST', `${DETAIL}/cancellation`)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
  });

  it('sin importaciones.crear oculta confirmar y cancelar aunque la carga lo permita (PF-06.47)', async () => {
    signInWith(['importaciones.ver', 'clientes.ver']);
    api();
    renderPage();
    await findRowsTable();
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar carga' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar archivo de errores' })).toBeInTheDocument();
  });

  it('con la carga deshabilitada en el entorno avisa y no ofrece confirmar (AC-06.25)', async () => {
    api({ settings: DISABLED_SETTINGS, detail: detailOf(importWith({ canConfirm: false, canCancel: false })) });
    renderPage();
    expect(await screen.findByText(/La carga masiva no está habilitada en este entorno/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar carga' })).not.toBeInTheDocument();
  });
});

describe('CustomerImportDetailPage: estados (PF-06.47)', () => {
  it('IMPORTING muestra y anuncia el progreso, sin acciones, y consulta hasta el estado final', async () => {
    let calls = 0;
    api({
      detail: () => {
        calls += 1;
        return jsonResponse(
          calls === 1
            ? importWith({ status: 'IMPORTING', importedRows: 3, rejectedRows: 1, confirmedAt: '2026-10-05T15:10:00.000Z', canConfirm: false, canCancel: false, hasErrorFile: false })
            : importWith({ status: 'COMPLETED', importedRows: 7, confirmedAt: '2026-10-05T15:10:00.000Z', completedAt: '2026-10-05T15:11:00.000Z', canConfirm: false, canCancel: false, hasErrorFile: false }),
        );
      },
    });
    renderPage();

    const notice = await screen.findByText('Importando clientes');
    const region = notice.closest('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent('4 de 7 filas procesadas (3 importadas, 1 rechazadas).');
    expect(screen.getByRole('progressbar', { name: 'Progreso de la importación' })).toHaveAttribute('aria-valuenow', '57');
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();

    expect(await screen.findByText('Importación completada')).toBeInTheDocument();
    expect(screen.getByText('Se crearon 7 clientes.')).toBeInTheDocument();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('COMPLETED_WITH_ERRORS resume, da acceso a las rechazadas y descarga el archivo de errores', async () => {
    const fetchMock = api({
      detail: detailOf(
        importWith({ status: 'COMPLETED_WITH_ERRORS', importedRows: 5, rejectedRows: 2, confirmedAt: '2026-10-05T15:10:00.000Z', canConfirm: false, canCancel: false }),
      ),
      extra: {
        [`GET ${DETAIL}/error-file`]: () =>
          new Response('fila;error', { status: 200, headers: { 'content-disposition': 'attachment; filename="errores-IMP-2026-0007.xlsx"' } }),
      },
    });
    renderPage();

    expect(await screen.findByText('Importación completada con errores')).toBeInTheDocument();
    expect(screen.getByText(/Se crearon 5 clientes; 5 filas no se importaron\. 2 filas se rechazaron al confirmar\./)).toBeInTheDocument();
    const summary = screen.getByLabelText('Resumen de la carga');
    expect(within(summary).getByText('Rechazadas al confirmar').nextElementSibling).toHaveTextContent('2');

    await userEvent.click(screen.getByRole('button', { name: 'Ver rechazadas' }));
    await waitFor(() => expect(urlsTo(fetchMock, 'GET', ROWS).at(-1)?.searchParams.get('status')).toBe('REJECTED'));

    await userEvent.click(screen.getByRole('button', { name: 'Descargar archivo de errores' }));
    // `expect.anything()` y no `expect.any(Blob)`: la respuesta trae el `Blob` nativo de Node y el
    // global de jsdom es otra clase (mismo criterio que AttachmentsSection.spec.tsx).
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.anything(), 'errores-IMP-2026-0007.xlsx'));
    const [blob] = vi.mocked(saveFile).mock.calls[0] as [Blob, string];
    expect(blob.size).toBe('fila;error'.length);
  });

  it('FAILED por estructura lista los problemas', async () => {
    api({
      detail: detailOf(importWith({ status: 'FAILED', totalRows: 0, validRows: 0, invalidRows: 0, failureReason: 'MISSING_COLUMN: Razón social; NO_DATA_ROWS', canConfirm: false, canCancel: false, hasErrorFile: false })),
      rows: [],
    });
    renderPage();

    expect(await screen.findByText('El archivo no se pudo validar')).toBeInTheDocument();
    const reasons = screen.getByRole('list', { name: 'Motivo del fallo' });
    expect(within(reasons).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Falta la columna obligatoria «Razón social».',
      'El archivo no tiene filas de datos debajo de los encabezados.',
    ]);
    expect(screen.getByLabelText('Pasos de la carga')).toHaveTextContent('Archivo rechazado');
    expect(await screen.findByText('La carga no tiene filas')).toBeInTheDocument();
  });

  it('FAILED por interrupción dice cuántas se importaron', async () => {
    api({
      detail: detailOf(importWith({ status: 'FAILED', importedRows: 3, confirmedAt: '2026-10-05T15:10:00.000Z', failureReason: 'PROCESS_INTERRUPTED', canConfirm: false, canCancel: false })),
    });
    renderPage();
    expect(await screen.findByText('La importación se interrumpió')).toBeInTheDocument();
    expect(screen.getByText(/Se importaron 3 clientes antes del fallo\./)).toBeInTheDocument();
    expect(screen.getByText('La importación se interrumpió antes de terminar.')).toBeInTheDocument();
    await findRowsTable();
  });

  it('CANCELLED avisa y deja la vista previa de solo lectura', async () => {
    api({ detail: detailOf(importWith({ status: 'CANCELLED', canConfirm: false, canCancel: false })) });
    renderPage();
    expect(await screen.findByText('Carga cancelada')).toBeInTheDocument();
    await findRowsTable();
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar carga' })).not.toBeInTheDocument();
  });

  it('con datos purgados sustituye los valores y no ofrece el archivo de errores', async () => {
    api({ detail: detailOf(importWith({ status: 'COMPLETED_WITH_ERRORS', isPurged: true, hasErrorFile: true, canConfirm: false, canCancel: false })), rows: [PURGED_ROW] });
    renderPage();

    const table = await findRowsTable();
    expect(within(table).getByText('Datos eliminados por política de retención')).toBeInTheDocument();
    expect(within(table).getByText('Con errores')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /Ver incidencias de la fila 7/ })).toBeInTheDocument();
    expect(screen.getByText(/Datos eliminados por política de retención: los estados/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar archivo de errores' })).not.toBeInTheDocument();
  });

  it('una carga inexistente o no visible muestra "no encontrada"', async () => {
    api({ detail: () => errorResponse(404, 'RESOURCE_NOT_FOUND') });
    renderPage();
    expect(await screen.findByText('Esta carga no existe o no tiene acceso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver al historial' }));
    expect(await screen.findByText('Historial')).toBeInTheDocument();
  });

  it('un error distinto de 404 ofrece reintentar', async () => {
    api({ detail: () => errorResponse(500, 'INTERNAL_ERROR') });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
