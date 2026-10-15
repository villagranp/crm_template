import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { SafetyMinute } from './safety-minutes.api';
import { SafetyMinutesPage } from './SafetyMinutesPage';

const FUTURE: SafetyMinute = {
  id: 'sm-future',
  message: 'Usa casco\nen toda el área',
  displayDate: '2099-01-10',
  editable: true,
  deletable: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  updatedBy: { id: 'user-2', displayName: 'Seguridad' },
};
const TODAY: SafetyMinute = {
  ...FUTURE,
  id: 'sm-today',
  message: 'Mensaje de hoy',
  displayDate: '2026-10-15',
  editable: true,
  deletable: false,
};
const PAST: SafetyMinute = {
  ...FUTURE,
  id: 'sm-past',
  message: '<img src=x onerror=alert(1)>',
  displayDate: '2026-09-01',
  editable: false,
  deletable: false,
  updatedBy: null,
};

const ALL = ['minuto_seguridad.ver', 'minuto_seguridad.crear', 'minuto_seguridad.editar', 'minuto_seguridad.eliminar'];

function page(data: SafetyMinute[]) {
  return { data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } };
}

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /safety-minutes': () => jsonResponse(page([FUTURE, TODAY, PAST])),
    ...extra,
  });
}

function listQueries(fetchMock: Mock): Record<string, string>[] {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        ((init as RequestInit | undefined)?.method ?? 'GET') === 'GET' && String(input).includes('/safety-minutes'),
    )
    .map(([input]) => Object.fromEntries(new URL(String(input), 'http://localhost').searchParams));
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
});

describe('SafetyMinutesPage (PF-AJ1.8, AC-AJ1.13, AC-AJ1.14)', () => {
  it('con sólo minuto_seguridad.ver lista y muestra el detalle, sin crear, editar ni eliminar', async () => {
    signInWith(['minuto_seguridad.ver']);
    const fetchMock = api();
    const user = userEvent.setup();

    renderWithProviders(<SafetyMinutesPage />);

    const table = await screen.findByRole('table', { name: 'Minuto de seguridad' });
    expect(within(table).getByText('10/01/2099')).toBeInTheDocument();
    expect(within(table).getAllByText('Seguridad')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Nuevo mensaje' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
    expect(listQueries(fetchMock)[0]).toMatchObject({ sortBy: 'displayDate', sortOrder: 'desc' });

    await user.click(screen.getByRole('button', { name: 'Ver mensaje del 10/01/2099' }));
    const dialog = screen.getByRole('dialog', { name: 'Mensaje del 10/01/2099' });
    expect(within(dialog).getByText(/Usa casco/)).toHaveTextContent('Usa casco en toda el área');
  });

  it('muestra el mensaje como texto: el HTML no se interpreta (RN-AJ1.7)', async () => {
    signInWith(['minuto_seguridad.ver']);
    api();
    const user = userEvent.setup();

    const { container } = renderWithProviders(<SafetyMinutesPage />);
    const table = await screen.findByRole('table', { name: 'Minuto de seguridad' });

    expect(within(table).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver mensaje del 01/09/2026' }));
    expect(within(screen.getByRole('dialog')).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(document.body.querySelector('img')).toBeNull();
  });

  it('muestra editar y eliminar según editable y deletable del servidor', async () => {
    signInWith(ALL);
    api();

    renderWithProviders(<SafetyMinutesPage />);
    await screen.findByRole('table', { name: 'Minuto de seguridad' });

    // Futuro: editar y eliminar.
    expect(screen.getByRole('button', { name: 'Editar mensaje del 10/01/2099' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar mensaje del 10/01/2099' })).toBeInTheDocument();
    // Hoy: sólo editar.
    expect(screen.getByRole('button', { name: 'Editar mensaje del 15/10/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje del 15/10/2026' })).not.toBeInTheDocument();
    // Pasado: sólo lectura.
    expect(screen.getByRole('button', { name: 'Ver mensaje del 01/09/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar mensaje del 01/09/2026' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje del 01/09/2026' })).not.toBeInTheDocument();
  });

  it('sin el permiso de editar o eliminar no aparecen aunque el servidor diga editable', async () => {
    signInWith(['minuto_seguridad.ver', 'minuto_seguridad.crear']);
    api();

    renderWithProviders(<SafetyMinutesPage />);
    await screen.findByRole('table', { name: 'Minuto de seguridad' });

    expect(screen.getByRole('button', { name: 'Nuevo mensaje' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument();
  });

  it('filtra por rango de fechas en la consulta; un rango invertido no se envía', async () => {
    signInWith(['minuto_seguridad.ver']);
    const fetchMock = api();

    renderWithProviders(<SafetyMinutesPage />);
    await screen.findByRole('table', { name: 'Minuto de seguridad' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } });
    await waitFor(() =>
      expect(listQueries(fetchMock).at(-1)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' }),
    );

    const before = listQueries(fetchMock).length;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-15' } });
    expect(await screen.findByText('«Desde» no puede ser posterior a «Hasta».')).toBeInTheDocument();
    expect(listQueries(fetchMock)).toHaveLength(before);
  });

  it('registra un mensaje recortado y valida mensaje vacío, exceso y fecha pasada', async () => {
    signInWith(ALL);
    const fetchMock = api({ 'POST /safety-minutes': () => jsonResponse(FUTURE, 201) });
    const user = userEvent.setup();

    renderWithProviders(<SafetyMinutesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo mensaje' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo mensaje' });
    const message = within(dialog).getByRole('textbox', { name: /Mensaje/ });
    const date = within(dialog).getByLabelText(/Fecha de visualización/);

    fireEvent.change(message, { target: { value: '   ' } });
    fireEvent.change(date, { target: { value: '2000-01-01' } });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(await within(dialog).findByText('Escribe el mensaje.')).toBeInTheDocument();
    expect(within(dialog).getByText('La fecha no puede ser anterior a hoy.')).toBeInTheDocument();

    fireEvent.change(message, { target: { value: 'a'.repeat(1001) } });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(await within(dialog).findByText('Usa como máximo 1000 caracteres.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/safety-minutes')).toHaveLength(0);

    fireEvent.change(message, { target: { value: '  Revisa tus EPP \n hoy  ' } });
    fireEvent.change(date, { target: { value: '2099-02-01' } });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [post] = callsTo(fetchMock, 'POST', '/safety-minutes');
    expect(JSON.parse(String(post?.body))).toEqual({
      message: 'Revisa tus EPP \n hoy',
      displayDate: '2099-02-01',
    });
  });

  it('marca la fecha ante 409 SAFETY_MINUTE_DUPLICATE y explica 422 SAFETY_MINUTE_PAST_DATE', async () => {
    signInWith(ALL);
    let status = 409;
    api({
      'POST /safety-minutes': () =>
        status === 409
          ? errorResponse(409, 'SAFETY_MINUTE_DUPLICATE', [{ field: 'displayDate' }])
          : errorResponse(422, 'SAFETY_MINUTE_PAST_DATE'),
    });
    const user = userEvent.setup();

    renderWithProviders(<SafetyMinutesPage />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo mensaje' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo mensaje' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Mensaje/ }), { target: { value: 'Hola' } });
    fireEvent.change(within(dialog).getByLabelText(/Fecha de visualización/), { target: { value: '2099-02-01' } });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialog).findByText(/Ya hay un mensaje para esa fecha/)).toBeInTheDocument();

    status = 422;
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(
      await within(dialog).findByText('La fecha de visualización no puede ser anterior a hoy.'),
    ).toBeInTheDocument();
  });

  it('edita enviando sólo los campos que cambian y permite conservar la fecha de hoy', async () => {
    signInWith(ALL);
    const fetchMock = api({ 'PATCH /safety-minutes/sm-today': () => jsonResponse(TODAY) });
    const user = userEvent.setup();

    renderWithProviders(<SafetyMinutesPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar mensaje del 15/10/2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar mensaje del 15/10/2026' });
    expect(within(dialog).getByRole('textbox', { name: /Mensaje/ })).toHaveValue('Mensaje de hoy');
    expect(within(dialog).getByLabelText(/Fecha de visualización/)).toHaveValue('2026-10-15');

    fireEvent.change(within(dialog).getByRole('textbox', { name: /Mensaje/ }), { target: { value: 'Nuevo texto' } });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = callsTo(fetchMock, 'PATCH', '/safety-minutes/sm-today');
    expect(JSON.parse(String(patch?.body))).toEqual({ message: 'Nuevo texto' });
  });

  it('elimina tras confirmar y traduce 409 SAFETY_MINUTE_LOCKED según el motivo', async () => {
    signInWith(ALL);
    let locked = true;
    const fetchMock = api({
      'DELETE /safety-minutes/sm-future': () =>
        locked
          ? errorResponse(409, 'SAFETY_MINUTE_LOCKED', [{ reason: 'today' }])
          : new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();

    renderWithProviders(<SafetyMinutesPage />);
    await user.click(await screen.findByRole('button', { name: 'Eliminar mensaje del 10/01/2099' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar mensaje' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText(/ya no se puede eliminar/)).toBeInTheDocument();

    locked = false;
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(callsTo(fetchMock, 'DELETE', '/safety-minutes/sm-future')).toHaveLength(2);
  });

  it('muestra el estado vacío y el de error con reintento', async () => {
    signInWith(['minuto_seguridad.ver']);
    mockApi({ 'GET /safety-minutes': () => jsonResponse(page([])) });
    const { unmount } = renderWithProviders(<SafetyMinutesPage />);
    expect(await screen.findByText('No hay mensajes')).toBeInTheDocument();
    unmount();

    mockApi({ 'GET /safety-minutes': () => errorResponse(403, 'PERMISSION_DENIED') });
    renderWithProviders(<SafetyMinutesPage />);
    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
