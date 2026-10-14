import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatDateTime } from '@/features/crm/commercial-activity/entry-points';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { FILTER_OPTIONS, signInWith, signOut } from '../testing/report-fixtures';

import { ReportDateTime } from './ReportDateTime';
import { useReportTimeZones } from './use-report-time-zones';

const INSTANT = '2026-10-12T20:30:00.000Z';

function Probe() {
  const zones = useReportTimeZones();
  return (
    <>
      <p data-testid="zones">{`${zones.timeZone ?? 'navegador'}|${zones.businessTimeZone ?? 'navegador'}`}</p>
      <p data-testid="instant">
        <ReportDateTime value={INSTANT} />
      </p>
    </>
  );
}

beforeEach(() => signInWith(['reportes.ver']));
afterEach(signOut);

describe('useReportTimeZones (P-05.27: zonas de GET /reports/filter-options)', () => {
  it('usa la zona del perfil para los instantes y la del negocio para "hoy", sin depender de Actividad comercial', async () => {
    const fetchMock = mockApi({
      'GET /reports/filter-options': () => jsonResponse({ ...FILTER_OPTIONS, timeZone: 'Asia/Tokyo', businessTimeZone: 'America/Guatemala' }),
    });
    renderWithProviders(<Probe />);

    expect(await screen.findByText('Asia/Tokyo|America/Guatemala')).toBeInTheDocument();
    expect(screen.getByTestId('instant')).toHaveTextContent(formatDateTime(INSTANT, 'Asia/Tokyo'));
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname);
    expect(paths.some((path) => path.includes('form-options'))).toBe(false);
  });

  it('una zona que Intl no reconoce se ignora (zona del navegador) y mientras carga también', async () => {
    mockApi({ 'GET /reports/filter-options': () => jsonResponse({ ...FILTER_OPTIONS, timeZone: 'Mars/Olympus', businessTimeZone: 'America/Guatemala' }) });
    renderWithProviders(<Probe />);

    expect(screen.getByTestId('zones')).toHaveTextContent('navegador|navegador');
    expect(await screen.findByText('navegador|America/Guatemala')).toBeInTheDocument();
    expect(screen.getByTestId('instant')).toHaveTextContent(formatDateTime(INSTANT, undefined));
  });
});
