import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { ApprovalDetail, ApprovalSummary } from './approvals.api';
import { ApprovalsPage } from './ApprovalsPage';

const SUMMARY: ApprovalSummary = {
  id: 'apr-1',
  code: 'APR-0001',
  title: 'Descuento especial',
  resourceType: 'cotizacion',
  resourceId: 'cot-1',
  status: 'PENDING',
  requestedBy: { id: 'u-1', displayName: 'Ana Pruebas' },
  stepCount: 2,
  createdAt: '2026-10-08T10:00:00.000Z',
  resolvedAt: null,
};

const DETAIL: ApprovalDetail = {
  ...SUMMARY,
  reason: 'Cliente estratégico',
  payload: { descuento: 10 },
  updatedAt: '2026-10-08T10:00:00.000Z',
  steps: [
    {
      id: 's-1',
      sequence: 1,
      status: 'APPROVED',
      approver: { id: 'u-2', displayName: 'Beto Aprobador' },
      approverRole: null,
      comment: 'De acuerdo',
      createdAt: '2026-10-08T10:00:00.000Z',
      resolvedAt: '2026-10-08T11:00:00.000Z',
    },
    {
      id: 's-2',
      sequence: 2,
      status: 'PENDING',
      approver: null,
      approverRole: { id: 'r-1', name: 'Auditor' },
      comment: null,
      createdAt: '2026-10-08T10:00:00.000Z',
      resolvedAt: null,
    },
  ],
};

function page(data: ApprovalSummary[]) {
  return {
    data,
    pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: data.length ? 1 : 0 },
  };
}

beforeEach(() => {
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
});

describe('ApprovalsPage', () => {
  it('sin solicitudes explica que la resolución llega con el primer flujo de negocio', async () => {
    mockApi({ 'GET /approvals': () => jsonResponse(page([])) });

    renderWithProviders(<ApprovalsPage />);

    expect(await screen.findByText('Todavía no hay solicitudes de aprobación')).toBeInTheDocument();
    expect(screen.getByText(/llegará con ese primer flujo/)).toBeInTheDocument();
  });

  it('filtra por estado en el servidor', async () => {
    const fetchMock = mockApi({ 'GET /approvals': () => jsonResponse(page([SUMMARY])) });
    const user = userEvent.setup();

    renderWithProviders(<ApprovalsPage />);
    await screen.findByRole('table', { name: 'Solicitudes de aprobación' });

    const filters = screen.getByRole('group', { name: 'Filtrar por estado' });
    const rejected = within(filters).getByRole('button', { name: /^Rechazada/ });
    await user.click(rejected);

    expect(rejected).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      // La consulta de la tabla (no la de los contadores, que pide una sola fila).
      const listCalls = fetchMock.mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .filter((url) => url.searchParams.get('pageSize') !== '1');
      expect(listCalls.at(-1)?.searchParams.get('status')).toBe('REJECTED');
    });
  });

  it('el detalle muestra los pasos con aprobador o rol, sin acciones de resolución', async () => {
    mockApi({
      'GET /approvals': () => jsonResponse(page([SUMMARY])),
      'GET /approvals/apr-1': () => jsonResponse(DETAIL),
    });
    const user = userEvent.setup();

    renderWithProviders(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver detalle de APR-0001' }));

    const steps = await screen.findByRole('list', { name: 'Pasos de aprobación' });
    const items = within(steps).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Beto Aprobador')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Aprobada')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Rol: Auditor')).toBeInTheDocument();
    expect(screen.getByText('Cliente estratégico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar|rechazar/i })).not.toBeInTheDocument();
  });

  it('un detalle inexistente muestra el error traducido', async () => {
    mockApi({
      'GET /approvals': () => jsonResponse(page([SUMMARY])),
      'GET /approvals/apr-1': () => errorResponse(404, 'RESOURCE_NOT_FOUND'),
    });
    const user = userEvent.setup();

    renderWithProviders(<ApprovalsPage />);
    await user.click(await screen.findByRole('button', { name: 'Ver detalle de APR-0001' }));

    expect(
      await screen.findByText('El elemento ya no existe. Actualiza la lista.'),
    ).toBeInTheDocument();
  });
});
