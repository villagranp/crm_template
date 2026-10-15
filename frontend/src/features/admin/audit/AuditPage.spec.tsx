import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { AuditLogEntry } from './audit.api';
import { AuditPage } from './AuditPage';
import { saveFile } from '@/lib/save-file';

// jsdom no implementa `URL.createObjectURL`: se sustituye la entrega al navegador.
vi.mock('@/lib/save-file', () => ({ saveFile: vi.fn() }));

const ENTRY: AuditLogEntry = {
  id: 'log-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
  event: 'role.updated',
  correlationId: 'corr-1',
  subjectId: 'sub-1',
  subjectEmail: 'ana@example.test',
  resourceType: 'role',
  resourceId: 'role-1',
  ipAddress: '10.0.0.1',
  changes: { name: { before: 'Ventas', after: 'Ventas Norte' }, permissions: { before: ['a'], after: ['a', 'b'] } },
  metadata: { reason: 'Reorganización' },
};

const PAGE = { data: [ENTRY], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['AUDITOR'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

/** Pantalla ancha: `DataTable` pinta la tabla (ver `common/DataTable.spec.tsx`). */
function simulateWideScreen() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function requestedUrls(fetchMock: ReturnType<typeof mockApi>, path: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith(path));
}

beforeEach(() => {
  simulateWideScreen();
});

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
  vi.restoreAllMocks();
});

describe('AuditPage', () => {
  it('lista los registros y abre el detalle con la diferencia antes → después', async () => {
    signInWith(['auditoria.ver']);
    mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: ['role.updated'] }),
    });
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver detalle de role.updated' }));

    const changes = screen.getByRole('table', { name: 'Cambios' });
    const nameRow = within(changes).getByRole('row', { name: /name/ });
    expect(within(nameRow).getByText('Ventas')).toBeInTheDocument();
    expect(within(nameRow).getByText('Ventas Norte')).toBeInTheDocument();
    expect(within(changes).getByText('a, b')).toBeInTheDocument();
    expect(screen.getByText('Reorganización')).toBeInTheDocument();
  });

  it('ordena por fecha descendente por defecto y aplica los filtros en la consulta', async () => {
    signInWith(['auditoria.ver']);
    const fetchMock = mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
    });
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />);
    await screen.findByRole('table', { name: 'Registros de auditoría' });
    const [first] = requestedUrls(fetchMock, '/audit-logs');
    expect(first?.searchParams.get('sortBy')).toBe('occurredAt');
    expect(first?.searchParams.get('sortOrder')).toBe('desc');

    await user.type(screen.getByRole('combobox', { name: 'Evento' }), 'auth.');
    await user.type(screen.getByRole('combobox', { name: 'Entidad' }), 'user');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      const last = requestedUrls(fetchMock, '/audit-logs').at(-1);
      expect(last?.searchParams.get('event')).toBe('auth.');
      expect(last?.searchParams.get('resourceType')).toBe('user');
    });
  });

  it('impide aplicar un rango de fechas invertido', async () => {
    signInWith(['auditoria.ver']);
    mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
    });
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />);
    await user.type(screen.getByLabelText('Desde'), '2026-10-09');
    await user.type(screen.getByLabelText('Hasta'), '2026-10-08');

    expect(screen.getByText('Debe ser igual o posterior a «Desde».')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });

  it('oculta la exportación sin auditoria.exportar', async () => {
    signInWith(['auditoria.ver']);
    mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
    });

    renderWithProviders(<AuditPage />);

    await screen.findByRole('table', { name: 'Registros de auditoría' });
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });

  it('exporta con los filtros activos (sin paginación) a través del cliente HTTP', async () => {
    signInWith(['auditoria.ver', 'auditoria.exportar']);
    mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
    });
    const download = vi
      .spyOn(httpClient, 'download')
      .mockResolvedValue({ blob: new Blob(['a,b']), fileName: 'auditoria-20261008-1000.csv', headers: new Headers() });
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />, { initialEntries: ['/?event=auth.&page=2'] });
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'auditoria-20261008-1000.csv'));
    expect(download).toHaveBeenCalledWith('/audit-logs/export', { query: { event: 'auth.' } });
  });

  it('la exportación pasa por el cliente HTTP real y muestra su error', async () => {
    signInWith(['auditoria.ver', 'auditoria.exportar']);
    mockApi({
      'GET /audit-logs': () => jsonResponse(PAGE),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
      'GET /audit-logs/export': () => errorResponse(403, 'PERMISSION_DENIED'),
    });
    const user = userEvent.setup();

    renderWithProviders(<AuditPage />);
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });

  it('traduce un 403 de la consulta', async () => {
    signInWith(['auditoria.ver']);
    mockApi({
      'GET /audit-logs': () => errorResponse(403, 'PERMISSION_DENIED'),
      'GET /audit-logs/events': () => jsonResponse({ data: [] }),
    });

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });
  describe('07 E.6: entidad, campo y vista por campo', () => {
    const CUSTOMER_ENTRY: AuditLogEntry = {
      ...ENTRY,
      id: 'log-2',
      event: 'crm.customer.updated',
      resourceType: 'crm.customer',
      resourceId: 'cus-1',
      changes: { phone: { before: '***1234', after: '***9876' }, legalName: { before: 'A', after: 'B' } },
    };
    const FIELD_PAGE = { ...PAGE, data: [CUSTOMER_ENTRY, { ...ENTRY, changes: null }] };

    it('el selector de Entidad muestra etiquetas, busca por ellas y filtra por el código; aplica el filtro Campo', async () => {
      signInWith(['auditoria.ver']);
      const fetchMock = mockApi({
        'GET /audit-logs': () => jsonResponse(PAGE),
        'GET /audit-logs/events': () => jsonResponse({ data: [] }),
      });
      const user = userEvent.setup();

      renderWithProviders(<AuditPage />);
      await screen.findByRole('table', { name: 'Registros de auditoría' });
      await user.type(screen.getByRole('combobox', { name: 'Entidad' }), 'client');
      await user.click(await screen.findByRole('option', { name: /^Cliente crm\.customer$/ }));
      expect(screen.getByText('Cliente')).toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: 'Campo' }), 'phaseId');
      await user.click(screen.getByRole('button', { name: 'Aplicar' }));

      await waitFor(() => {
        const last = requestedUrls(fetchMock, '/audit-logs').at(-1);
        expect(last?.searchParams.get('resourceType')).toBe('crm.customer');
        expect(last?.searchParams.get('field')).toBe('phaseId');
      });
    });

    it('un campo con caracteres no admitidos no se puede aplicar', async () => {
      signInWith(['auditoria.ver']);
      mockApi({
        'GET /audit-logs': () => jsonResponse(PAGE),
        'GET /audit-logs/events': () => jsonResponse({ data: [] }),
      });
      const user = userEvent.setup();

      renderWithProviders(<AuditPage />);
      await user.type(screen.getByRole('textbox', { name: 'Campo' }), 'phase id');

      expect(screen.getByText(/Sólo letras, dígitos, punto y guion bajo/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    });

    it('PF-07.18: la vista por campo pinta una fila por campo con valor anterior y nuevo', async () => {
      signInWith(['auditoria.ver']);
      mockApi({
        'GET /audit-logs': () => jsonResponse(FIELD_PAGE),
        'GET /audit-logs/events': () => jsonResponse({ data: [] }),
      });
      const user = userEvent.setup();

      renderWithProviders(<AuditPage />);
      const events = await screen.findByRole('table', { name: 'Registros de auditoría' });
      expect(within(events).getByText('Cliente · cus-1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Vista por campo' }));

      const table = await screen.findByRole('table', { name: 'Cambios por campo' });
      expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
        'Fecha y hora',
        'Usuario',
        'Entidad',
        'Registro',
        'Acción',
        'Campo',
        'Valor anterior',
        'Valor nuevo',
        expect.any(String),
      ]);
      const phone = within(table).getByRole('row', { name: /Teléfono \(phone\)/ });
      // Los valores enmascarados se muestran tal cual.
      expect(within(phone).getByText('***1234')).toBeInTheDocument();
      expect(within(phone).getByText('***9876')).toBeInTheDocument();
      expect(within(phone).getByText('Cliente')).toBeInTheDocument();
      expect(within(phone).getByText('crm.customer.updated')).toBeInTheDocument();
      // La segunda fila del mismo evento no repite sus datos comunes.
      const legalName = within(table).getByRole('row', { name: /Razón social/ });
      expect(within(legalName).queryByText('crm.customer.updated')).not.toBeInTheDocument();
      // Un evento sin cambios aparece en una fila sin campo.
      expect(within(table).getByText('role.updated')).toBeInTheDocument();
      // El detalle se abre desde la primera fila de cada evento.
      expect(within(table).getAllByRole('button', { name: /Ver detalle de/ })).toHaveLength(2);
    });

    it('PF-07.18: en la vista por campo exporta con layout=fields', async () => {
      signInWith(['auditoria.ver', 'auditoria.exportar']);
      mockApi({
        'GET /audit-logs': () => jsonResponse(FIELD_PAGE),
        'GET /audit-logs/events': () => jsonResponse({ data: [] }),
      });
      const download = vi
        .spyOn(httpClient, 'download')
        .mockResolvedValue({ blob: new Blob(['a,b']), fileName: 'auditoria.csv', headers: new Headers() });
      const user = userEvent.setup();

      renderWithProviders(<AuditPage />, { initialEntries: ['/?field=phone'] });
      await user.click(await screen.findByRole('button', { name: 'Vista por campo' }));
      await user.click(screen.getByRole('button', { name: 'Exportar CSV por campo' }));

      await waitFor(() =>
        expect(download).toHaveBeenCalledWith('/audit-logs/export', {
          query: { field: 'phone', layout: 'fields' },
        }),
      );
    });
  });
});
