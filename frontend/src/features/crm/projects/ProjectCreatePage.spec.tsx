import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { takePendingUploads } from './pending-uploads';
import { ProjectCreatePage } from './ProjectCreatePage';
import { bodyOf, FORM_OPTIONS, page, PROJECT, signInWith, signOut, simulateWideScreen, SV } from './testing/project-fixtures';

const CREATED = { ...PROJECT, id: 'p-new', code: 'PRY-2026-00100' };

/** `CustomerListItem` mínimo para el selector de cliente (Módulo 2). */
const CUSTOMER_ROW = {
  id: 'c-1',
  crmCode: 'CLI-000001',
  customerCode: null,
  legalName: 'Constructora Peña S.A.',
  tradeName: null,
  country: SV,
  city: null,
  status: { id: 'st', code: 'ACTIVO', label: 'Activo', isActive: true },
  rating: null,
  salesOwner: { id: 'u-1', displayName: 'Ana Asesora' },
  access: 'DIRECT',
  isDeleted: false,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function DetailProbe() {
  const location = useLocation();
  const state = location.state as { createdMessage?: string } | null;
  return <p>{`Ficha ${location.pathname}${location.search} · ${state?.createdMessage ?? ''}`}</p>;
}

function renderPage(entry = '/proyectos/nuevo') {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos/nuevo" element={<ProjectCreatePage />} />
      <Route path="/proyectos/:projectId" element={<DetailProbe />} />
      <Route path="/proyectos" element={<p>Búsqueda</p>} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /customers': () => page([CUSTOMER_ROW]),
    'POST /projects': () => jsonResponse(CREATED, 201),
    ...extra,
  });
}

async function chooseCustomer() {
  await userEvent.click(await screen.findByRole('combobox', { name: /Cliente/ }));
  await userEvent.click(await screen.findByRole('option', { name: /Constructora Peña/ }));
}

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['proyectos.ver', 'proyectos.crear', 'clientes.ver']);
});

afterEach(() => {
  signOut();
  takePendingUploads('p-new');
});

describe('ProjectCreatePage (F-10)', () => {
  it('si las opciones no cargan muestra el error con "Reintentar" y no deja guardar', async () => {
    let calls = 0;
    api({
      'GET /projects/form-options': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(FORM_OPTIONS);
      },
    });

    renderPage();
    expect(await screen.findByText('No se pudo cargar el formulario')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear proyecto' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument();
  });

  it('marca los obligatorios del contrato (incluidos los del parámetro) y valida antes de enviar (PF-03.6, AC-03.3)', async () => {
    const fetchMock = api({
      'GET /projects/form-options': () => jsonResponse({ ...FORM_OPTIONS, requiredFields: [...FORM_OPTIONS.requiredFields, 'city'] }),
    });

    renderPage();
    expect(await screen.findByLabelText(/Nombre del proyecto/)).toBeRequired();
    expect(screen.getByLabelText(/Ciudad o ubicación/)).toBeRequired();
    expect(screen.getByLabelText(/Dirección/)).not.toBeRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(4);
    expect(callsTo(fetchMock, 'POST', '/projects')).toHaveLength(0);
  });

  it('el fin estimado anterior al inicio se avisa en el cliente (AC-03.4)', async () => {
    api();
    renderPage();
    await userEvent.type(await screen.findByLabelText(/Inicio estimado/), '2026-11-01');
    await userEvent.type(screen.getByLabelText(/Fin estimado/), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findByText('No puede ser anterior al inicio estimado.')).toBeInTheDocument();
  });

  it('crea con el país del cliente por defecto, sin asesor ni código, y navega a la ficha con el aviso (AC-03.1)', async () => {
    const fetchMock = api();

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Nombre del proyecto/), 'Torre Norte');
    await chooseCustomer();
    expect(screen.getByRole('combobox', { name: /País/ })).toHaveTextContent('El Salvador');
    await userEvent.type(screen.getByLabelText(/Decisión estimada/), '2026-12-01');
    expect(screen.getByLabelText('Asesor responsable')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    expect(await screen.findByText('Ficha /proyectos/p-new · Proyecto PRY-2026-00100 creado.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects')[0])).toEqual({
      name: 'Torre Norte',
      customerId: 'c-1',
      countryId: SV.id,
      estimatedDecisionDate: '2026-12-01',
    });
  });

  it('con archivos en cola abre la sección Adjuntos de la ficha, que los sube tras el 201 (PF-03.12)', async () => {
    api();

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Nombre del proyecto/), 'Torre Norte');
    await chooseCustomer();
    await userEvent.upload(screen.getByLabelText('Elegir archivos para adjuntar'), [file('plano.pdf', 'application/pdf')]);
    expect(within(screen.getByRole('list', { name: 'Archivos elegidos' })).getByText('plano.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    expect(await screen.findByText(/Ficha \/proyectos\/p-new\?seccion=adjuntos/)).toBeInTheDocument();
    expect(takePendingUploads('p-new').map((pending) => pending.name)).toEqual(['plano.pdf']);
  });

  it('pinta bajo su campo los details[].field del servidor (PF-03.6)', async () => {
    api({
      'POST /projects': () =>
        errorResponse(422, 'INVALID_DATE_RANGE', [{ field: 'estimatedEndDate', code: 'INVALID_DATE_RANGE', message: 'x', startField: 'estimatedStartDate' }]),
    });

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Nombre del proyecto/), 'Torre Norte');
    await chooseCustomer();
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    expect(await screen.findByText('El fin estimado no puede ser anterior al inicio estimado.')).toBeInTheDocument();
    expect(screen.getByText('No puede ser anterior al inicio estimado.')).toBeInTheDocument();
  });

  it('un 404 del cliente se muestra bajo el cliente sin revelar si existe (AC-03.2); un cliente inactivo, con su mensaje', async () => {
    let calls = 0;
    api({
      'POST /projects': () => {
        calls += 1;
        return calls === 1 ? errorResponse(404, 'RESOURCE_NOT_FOUND') : errorResponse(422, 'CUSTOMER_INACTIVE', [{ field: 'customerId', code: 'CUSTOMER_INACTIVE' }]);
      },
    });

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Nombre del proyecto/), 'Torre Norte');
    await chooseCustomer();
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findAllByText('El cliente no existe o no está en tu alcance.')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findByText('El cliente está inactivo y no admite proyectos nuevos.')).toBeInTheDocument();
    expect(screen.getByText('El cliente está inactivo.')).toBeInTheDocument();
  });

  it('con proyectos.administrar elige asesor y código manual (RN-03.6, DM-17)', async () => {
    signInWith(['proyectos.ver', 'proyectos.crear', 'proyectos.administrar', 'clientes.ver']);
    const fetchMock = api({
      'GET /projects/owner-options': () => page([{ id: 'u-2', displayName: 'Luis Asesor', countryId: null, primaryTeam: { id: 't', code: 'N', name: 'Norte' } }]),
    });

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Nombre del proyecto/), 'Torre Norte');
    await chooseCustomer();
    await userEvent.click(screen.getByRole('combobox', { name: 'Asesor responsable' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Luis Asesor · Norte' }));
    await userEvent.type(screen.getByLabelText('Código'), 'pry-especial');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/projects')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, 'POST', '/projects')[0])).toMatchObject({ ownerId: 'u-2', code: 'pry-especial' });
    expect(new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/owner-options'))?.[0]), 'http://localhost').searchParams.get('purpose')).toBe(
      'ASSIGN',
    );
  });
});
