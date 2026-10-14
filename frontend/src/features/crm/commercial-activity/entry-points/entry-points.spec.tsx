import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { signInWith, signOut, TRACE } from '../testing/fixtures';

import { CommercialActivitySection, NewActivityButton, PlanVisitButton } from './index';

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderAtFicha(element: ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route path="/ficha" element={element} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: ['/ficha'] },
  );
}

afterEach(signOut);

describe('Puntos de entrada (E.11, PF-04.54)', () => {
  it('NewActivityButton lleva cliente, proyecto y oportunidad preseleccionados', async () => {
    signInWith(['actividades.crear']);
    renderAtFicha(<NewActivityButton customerId="c-1" projectId="p-1" opportunityId="o-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva actividad' }));
    expect(await screen.findByText('En /actividad/actividades/nueva?customerId=c-1&projectId=p-1&opportunityId=o-1')).toBeInTheDocument();
  });

  it('PlanVisitButton lleva cliente y proyecto preseleccionados', async () => {
    signInWith(['visitas.crear']);
    renderAtFicha(<PlanVisitButton customerId="c-1" projectId="p-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Planificar visita' }));
    expect(await screen.findByText('En /actividad/visitas/nueva?customerId=c-1&projectId=p-1')).toBeInTheDocument();
  });

  it('los botones se ocultan sin su permiso de creación', () => {
    signInWith(['actividades.ver', 'visitas.ver']);
    renderAtFicha(
      <>
        <NewActivityButton customerId="c-1" />
        <PlanVisitButton customerId="c-1" />
      </>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('CommercialActivitySection muestra seguimiento, próximas e historial reciente del cliente', async () => {
    signInWith(['actividades.ver']);
    const fetchMock = mockApi({ 'GET /follow-ups/trace': () => jsonResponse(TRACE) });
    renderAtFicha(<CommercialActivitySection customerId="c-1" />);

    const section = await screen.findByRole('region', { name: 'Actividad comercial' });
    expect(await within(section).findByText('Interesados en la línea premium.', { selector: 'dd' })).toBeInTheDocument();
    expect(within(section).getByText('Enviar cotización', { exact: false, selector: 'dd' })).toBeInTheDocument();
    expect(within(section).getByText('3')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'ACT-2026-000009 · Seguimiento de cotización' })).toHaveAttribute('href', '/actividad/actividades/a-9');
    expect(within(section).getByRole('link', { name: 'Ver visita VIS-2026-00001' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Ver el historial completo' })).toHaveAttribute('href', '/actividad/historial?customerId=c-1');
    const call = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).find((url) => url.pathname.endsWith('/follow-ups/trace'));
    expect(call?.searchParams.get('customerId')).toBe('c-1');
    expect(call?.searchParams.has('projectId')).toBe(false);
  });

  it('CommercialActivitySection: sin visitas ni actividades (404) es un estado vacío, no un error', async () => {
    signInWith(['visitas.ver']);
    mockApi({ 'GET /follow-ups/trace': () => errorResponse(404, 'RESOURCE_NOT_FOUND') });
    renderAtFicha(<CommercialActivitySection projectId="p-1" />);

    expect(await screen.findByText('Aún no hay actividad comercial registrada')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('CommercialActivitySection: error con referencia y reintento', async () => {
    signInWith(['actividades.ver']);
    let calls = 0;
    mockApi({
      'GET /follow-ups/trace': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(TRACE);
      },
    });
    renderAtFicha(<CommercialActivitySection customerId="c-1" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referencia: corr-test');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Interesados en la línea premium.', { selector: 'dd' })).toBeInTheDocument();
  });

  it('CommercialActivitySection se oculta sin actividades.ver ni visitas.ver y no llama a la API', () => {
    signInWith(['clientes.ver']);
    const fetchMock = mockApi({});
    renderAtFicha(<CommercialActivitySection customerId="c-1" />);

    expect(screen.queryByRole('region', { name: 'Actividad comercial' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
