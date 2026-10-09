import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MenuModule } from '@/services/access';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { AppShell } from './AppShell';

const MENU: MenuModule[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: 'dashboard',
    order: 10,
    isSystem: false,
    options: [
      {
        id: 'o-1',
        key: 'inicio',
        label: 'Panel de control',
        icon: 'dashboard',
        path: '/',
        order: 10,
        requiredPermission: null,
        children: [],
      },
    ],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: 'list_alt',
    order: 20,
    isSystem: false,
    options: [
      {
        id: 'o-2',
        key: 'cotizaciones',
        label: 'Cotizaciones',
        icon: null,
        path: '/ventas/cotizaciones',
        order: 10,
        requiredPermission: null,
        children: [],
      },
    ],
  },
  {
    key: 'administracion',
    label: 'Administración',
    icon: 'settings',
    order: 90,
    isSystem: true,
    options: [
      {
        id: 'o-3',
        key: 'usuarios',
        label: 'Usuarios',
        icon: 'manage_accounts',
        path: '/administracion/usuarios',
        order: 10,
        requiredPermission: 'usuarios.ver',
        children: [],
      },
      {
        id: 'o-4',
        key: 'roles',
        label: 'Roles y permisos',
        icon: 'admin_panel_settings',
        path: '/administracion/roles',
        order: 20,
        requiredPermission: 'roles.ver',
        children: [],
      },
    ],
  },
];

/** jsdom no implementa `matchMedia`: se simula una pantalla según su ancho. */
function stubViewport(width: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const minWidth = /min-width:\s*([\d.]+)px/.exec(query);
      return {
        matches: minWidth ? width >= Number(minWidth[1]) : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

function renderShell(path: string) {
  mockApi({ 'GET /me/menu': () => jsonResponse(MENU) });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<p>Contenido de inicio</p>} />
        <Route path="*" element={<p>Contenido de módulo</p>} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  );
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'u-1',
      displayName: 'Javier Rosas',
      email: 'javier@example.test',
      roles: ['ADMIN'],
      permissions: [],
    },
    passwordChangeRequired: false,
    errorMessage: null,
  });
  useUiStore.setState({ sidebarMini: false, sidebarOpenMobile: false });
});

afterEach(() => {
  useAuthStore.setState({
    status: 'anonymous',
    user: null,
    passwordChangeRequired: false,
    errorMessage: null,
  });
});

describe('AppShell en escritorio', () => {
  beforeEach(() => stubViewport(1440));

  it('agrupa el menú en Principal, Módulos y Sistema según /me/menu', async () => {
    renderShell('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });

    expect(within(nav).getByRole('heading', { name: 'Principal' })).toBeInTheDocument();
    expect(within(nav).getByRole('heading', { name: 'Módulos' })).toBeInTheDocument();
    expect(within(nav).getByRole('heading', { name: 'Sistema' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Panel de control' })).toHaveClass('active');
    expect(within(nav).getByRole('button', { name: 'Ventas' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('despliega el grupo que contiene la ruta actual y marca la opción activa', async () => {
    renderShell('/administracion/usuarios');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });

    const group = within(nav).getByRole('button', { name: 'Administración' });
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(group).toHaveAttribute('data-active', 'true');
    expect(within(nav).getByRole('link', { name: 'Usuarios' })).toHaveClass('active');
    expect(within(nav).getByRole('link', { name: 'Roles y permisos' })).not.toHaveClass('active');
  });

  it('abre y cierra un grupo al pulsarlo', async () => {
    const user = userEvent.setup();
    renderShell('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });

    await user.click(within(nav).getByRole('button', { name: 'Ventas' }));

    expect(within(nav).getByRole('button', { name: 'Ventas' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(nav).getByRole('link', { name: 'Cotizaciones' })).toHaveAttribute(
      'href',
      '/ventas/cotizaciones',
    );
  });

  it('pinta una píldora por módulo que lleva a su primera opción, con el módulo actual activo', async () => {
    renderShell('/administracion/roles');
    const modules = await screen.findByRole('navigation', { name: 'Módulos' });

    const admin = within(modules).getByRole('link', { name: 'Administración' });
    expect(admin).toHaveAttribute('href', '/administracion/usuarios');
    expect(admin).toHaveAttribute('aria-current', 'true');
    expect(within(modules).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('muestra la tarjeta del usuario al pie del menú', async () => {
    renderShell('/');
    const sidebar = await screen.findByRole('complementary', { name: 'Menú lateral' });

    expect(within(sidebar).getByText('Javier Rosas')).toBeInTheDocument();
    expect(within(sidebar).getByText('javier@example.test')).toBeInTheDocument();
  });

  it('en modo minificado deja sólo iconos con nombre accesible', async () => {
    useUiStore.setState({ sidebarMini: true });
    renderShell('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });

    expect(within(nav).queryByRole('heading', { name: 'Principal' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Panel de control' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Administración' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
  });

  it('el menú de usuario ofrece cambiar la contraseña y cerrar sesión', async () => {
    const user = userEvent.setup();
    renderShell('/');

    await user.click(await screen.findByRole('button', { name: 'Menú de usuario' }));

    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mi perfil/i })).not.toBeInTheDocument();
  });
});

describe('AppShell en móvil', () => {
  beforeEach(() => stubViewport(390));

  it('la barra inferior lleva un elemento por módulo y "Menú" abre el cajón', async () => {
    const user = userEvent.setup();
    renderShell('/administracion/usuarios');
    const bottom = await screen.findByRole('navigation', { name: 'Navegación rápida' });

    expect(within(bottom).getByRole('link', { name: 'Administración' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(bottom).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');

    await user.click(within(bottom).getByRole('button', { name: 'Menú' }));

    await waitFor(() => expect(useUiStore.getState().sidebarOpenMobile).toBe(true));
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toHaveClass('active');
  });
});
