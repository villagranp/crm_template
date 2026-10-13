import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { INTERACTION, lastQuery, page, signInWith, signOut } from '../testing/fixtures';

import { interactionHistoryPath } from './commercial-paths';
import { InteractionTimeline } from './InteractionTimeline';

const ACTIVITY_INTERACTION = {
  ...INTERACTION,
  sourceType: 'ACTIVITY' as const,
  sourceId: 'a-1',
  sourceCode: 'ACT-2026-000001',
  typeLabel: 'Llamada',
  subject: 'Llamada de seguimiento',
  summary: null,
  result: null,
  nextAction: null,
  nextActionDate: null,
  occurredAt: '2026-10-05T14:00:00.000Z',
  sourcePath: '/actividad/actividades/a-1',
};

beforeEach(() => signInWith(['actividades.ver']));
afterEach(signOut);

describe('InteractionTimeline (E.5, RN-04.33)', () => {
  it('compacta: pide las 5 últimas del cliente, enlaza al origen y al historial completo', async () => {
    const fetchMock = mockApi({ 'GET /interactions': () => page([INTERACTION, ACTIVITY_INTERACTION], 12) });
    renderWithProviders(<InteractionTimeline customerId="c-1" compact />);

    expect(await screen.findByText('Presentar catálogo')).toBeInTheDocument();
    const query = lastQuery(fetchMock, '/interactions');
    expect(query.get('customerId')).toBe('c-1');
    expect(query.get('pageSize')).toBe('5');

    expect(screen.getByRole('link', { name: 'Ver visita VIS-2026-00001' })).toHaveAttribute('href', '/actividad/visitas/v-1');
    expect(screen.getByRole('link', { name: 'Ver actividad ACT-2026-000001' })).toHaveAttribute('href', '/actividad/actividades/a-1');
    expect(screen.getByText('Interesados en la línea premium.')).toBeInTheDocument();
    expect(screen.getByText('Interesado')).toBeInTheDocument();
    // Ya es la línea de tiempo del cliente: no repite su razón social.
    expect(screen.queryByText(/Constructora Peña/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el historial completo (12)' })).toHaveAttribute('href', '/actividad/historial?customerId=c-1');
  });

  it('agrupa por día', async () => {
    const sameDay = [
      { ...INTERACTION, occurredAt: '2026-10-05T12:10:00.000Z' },
      { ...ACTIVITY_INTERACTION, occurredAt: '2026-10-05T12:00:00.000Z' },
      { ...ACTIVITY_INTERACTION, sourceId: 'a-2', sourceCode: 'ACT-2026-000002', occurredAt: '2026-09-20T12:00:00.000Z' },
    ];
    mockApi({ 'GET /interactions': () => page(sameDay) });
    renderWithProviders(<InteractionTimeline projectId="p-1" />);

    await screen.findByText('Presentar catálogo');
    const groups = screen.getAllByRole('region');
    expect(groups).toHaveLength(2);
    expect(within(groups[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(within(groups[1] as HTMLElement).getAllByRole('listitem')).toHaveLength(1);
  });

  it('vacío y error con reintento', async () => {
    const user = userEvent.setup();
    let calls = 0;
    mockApi({
      'GET /interactions': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([]);
      },
    });
    renderWithProviders(<InteractionTimeline customerId="c-1" compact />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay interacciones registradas')).toBeInTheDocument();
  });

  it('el enlace al historial completo conserva el filtro', () => {
    expect(interactionHistoryPath({ projectId: 'p-1' })).toBe('/actividad/historial?projectId=p-1');
    expect(interactionHistoryPath({})).toBe('/actividad/historial');
  });
});
