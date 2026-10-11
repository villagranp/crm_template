import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { CustomerCreatePage } from './CustomerCreatePage';
import { takePendingUploads } from './pending-uploads';
import { bodyOf, CUSTOMER, FORM_OPTIONS, signInWith, signOut, simulateWideScreen } from './testing/customer-fixtures';

const CREATED = { ...CUSTOMER, id: 'c-new', crmCode: 'CLI-000123' };

function DetailProbe() {
  const location = useLocation();
  const state = location.state as { createdMessage?: string } | null;
  return <p>{`Ficha ${location.pathname} · ${state?.createdMessage ?? ''}`}</p>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/clientes/nuevo" element={<CustomerCreatePage />} />
      <Route path="/clientes/:customerId" element={<DetailProbe />} />
      <Route path="/clientes" element={<p>Búsqueda</p>} />
    </Routes>,
    { initialEntries: ['/clientes/nuevo'] },
  );
}

async function chooseOption(label: RegExp, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

async function fillMinimum() {
  await userEvent.type(await screen.findByLabelText(/Razón social/), 'Ferretería El Sol');
  await chooseOption(/País/, 'Guatemala');
}

function file(name: string, type: string, sizeBytes = 1024): File {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: sizeBytes });
  return result;
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(['clientes.ver', 'clientes.crear']);
});

afterEach(() => {
  signOut();
  takePendingUploads('c-new');
});

describe('CustomerCreatePage (F-06)', () => {
  it('si las opciones no cargan muestra el error con "Reintentar" y no deja guardar', async () => {
    let calls = 0;
    mockApi({
      'GET /customers/form-options': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(FORM_OPTIONS);
      },
    });

    renderPage();
    expect(await screen.findByText('No se pudo cargar el formulario')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cliente' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Crear cliente' })).toBeInTheDocument();
  });

  it('marca los obligatorios, aplica el estado por defecto y valida antes de enviar', async () => {
    const fetchMock = mockApi({ 'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS) });

    renderPage();
    expect(await screen.findByRole('combobox', { name: /Estado/ })).toHaveTextContent('Activo');
    expect(screen.getByLabelText(/Razón social/)).toBeRequired();
    expect(screen.getByLabelText('Código CRM')).toHaveValue('Se asigna al guardar');
    expect(screen.getByLabelText('Responsable de ventas')).toHaveValue('Ana Asesora');

    await userEvent.type(screen.getByLabelText(/Razón social/), '=HYPERLINK()');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByText('No puede empezar por =, @, tabulador ni retorno de carro.')).toBeInTheDocument();
    expect(screen.getAllByText('Este campo es obligatorio.').length).toBeGreaterThanOrEqual(1);
    expect(callsTo(fetchMock, 'POST', '/customers')).toHaveLength(0);
  });

  it('crea el cliente sin enviar responsable (es el propio usuario) y navega a la ficha con el aviso (AC-02.12)', async () => {
    const fetchMock = mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () => jsonResponse(CREATED, 201),
    });

    renderPage();
    await fillMinimum();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ventas@sol.example');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByText('Ficha /clientes/c-new · Cliente CLI-000123 creado.')).toBeInTheDocument();
    const body = bodyOf(callsTo(fetchMock, 'POST', '/customers')[0]);
    expect(body).toEqual({
      legalName: 'Ferretería El Sol',
      countryId: FORM_OPTIONS.countries[0]?.id,
      email: 'ventas@sol.example',
      statusId: 'st-activo',
    });
    expect(body).not.toHaveProperty('salesOwnerId');
  });

  it('ante un posible duplicado pide confirmación y reenvía con acknowledgedDuplicateIds, aunque el candidato no sea visible (AC-02.17, AC-02.19)', async () => {
    let posts = 0;
    const fetchMock = mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () => {
        posts += 1;
        if (posts > 1) {
          return jsonResponse(CREATED, 201);
        }
        return errorResponse(409, 'POSSIBLE_DUPLICATE', [
          {
            rule: 'nit',
            reason: 'TAX_ID',
            candidate: {
              id: null,
              crmCode: 'CLI-000050',
              customerCode: 'EST-01',
              legalName: 'Ferretería El Sol',
              country: { isoCode: 'GT', name: 'Guatemala' },
              salesOwnerName: 'Luis Herrera',
              isVisible: false,
              isDeleted: false,
            },
          },
          {
            rule: 'razonSocialNormalizada',
            reason: 'LEGAL_NAME',
            candidate: {
              id: 'c-50',
              crmCode: 'CLI-000051',
              customerCode: null,
              legalName: 'Ferreteria el sol',
              country: { isoCode: 'GT', name: 'Guatemala' },
              salesOwnerName: 'Ana Asesora',
              isVisible: true,
              isDeleted: true,
            },
          },
        ]);
      },
    });

    renderPage();
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    const dialog = await screen.findByRole('dialog', { name: 'Posible cliente duplicado' });
    expect(within(dialog).getByText('Mismo NIT')).toBeInTheDocument();
    expect(within(dialog).getByText(/otro establecimiento del mismo cliente/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /CLI-000051/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /CLI-000050/ })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar de todos modos' }));

    expect(await screen.findByText(/Ficha \/clientes\/c-new/)).toBeInTheDocument();
    const second = bodyOf(callsTo(fetchMock, 'POST', '/customers')[1]);
    expect(second.acknowledgedDuplicateIds).toEqual(['c-50']);
  });

  it('confirma con una lista vacía cuando todos los candidatos están fuera de su alcance', async () => {
    let posts = 0;
    const fetchMock = mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () => {
        posts += 1;
        return posts > 1
          ? jsonResponse(CREATED, 201)
          : errorResponse(409, 'POSSIBLE_DUPLICATE', [
              {
                rule: 'nit',
                reason: 'TAX_ID',
                candidate: {
                  id: null,
                  crmCode: 'CLI-000050',
                  customerCode: null,
                  legalName: 'Otro',
                  country: { isoCode: 'GT', name: 'Guatemala' },
                  salesOwnerName: 'Luis',
                  isVisible: false,
                  isDeleted: false,
                },
              },
            ]);
      },
    });

    renderPage();
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar de todos modos' }));

    await screen.findByText(/Ficha \/clientes\/c-new/);
    expect(bodyOf(callsTo(fetchMock, 'POST', '/customers')[1]).acknowledgedDuplicateIds).toEqual([]);
  });

  it('con DUPLICATE_BLOCKED no ofrece guardar de todos modos (AC-02.18)', async () => {
    mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () =>
        errorResponse(409, 'DUPLICATE_BLOCKED', [
          {
            rule: 'razonSocialNormalizada',
            reason: 'LEGAL_NAME',
            candidate: { id: 'c-9', crmCode: 'CLI-000009', customerCode: null, legalName: 'Sol', country: { isoCode: 'GT', name: 'Guatemala' }, salesOwnerName: 'Ana', isVisible: true, isDeleted: false },
          },
        ]),
    });

    renderPage();
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Guardar de todos modos' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revisar datos' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('CUSTOMER_CODE_TAKEN de un cliente eliminado: error en el campo y enlace para restaurarlo con clientes.eliminar', async () => {
    signInWith(['clientes.ver', 'clientes.crear', 'clientes.eliminar']);
    mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () =>
        errorResponse(409, 'CUSTOMER_CODE_TAKEN', [{ field: 'customerCode', customerId: 'c-old', crmCode: 'CLI-000007', isDeleted: true }]),
    });

    renderPage();
    await userEvent.type(await screen.findByLabelText(/Código de cliente/), 'AB-12');
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByText('Ya existe un cliente con este código en el país.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Ver y restaurar CLI-000007' });
    expect(link).toHaveAttribute('href', '/clientes/c-old');
  });

  it('CUSTOMER_CODE_TAKEN de un cliente eliminado sin clientes.eliminar: sin enlace', async () => {
    mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () =>
        errorResponse(409, 'CUSTOMER_CODE_TAKEN', [{ field: 'customerCode', customerId: 'c-old', crmCode: 'CLI-000007', isDeleted: true }]),
    });

    renderPage();
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByText('Ya existe un cliente con este código en el país.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /restaurar/ })).not.toBeInTheDocument();
  });

  it('pinta bajo cada campo los errores 422 de validación del backend (AC-02.14, AC-02.53)', async () => {
    mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () =>
        errorResponse(422, 'FORMULA_NOT_ALLOWED', [
          { field: 'city', code: 'FORMULA_NOT_ALLOWED', message: 'x' },
          { field: 'phone', code: 'INVALID_PHONE_FORMAT', message: 'x' },
        ]),
    });

    renderPage();
    await fillMinimum();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(await screen.findByText('No puede empezar por =, @, tabulador ni retorno de carro.')).toBeInTheDocument();
    expect(screen.getByText('El teléfono no tiene un formato válido para el país.')).toBeInTheDocument();
    expect(screen.getByText(/Referencia: corr-test/)).toBeInTheDocument();
  });

  it('los archivos elegidos se dejan para subirlos en la ficha después del 201 (D-02.15, AC-02.24)', async () => {
    mockApi({
      'GET /customers/form-options': () => jsonResponse(FORM_OPTIONS),
      'POST /customers': () => jsonResponse(CREATED, 201),
    });

    renderPage();
    await fillMinimum();
    const big = file('plano.pdf', 'application/pdf', 5 * 1024 * 1024);
    await userEvent.upload(screen.getByLabelText('Elegir archivos para adjuntar'), [file('contrato.pdf', 'application/pdf'), big]);
    expect(screen.getByText(/supera el tamaño máximo/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    await screen.findByText(/Ficha \/clientes\/c-new/);

    expect(takePendingUploads('c-new').map((pending) => pending.name)).toEqual(['contrato.pdf', 'plano.pdf']);
  });
});
