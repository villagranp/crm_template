import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { resetSession, setSessionPermissions } from '../testing/dashboard-fixtures';
import { SafetyMinuteCard } from './SafetyMinuteCard';

afterEach(resetSession);

function safetyMinute(message: string | null) {
  return {
    'GET /me/safety-minute': () =>
      jsonResponse({
        safetyMinute: message === null ? null : { displayDate: '2026-10-14', message },
      }),
  };
}

describe('SafetyMinuteCard (PF-AJ1.7)', () => {
  it('con mensaje de hoy muestra título, fecha en español y el mensaje', async () => {
    setSessionPermissions([]);
    mockApi(safetyMinute('Usa siempre tu casco.'));
    renderWithProviders(<SafetyMinuteCard />);

    const region = await screen.findByRole('region', { name: 'Minuto de seguridad' });
    expect(region).toHaveTextContent('Miércoles, 14 de octubre de 2026');
    expect(region).toHaveTextContent('Usa siempre tu casco.');
  });

  it('respeta los saltos de línea con white-space: pre-line', async () => {
    setSessionPermissions([]);
    mockApi(safetyMinute('Primera línea\nSegunda línea'));
    renderWithProviders(<SafetyMinuteCard />);

    const message = await screen.findByText(/Primera línea/);
    expect(message).toHaveStyle({ whiteSpace: 'pre-line' });
    expect(message.textContent).toBe('Primera línea\nSegunda línea');
  });

  it('sin mensaje hoy no se pinta nada', async () => {
    setSessionPermissions([]);
    const fetchMock = mockApi(safetyMinute(null));
    const { container } = renderWithProviders(<SafetyMinuteCard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('mientras carga no se pinta nada', () => {
    setSessionPermissions([]);
    mockApi({ 'GET /me/safety-minute': () => new Promise<Response>(() => undefined) });
    const { container } = renderWithProviders(<SafetyMinuteCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('si la consulta falla no se pinta nada ni se rompe el panel', async () => {
    setSessionPermissions([]);
    const fetchMock = mockApi({});
    const { container } = renderWithProviders(<SafetyMinuteCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('AC-AJ1.12: el HTML del mensaje se ve como texto, sin crear elementos', async () => {
    setSessionPermissions([]);
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script><b>negrita</b>';
    mockApi(safetyMinute(payload));
    const { container } = renderWithProviders(<SafetyMinuteCard />);

    const region = await screen.findByRole('region', { name: 'Minuto de seguridad' });
    expect(region).toHaveTextContent(payload);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
