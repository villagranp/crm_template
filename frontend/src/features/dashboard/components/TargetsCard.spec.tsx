import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { emptyTargets, targetIndicators } from '../testing/dashboard-fixtures';
import { TargetsCard } from './TargetsCard';

describe('TargetsCard (K9, PF-01.19)', () => {
  it('sin metas aplicables dice "Sin metas configuradas" y no muestra ningún número', async () => {
    mockApi({ 'GET /dashboard/indicators/targets': () => jsonResponse(emptyTargets()) });
    renderWithProviders(<TargetsCard period="MONTH" />);

    const card = screen.getByRole('region', { name: 'Metas y cumplimiento' });
    expect(await within(card).findByText('Sin metas configuradas')).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
    expect(within(card).queryByRole('list')).not.toBeInTheDocument();
    // K9 no tiene destino propio: ni enlace ni nota de disponibilidad.
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByText(/Listado disponible/)).not.toBeInTheDocument();
  });

  it('con metas: cumplimiento, objetivo y logrado; AMOUNT en USD y objetivo 0 "No calculable"', async () => {
    mockApi({
      'GET /dashboard/indicators/targets': () =>
        jsonResponse(
          targetIndicators({
            items: [
              {
                targetId: 't-1',
                metric: 'WON_OPPORTUNITIES',
                subject: { type: 'USER', id: 'u-1', label: 'Ana López' },
                targetValue: '4.0000',
                achievedValue: '2.0000',
                compliancePercent: '50.00',
                unit: null,
                currencyCode: null,
              },
              {
                targetId: 't-2',
                metric: 'AMOUNT',
                subject: { type: 'USER', id: 'u-1', label: 'Ana López' },
                targetValue: '10000.0000',
                achievedValue: '7000.0000',
                compliancePercent: '70.00',
                unit: null,
                currencyCode: 'USD',
              },
              {
                targetId: 't-3',
                metric: 'VISITS',
                subject: { type: 'USER', id: 'u-1', label: 'Ana López' },
                targetValue: '0.0000',
                achievedValue: '3.0000',
                compliancePercent: null,
                unit: null,
                currencyCode: null,
              },
            ],
          }),
        ),
    });
    renderWithProviders(<TargetsCard period="MONTH" />);

    const card = screen.getByRole('region', { name: 'Metas y cumplimiento' });
    expect(await within(card).findByText('50.00 %')).toBeInTheDocument();
    const items = within(
      within(card).getByRole('list', { name: 'Metas del período' }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Oportunidades ganadas · Ana López');
    expect(items[0]).toHaveTextContent('Objetivo 4 · Logrado 2 · Cumplimiento 50.00 %');
    expect(items[1]).toHaveTextContent(
      'Objetivo USD 10,000.00 · Logrado USD 7,000.00 · Cumplimiento 70.00 %',
    );
    expect(items[2]).toHaveTextContent('Cumplimiento No calculable');
  });
});
