import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { ProjectDetailPage } from './ProjectDetailPage';
import type { ProjectDetail } from './projects.api';
import {
  bodyOf,
  FORM_OPTIONS,
  historyEntry,
  menu,
  page,
  productsPage,
  project,
  PROJECT,
  projectProduct,
  READ_ONLY,
  signInWith,
  signOut,
  simulateWideScreen,
} from './testing/project-fixtures';

const ALL_PERMISSIONS = [
  'proyectos.ver',
  'proyectos.crear',
  'proyectos.editar',
  'proyectos.eliminar',
  'oportunidades.ver',
  'forecast.ver',
  'actividades.ver',
  'clientes.ver',
  'productos.ver',
];

/** Lo que `CustomerPicker` (Módulo 2) necesita de `GET /customers/{id}`. */
const CUSTOMER = { id: 'c-1', crmCode: 'CLI-000001', legalName: 'Constructora Peña S.A.', country: { id: 'gt', isoCode: 'GT', name: 'Guatemala' } };

const SECTION_LABELS = ['General', 'Clasificación', 'Fase', 'Oportunidades', 'Resultados', 'Productos', 'Forecast', 'Seguimiento', 'Adjuntos', 'Historial'];

function LocationProbe() {
  const location = useLocation();
  return <p>{`En ${location.pathname}${location.search}`}</p>;
}

function renderPage(entry: string | { pathname: string; search?: string; state?: unknown } = '/proyectos/p-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/proyectos/:projectId" element={<ProjectDetailPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { initialEntries: [entry as unknown as string] },
  );
}

function detailApi(detail: ProjectDetail | (() => Response), extra: Record<string, RouteHandler> = {}, menuKeys: string[] = ['proyectos-buscar']): Mock {
  return mockApi({
    'GET /projects/p-1': typeof detail === 'function' ? detail : () => jsonResponse(detail),
    'GET /projects/form-options': () => jsonResponse(FORM_OPTIONS),
    'GET /me/menu': () => jsonResponse(menu(menuKeys)),
    'GET /projects/p-1/phase-history': () => page([]),
    'GET /projects/p-1/history': () => page([historyEntry()]),
    'GET /projects/p-1/products': () => productsPage([projectProduct()], { tonnage: '0.4020', quantitiesByUnit: [{ unit: projectProduct().unit, quantity: '120.0000' }] }),
    'GET /projects/p-1/attachments': () => page([]),
    ...extra,
  });
}

function requestedPaths(fetchMock: Mock): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname.replace(/^\/api\/v1/, ''));
}

beforeEach(() => {
  simulateWideScreen();
  signInWith(ALL_PERMISSIONS);
});
afterEach(signOut);

describe('ProjectDetailPage (F-11)', () => {
  it('inexistente, eliminado o fuera de alcance: "no existe o no tienes acceso" y vuelta a la búsqueda (AC-03.12)', async () => {
    detailApi(() => errorResponse(404, 'RESOURCE_NOT_FOUND'));

    renderPage();
    expect(await screen.findByText('Este proyecto no existe o no tienes acceso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la búsqueda' }));
    expect(await screen.findByText('En /proyectos')).toBeInTheDocument();
  });

  it('muestra las diez secciones; ?seccion=productos abre esa sección y sólo ella carga sus datos (AC-03.9, PF-03.14)', async () => {
    const fetchMock = detailApi(PROJECT);

    renderPage('/proyectos/p-1?seccion=productos');
    const tabs = await screen.findByRole('tablist', { name: 'Secciones del proyecto' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(SECTION_LABELS);
    expect(within(tabs).getByRole('tab', { name: 'Productos' })).toHaveAttribute('aria-selected', 'true');

    const products = await screen.findByRole('region', { name: 'Productos asociados' });
    expect(await within(products).findByText('VAR-3 · Varilla corrugada #3')).toBeInTheDocument();
    expect(requestedPaths(fetchMock)).not.toContain('/projects/p-1/history');

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Historial' }));
    expect(await screen.findByText('Nombre del proyecto: Torre → Torre Norte')).toBeInTheDocument();
  });

  it('un error en una sección no rompe la ficha y se puede reintentar (AC-03.9)', async () => {
    let calls = 0;
    detailApi(PROJECT, {
      'GET /projects/p-1/history': () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : page([historyEntry()]);
      },
    });

    renderPage('/proyectos/p-1?seccion=historial');
    const history = await screen.findByRole('region', { name: 'Historial de cambios' });
    expect(await within(history).findByText('No se pudo cargar el historial')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Torre Norte/ })).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'General' }));
    expect(await screen.findByRole('region', { name: 'Información general' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Historial' }));
    expect(await screen.findByText('Nombre del proyecto: Torre → Torre Norte')).toBeInTheDocument();
  });

  it('sin oportunidades.ver, forecast.ver ni permisos del Módulo 4, esas secciones no aparecen', async () => {
    signInWith(['proyectos.ver']);
    detailApi(project({ capabilities: READ_ONLY }));

    renderPage();
    const tabs = await screen.findByRole('tablist', { name: 'Secciones del proyecto' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['General', 'Clasificación', 'Fase', 'Productos', 'Adjuntos', 'Historial']);
  });

  it('con canEdit=false no hay acciones de edición en la cabecera ni en ninguna sección (AC-03.11, PF-03.17)', async () => {
    detailApi(project({ capabilities: READ_ONLY }));

    renderPage();
    expect(await screen.findByText('Puedes consultar este proyecto, pero no editarlo.')).toBeInTheDocument();
    for (const name of ['Editar', 'Duplicar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    const tabs = screen.getByRole('tablist');

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Clasificación' }));
    expect(await screen.findByText('Sin clasificar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clasificar' })).not.toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Fase' }));
    expect(await screen.findByText('Fase actual: Diseño')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualizar fase' })).not.toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Productos' }));
    expect(await screen.findByText('VAR-3 · Varilla corrugada #3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asociar producto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Quitar/ })).not.toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Adjuntos' }));
    expect(await screen.findByRole('region', { name: 'Adjuntos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir archivos' })).not.toBeInTheDocument();
  });

  it('Seguimiento sin el Módulo 4 en el menú: estado informativo y ninguna petición a /follow-ups ni /interactions (AC-03.16, PF-03.23)', async () => {
    const fetchMock = detailApi(PROJECT);

    renderPage('/proyectos/p-1?seccion=seguimiento');
    const followUp = await screen.findByRole('region', { name: 'Seguimiento comercial' });
    expect(await within(followUp).findByText('El seguimiento comercial estará disponible con el módulo de Actividad comercial.')).toBeInTheDocument();
    expect(requestedPaths(fetchMock).some((path) => path.startsWith('/follow-ups') || path.startsWith('/interactions'))).toBe(false);
  });

  it('las secciones de oportunidades, resultados y forecast son informativas y no llaman a sus endpoints', async () => {
    const fetchMock = detailApi(PROJECT);

    renderPage('/proyectos/p-1?seccion=resultados');
    const results = await screen.findByRole('region', { name: 'Resultados' });
    expect(within(results).getByText('Disponible próximamente')).toBeInTheDocument();
    expect(within(results).getByText('Ganadas')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Oportunidades' }));
    await userEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Forecast' }));
    expect(await screen.findByRole('region', { name: 'Forecast' })).toBeInTheDocument();
    expect(requestedPaths(fetchMock).some((path) => path.includes('/opportunities') || path.startsWith('/forecast'))).toBe(false);
  });

  it('muestra el aviso de alta y el enlace al proyecto de origen', async () => {
    detailApi(project({ duplicatedFrom: { id: 'p-0', code: 'PRY-2026-00001', name: 'Origen' } }));

    renderPage({ pathname: '/proyectos/p-1', state: { createdMessage: 'Proyecto PRY-2026-00042 creado.' } });
    expect(await screen.findByText('Proyecto PRY-2026-00042 creado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Proyecto duplicado de PRY-2026-00001' })).toHaveAttribute('href', '/proyectos/p-0');
    expect(screen.getByRole('link', { name: 'Constructora Peña S.A.' })).toHaveAttribute('href', '/clientes/c-1');
  });

  it('editar envía sólo lo cambiado y avisa (AC-03.10)', async () => {
    const fetchMock = detailApi(PROJECT, {
      'GET /customers/c-1': () => errorResponse(500, 'INTERNAL_ERROR'),
      'PATCH /projects/p-1': () => jsonResponse(project({ address: 'Zona 14' })),
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const form = await screen.findByRole('form', { name: 'Editar proyecto' });
    expect(within(form).getByLabelText('Asesor responsable')).toBeDisabled();
    expect(within(form).getAllByText('Solo quien puede administrar proyectos cambia este campo.')).toHaveLength(2);

    const address = within(form).getByLabelText('Dirección');
    await userEvent.clear(address);
    await userEvent.type(address, 'Zona 14');
    await userEvent.clear(within(form).getByLabelText('Ciudad o ubicación'));
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Proyecto PRY-2026-00042 actualizado.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, 'PATCH', '/projects/p-1')[0])).toEqual({ address: 'Zona 14', city: null });
  });

  it('un cambio de cliente bloqueado se explica bajo el campo (AC-03.15)', async () => {
    detailApi(PROJECT, {
      'GET /customers/c-1': () => jsonResponse(CUSTOMER),
      'PATCH /projects/p-1': () => errorResponse(409, 'PROJECT_CUSTOMER_LOCKED', [{ field: 'customerId', dependency: 'visits', count: 2 }]),
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const form = await screen.findByRole('form', { name: 'Editar proyecto' });
    await userEvent.type(within(form).getByLabelText('Dirección'), ' B');
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(form).findByText('No se puede cambiar el cliente: el proyecto tiene visitas o actividades vinculadas.')).toBeInTheDocument();
    expect(within(form).getByText('No se puede cambiar: hay visitas o actividades vinculadas.')).toBeInTheDocument();
  });

  it('eliminar con hijos activos muestra los bloqueos; sin ellos vuelve a la búsqueda (AC-03.14)', async () => {
    let calls = 0;
    const fetchMock = detailApi(project({ capabilities: { ...PROJECT.capabilities, canDelete: true } }), {
      'DELETE /projects/p-1': () => {
        calls += 1;
        return calls === 1
          ? errorResponse(409, 'PROJECT_HAS_ACTIVE_CHILDREN', [
              { dependency: 'openOpportunities', count: 2 },
              { dependency: 'nonCancelledVisits', count: 1 },
            ])
          : new Response(null, { status: 204 });
      },
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar proyecto' });
    expect(within(dialog).getByText(/La eliminación es lógica/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await within(dialog).findByText('No se puede eliminar: el proyecto tiene 2 oportunidades abiertas, 1 visita no cancelada.')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('En /proyectos')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'DELETE', '/projects/p-1')).toHaveLength(2);
  });

  it('duplicar navega a la ficha nueva con el aviso (F-12)', async () => {
    detailApi(PROJECT, {
      'GET /customers/c-1': () => errorResponse(500, 'INTERNAL_ERROR'),
      'POST /projects/p-1/duplicate': () => jsonResponse(project({ id: 'p-9', code: 'PRY-2026-00099' }), 201),
      'GET /projects/p-9': () => jsonResponse(project({ id: 'p-9', code: 'PRY-2026-00099' })),
    });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Duplicar proyecto' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usar la sugerencia' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar' }));
    expect(await screen.findByText('Proyecto PRY-2026-00099 creado a partir de PRY-2026-00042.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /PRY-2026-00099/ })).toBeInTheDocument();
  });
});
