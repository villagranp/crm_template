import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';

import { RequireAuth } from './RequireAuth';

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <p>login desde: {state?.from ?? 'ninguna'}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={ROUTE_PATHS.login} element={<LoginProbe />} />
        <Route
          path="/administracion/minuto-seguridad"
          element={
            <RequireAuth>
              <p>contenido</p>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const anonymous = { status: 'anonymous' as const, user: null, passwordChangeRequired: false, errorMessage: null };

describe('RequireAuth: ruta de retorno', () => {
  afterEach(() => useAuthStore.setState({ ...anonymous, signedOutByUser: false }));

  it('sesión caducada o acceso directo: recuerda la ruta para volver al sitio', () => {
    useAuthStore.setState({ ...anonymous, signedOutByUser: false });
    renderAt('/administracion/minuto-seguridad');
    expect(screen.getByText('login desde: /administracion/minuto-seguridad')).toBeInTheDocument();
  });

  it('cierre voluntario: no recuerda la ruta, para que el siguiente usuario empiece en el inicio', () => {
    useAuthStore.setState({ ...anonymous, signedOutByUser: true });
    renderAt('/administracion/minuto-seguridad');
    expect(screen.getByText('login desde: ninguna')).toBeInTheDocument();
  });
});
