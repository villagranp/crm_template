import { renderHook, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { useCan, usePermission } from '@/hooks/use-permission';
import { useAuthStore } from '@/stores/auth.store';
import { renderWithProviders } from '@/test/render-with-providers';

import { RequirePermission } from './RequirePermission';

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

function renderGuardedRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/acceso" element={<p>Pantalla de acceso</p>} />
      <Route
        path="/administracion/roles"
        element={
          <RequirePermission permission="roles.ver">
            <p>Contenido protegido</p>
          </RequirePermission>
        }
      />
    </Routes>,
    { initialEntries: ['/administracion/roles'] },
  );
}

afterEach(() => {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

describe('RequirePermission', () => {
  it('muestra el contenido cuando el usuario tiene el permiso', () => {
    signInWith(['roles.ver']);
    renderGuardedRoute();

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  it('muestra "Sin acceso" sin redirigir ni montar el contenido cuando falta el permiso', () => {
    signInWith(['usuarios.ver']);
    renderGuardedRoute();

    expect(screen.getByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/');
  });

  it('no revela qué permiso falta', () => {
    signInWith([]);
    renderGuardedRoute();

    expect(screen.queryByText(/roles\.ver/)).not.toBeInTheDocument();
  });

  it('sin sesión lleva a la pantalla de acceso', () => {
    renderGuardedRoute();

    expect(screen.getByText('Pantalla de acceso')).toBeInTheDocument();
  });

  it('mientras se restaura la sesión muestra el cargador, no "Sin acceso"', () => {
    useAuthStore.setState({
      status: 'initializing',
      user: null,
      passwordChangeRequired: false,
      errorMessage: null,
    });
    renderGuardedRoute();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sin acceso/i })).not.toBeInTheDocument();
  });
});

describe('usePermission / useCan', () => {
  it('responden según los permisos efectivos de la sesión', () => {
    signInWith(['usuarios.ver', 'usuarios.editar']);

    expect(renderHook(() => usePermission('usuarios.ver')).result.current).toBe(true);
    expect(renderHook(() => usePermission('usuarios.eliminar')).result.current).toBe(false);

    const can = renderHook(() => useCan()).result.current;
    expect(can('usuarios.editar')).toBe(true);
    expect(can('roles.ver')).toBe(false);
  });

  it('sin sesión no conceden nada', () => {
    expect(renderHook(() => useCan()).result.current('usuarios.ver')).toBe(false);
  });
});
