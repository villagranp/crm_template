import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, Link, RouterProvider, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lightTheme } from '@/theme';

import { UnsavedChangesGuard } from './UnsavedChangesGuard';

function Editor() {
  const [dirty, setDirty] = useState(false);
  const [, setSearchParams] = useSearchParams();
  return (
    <>
      <button type="button" onClick={() => setDirty(true)}>
        Editar
      </button>
      <button type="button" onClick={() => setSearchParams({ filtro: 'x' })}>
        Filtrar
      </button>
      <Link to="/otra">Salir</Link>
      <UnsavedChangesGuard when={dirty} />
    </>
  );
}

/**
 * El router de datos crea un `Request` con la señal de aborto de jsdom, que el
 * `Request` de Node (undici) rechaza. En estas pruebas se crea sin señal: no hay
 * cargadores que abortar.
 */
class RequestWithoutSignal extends Request {
  constructor(input: RequestInfo | URL, init: RequestInit = {}) {
    const { signal, ...rest } = init;
    void signal;
    super(input, rest);
  }
}

beforeEach(() => {
  vi.stubGlobal('Request', RequestWithoutSignal);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithDataRouter() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Editor /> },
      { path: '/otra', element: <p>Otra pantalla</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <ThemeProvider theme={lightTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

describe('UnsavedChangesGuard (03 §E.8: aviso al abandonar con cambios)', () => {
  it('sin cambios no bloquea', async () => {
    renderWithDataRouter();
    await userEvent.click(screen.getByRole('link', { name: 'Salir' }));
    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
  });

  it('con cambios pregunta antes de cambiar de pantalla; "Seguir editando" se queda y "Salir sin guardar" sale', async () => {
    const router = renderWithDataRouter();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    // Cambiar filtros en la URL de la misma pantalla no pierde el borrador: no se bloquea.
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(router.state.location.search).toBe('?filtro=x');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Salir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambios sin guardar' });
    expect(dialog).toHaveTextContent('Tienes cambios sin guardar. Si sales ahora, se perderán.');
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/');

    await userEvent.click(screen.getByRole('link', { name: 'Salir' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
  });

  it('con cambios registra el aviso del navegador al recargar o cerrar (beforeunload)', async () => {
    renderWithDataRouter();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
