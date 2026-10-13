import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMenu } from '@/hooks/use-menu';
import type { MenuModule, MenuOptionNode } from '@/services/access';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { menuEntries, quickAccessSelection } from '../quick-access';
import { resetSession, setSessionPermissions } from '../testing/dashboard-fixtures';
import { QuickAccess } from './QuickAccess';

function option(
  key: string,
  label: string,
  path: string | null,
  children: MenuOptionNode[] = [],
): MenuOptionNode {
  return {
    id: `o-${key}`,
    key,
    label,
    icon: null,
    path,
    order: 10,
    requiredPermission: null,
    children,
  };
}

function module(key: string, label: string, options: MenuOptionNode[]): MenuModule {
  return { key, label, icon: null, order: 10, isSystem: key === 'administracion', options };
}

/** Menú concedido: Clientes, Agenda y Usuarios (AC-01.3), con Administración antes que el CRM. */
const MENU: MenuModule[] = [
  module('inicio', 'Inicio', [option('inicio', 'Panel de control', '/')]),
  module('administracion', 'Administración', [
    option('usuarios', 'Usuarios', '/administracion/usuarios'),
  ]),
  module('clientes', 'Clientes', [option('clientes-buscar', 'Clientes', '/clientes')]),
  module('actividad-comercial', 'Actividad comercial', [
    option('actividad-grupo', 'Agenda y pendientes', null, [
      option('actividad-agenda', 'Agenda', '/actividad/agenda'),
    ]),
  ]),
];

function Harness() {
  return <QuickAccess menu={useMenu()} />;
}

beforeEach(() => setSessionPermissions([]));
afterEach(resetSession);

describe('QuickAccess (PF-01.3)', () => {
  it('muestra exactamente las opciones concedidas, sin el propio panel y con las del CRM primero', async () => {
    mockApi({ 'GET /me/menu': () => jsonResponse(MENU) });
    renderWithProviders(<Harness />);

    const quick = await screen.findByRole('region', { name: 'Accesos rápidos' });
    const links = await within(quick).findAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['ClientesClientes', '/clientes'],
      ['AgendaActividad comercial', '/actividad/agenda'],
      ['UsuariosAdministración', '/administracion/usuarios'],
    ]);
    expect(
      within(quick).queryByRole('link', { name: /panel de control/i }),
    ).not.toBeInTheDocument();

    const all = screen.getByRole('region', { name: 'Todos mis accesos' });
    expect(
      within(all)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Administración', 'Clientes', 'Actividad comercial']);
    expect(
      within(within(all).getByRole('region', { name: 'Actividad comercial' })).getByRole('link', {
        name: 'Agenda',
      }),
    ).toHaveAttribute('href', '/actividad/agenda');
  });

  it('como máximo 8 accesos rápidos; "Todos mis accesos" los lista todos', () => {
    const many = [
      module(
        'reportes',
        'Reportes',
        Array.from({ length: 10 }, (_, index) =>
          option(`r-${index}`, `Reporte ${index}`, `/r/${index}`),
        ),
      ),
    ];
    const entries = menuEntries(many);
    expect(entries).toHaveLength(10);
    expect(quickAccessSelection(entries)).toHaveLength(8);
    expect(quickAccessSelection(menuEntries(MENU)).map((entry) => entry.option.key)).toEqual([
      'clientes-buscar',
      'actividad-agenda',
      'usuarios',
    ]);
  });

  it('error del menú: mensaje con reintento (AC-01.6)', async () => {
    let calls = 0;
    mockApi({
      'GET /me/menu': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : jsonResponse(MENU);
      },
    });
    renderWithProviders(<Harness />);

    expect(await screen.findByText(/no se pudo cargar tu menú/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Todos mis accesos' })).toBeInTheDocument();
  });

  it('sin opciones: aviso para pedir acceso', async () => {
    mockApi({ 'GET /me/menu': () => jsonResponse([MENU[0]]) });
    renderWithProviders(<Harness />);

    expect(await screen.findByText(/todavía no tienes opciones asignadas/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Todos mis accesos' })).not.toBeInTheDocument();
  });
});
