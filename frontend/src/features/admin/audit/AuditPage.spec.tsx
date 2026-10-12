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
    await user.type(screen.getByLabelText('Tipo de recurso'), 'user');
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
      .mockResolvedValue({ blob: new Blob(['a,b']), fileName: 'auditoria-20261008-1000.csv' });
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
});
