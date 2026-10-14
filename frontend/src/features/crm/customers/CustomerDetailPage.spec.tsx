import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, mockUpload, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { Customer } from './customers.api';
import { CustomerDetailPage } from './CustomerDetailPage';
import { stashPendingUploads } from './pending-uploads';
import { bodyOf, contact, CUSTOMER, FORM_OPTIONS, menu, page, signInWith, signOut, simulateWideScreen } from './testing/customer-fixtures';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage(state?: unknown) {
  return renderWithProviders(
    <Routes>
      <Route path="/clientes/:customerId" element={<CustomerDetailPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [state ? ({ pathname: '/clientes/c-1', state } as unknown as string) : '/clientes/c-1'] },
  );
}

function detailApi(customer: Customer | (() => Response), extra: Record<string, RouteHandler> = {}, menuKeys: string[] = ['clientes-buscar']): Mock {
  return mockApi({
    'GET /customers/c-1': typeof customer === 'function' ? customer : () => jsonResponse(customer),
    'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /me/menu': () => jsonResponse(menu(menuKeys)),
    'GET /customers/c-1/contacts': () => page([contact()]),
    'GET /customers/c-1/attachments': () => page([]),
    ...extra,
  });
}

function file(name: string, type: string, sizeBytes = 1024): File {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: sizeBytes });
  return result;
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['clientes.ver', 'clientes.editar', 'contactos.ver', 'contactos.crear', 'contactos.editar']);
});

afterEach(signOut);

describe('CustomerDetailPage (F-07)', () => {
  it('ante 404 muestra "no existe o no tienes acceso" y vuelve a la búsqueda (AC-02.27, AC-02.35)', async () => {
    detailApi(() => errorResponse(404, 'RESOURCE_NOT_FOUND'));

    renderPage();
    expect(await screen.findByText('Este cliente no existe o no tienes acceso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la búsqueda' }));
    expect(await screen.findByText('En /clientes')).toBeInTheDocument();
  });

  it('muestra los datos con la etiqueta fiscal del país y las acciones según capabilities (AC-02.26, AC-02.32)', async () => {
    detailApi({ ...CUSTOMER, country: { ...CUSTOMER.country, taxIdLabel: 'RTN' } });

    renderPage();
    expect(await screen.findByRole('heading', { name: /Constructora Peña S.A./ })).toBeInTheDocument();
    expect(screen.getByText('RTN')).toBeInTheDocument();
    expect(screen.getByText('1234567K')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
  });

  it('muestra el aviso de alta y el de acceso heredado de solo lectura', async () => {
    detailApi({ ...CUSTOMER, access: 'INHERITED', capabilities: { ...CUSTOMER.capabilities, canEdit: false, canManageContacts: false, canManageAttachments: false, editableFields: [] } });

    renderPage({ createdMessage: 'Cliente CLI-000001 creado.' });
    expect(await screen.findByText('Cliente CLI-000001 creado.')).toBeInTheDocument();
    expect(screen.getByText(/participas en un proyecto de este cliente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('sin contactos.ver ni proyectos.ver esas secciones no aparecen y el resto funciona (AC-02.39, AC-02.45)', async () => {
    signInWith(['clientes.ver']);
    const fetchMock = detailApi(CUSTOMER);

    renderPage();
    expect(await screen.findByRole('heading', { name: 'Adjuntos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Contactos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Proyectos' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/customers/c-1/contacts')).toHaveLength(0);
  });

  it('con proyectos.ver y sin el módulo en el menú muestra "disponible próximamente" sin llamar a /projects (AC-02.38)', async () => {
    signInWith(['clientes.ver', 'proyectos.ver']);
    const fetchMock = detailApi(CUSTOMER);

    renderPage();
    expect(await screen.findByText('Disponible próximamente')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/projects'))).toBe(false);
  });

  it('"Nueva actividad" aparece con el módulo disponible y actividades.crear, y lleva el cliente preseleccionado (AC-02.49)', async () => {
    signInWith(['clientes.ver', 'actividades.crear']);
    detailApi(CUSTOMER, {}, ['clientes-buscar', 'actividad-actividades']);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva actividad' }));
    expect(await screen.findByText('En /actividad/actividades/nueva?customerId=c-1')).toBeInTheDocument();
  });

  it('con Actividad comercial disponible muestra su sección y "Planificar visita" con el cliente preseleccionado (04 §E.11)', async () => {
    signInWith(['clientes.ver', 'actividades.ver', 'visitas.crear']);
    const fetchMock = detailApi(
      CUSTOMER,
      { 'GET /follow-ups/trace': () => errorResponse(404, 'RESOURCE_NOT_FOUND') },
      ['clientes-buscar', 'actividad-actividades'],
    );

    renderPage();
    expect(await screen.findByText('Aún no hay actividad comercial registrada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva actividad' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/follow-ups/trace?customerId=c-1')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Planificar visita' }));
    expect(await screen.findByText('En /actividad/visitas/nueva?customerId=c-1')).toBeInTheDocument();
  });

  it('sin el módulo de Actividad comercial en el menú no hay sección ni botones aunque haya permisos', async () => {
    signInWith(['clientes.ver', 'actividades.ver', 'actividades.crear', 'visitas.crear']);
    const fetchMock = detailApi(CUSTOMER);

    renderPage();
    expect(await screen.findByRole('heading', { name: 'Adjuntos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Actividad comercial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planificar visita' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/follow-ups'))).toBe(false);
  });

  it('un error en contactos no rompe la ficha y se puede reintentar (AC-02.35)', async () => {
    let calls = 0;
    detailApi(CUSTOMER, {
      'GET /customers/c-1/contacts': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([contact()]);
      },
    });

    renderPage();
    const contacts = await screen.findByRole('region', { name: 'Contactos' });
    expect(await within(contacts).findByText('No se pudo cargar la lista')).toBeInTheDocument();
    expect(screen.getByText('Constructora Peña S.A.', { selector: 'dd' })).toBeInTheDocument();
    await userEvent.click(within(contacts).getByRole('button', { name: 'Reintentar' }));
    expect(await within(contacts).findByText('Ana López')).toBeInTheDocument();
  });

  it('eliminar con dependencias muestra los conteos y sugiere desactivar (AC-02.32)', async () => {
    signInWith(['clientes.ver', 'clientes.eliminar']);
    detailApi(
      { ...CUSTOMER, capabilities: { ...CUSTOMER.capabilities, canDelete: true } },
      {
        'DELETE /customers/c-1': () =>
          errorResponse(409, 'CUSTOMER_HAS_DEPENDENCIES', [
            { dependency: 'projects', count: 2 },
            { dependency: 'pendingVisits', count: 1 },
          ]),
      },
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar cliente' });
    expect(within(dialog).getByText(/eliminación es lógica/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialog).findByText(/2 proyectos, 1 visita pendiente\. Puedes desactivarlo/)).toBeInTheDocument();
  });

  it('eliminar sin dependencias vuelve a la búsqueda (AC-02.31)', async () => {
    signInWith(['clientes.ver', 'clientes.eliminar']);
    detailApi({ ...CUSTOMER, capabilities: { ...CUSTOMER.capabilities, canDelete: true } }, { 'DELETE /customers/c-1': () => new Response(null, { status: 204 }) });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('En /clientes')).toBeInTheDocument();
  });

  it('un cliente eliminado se restaura con canRestore (AC-02.33)', async () => {
    signInWith(['clientes.ver', 'clientes.eliminar']);
    const deleted = { ...CUSTOMER, isDeleted: true, deletedAt: '2026-10-02T10:00:00.000Z', capabilities: { ...CUSTOMER.capabilities, canEdit: false, canRestore: true } };
    const fetchMock = detailApi(deleted, { 'POST /customers/c-1/restore': () => jsonResponse(CUSTOMER) });

    renderPage();
    expect(await screen.findByText(/Este cliente está eliminado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(await screen.findByText('Cliente CLI-000001 restaurado.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/customers/c-1/restore')).toHaveLength(1);
  });

  it('la edición deshabilita los campos fuera de editableFields y envía sólo lo cambiado (AC-02.29, AC-02.52)', async () => {
    const fetchMock = detailApi(CUSTOMER, { 'PATCH /customers/c-1': () => jsonResponse({ ...CUSTOMER, address: 'Zona 14' }) });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const drawer = await screen.findByRole('form', { name: 'Editar cliente' });
    expect(within(drawer).getByLabelText(/Código de cliente/)).toBeDisabled();
    expect(within(drawer).getAllByText('Solo quien puede administrar clientes cambia este campo.').length).toBeGreaterThanOrEqual(1);

    const address = within(drawer).getByLabelText('Dirección');
    await userEvent.clear(address);
    await userEvent.type(address, 'Zona 14');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Cliente CLI-000001 actualizado.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/customers/c-1')[0])).toEqual({ address: 'Zona 14' });
  });

  it('al cambiar el NIT a uno repetido confirma el aviso y reenvía con acknowledgedDuplicateIds (AC-02.52)', async () => {
    let patches = 0;
    const fetchMock = detailApi(CUSTOMER, {
      'PATCH /customers/c-1': () => {
        patches += 1;
        return patches > 1
          ? jsonResponse({ ...CUSTOMER, taxId: '7654321' })
          : errorResponse(409, 'POSSIBLE_DUPLICATE', [
              {
                rule: 'nit',
                reason: 'TAX_ID',
                candidate: { id: 'c-2', crmCode: 'CLI-000002', customerCode: 'EST-02', legalName: 'Peña Sucursal', country: { isoCode: 'GT', name: 'Guatemala' }, salesOwnerName: 'Ana', isVisible: true, isDeleted: false },
              },
            ]);
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const drawer = await screen.findByRole('form', { name: 'Editar cliente' });
    const taxId = within(drawer).getByLabelText('NIT');
    await userEvent.clear(taxId);
    await userEvent.type(taxId, '7654321');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Guardar cambios' }));

    const dialog = await screen.findByRole('dialog', { name: 'Posible cliente duplicado' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar de todos modos' }));

    expect(await screen.findByText('Cliente CLI-000001 actualizado.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/customers/c-1')[1])).toEqual({ taxId: '7654321', acknowledgedDuplicateIds: ['c-2'] });
  });

  it('sube en la ficha los archivos elegidos en el alta; un 413 se muestra sin deshacer el cliente (AC-02.24)', async () => {
    detailApi(CUSTOMER);
    const uploads = mockUpload((request) =>
      (request.body as FormData).get('file') instanceof File && ((request.body as FormData).get('file') as File).name === 'grande.pdf'
        ? { status: 413 }
        : {
            status: 201,
            body: { id: 'att-1', fileName: 'contrato.pdf', contentType: 'application/pdf', sizeBytes: 10, description: null, createdAt: '2026-10-01T00:00:00Z', createdBy: null },
          },
    );
    stashPendingUploads('c-1', [file('contrato.pdf', 'application/pdf'), file('grande.pdf', 'application/pdf')]);

    renderPage();
    expect(await screen.findByText(/grande\.pdf/)).toBeInTheDocument();
    expect(await screen.findByText(/supera el tamaño máximo permitido/)).toBeInTheDocument();
    await waitFor(() => expect(uploads).toHaveLength(2));
    expect(uploads.every((upload) => upload.path === '/customers/c-1/attachments')).toBe(true);
    expect(screen.getByRole('heading', { name: /Constructora Peña S.A./ })).toBeInTheDocument();
  });
});
