import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import { callsTo, errorResponse, jsonResponse, mockApi, type RouteHandler } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import type { AuthenticationSettings, ParameterGroup, SystemParameter } from './parameters.api';
import { ParametersPage } from './ParametersPage';

function parameter(overrides: Partial<SystemParameter>): SystemParameter {
  return {
    key: 'app.nombre',
    value: 'Aplicación',
    type: 'STRING',
    group: 'general',
    name: 'Nombre de la aplicación',
    description: null,
    isPublic: true,
    isSystem: true,
    requiresConfigurePermission: false,
    requiresConfigure: false,
    readOnly: false,
    allowedValues: null,
    editor: null,
    editorOptions: null,
    range: null,
    updatedAt: '2026-10-08T10:00:00.000Z',
    ...overrides,
  };
}

const LOCKOUT = parameter({
  key: 'seguridad.minutos_bloqueo',
  value: '15',
  type: 'NUMBER',
  group: 'seguridad',
  name: 'Minutos de bloqueo',
  isPublic: false,
  requiresConfigurePermission: true,
  requiresConfigure: true,
  editor: 'number',
  range: { min: 1, max: 1440 },
});

const BASE_CURRENCY = parameter({
  key: 'crm.moneda_base',
  value: 'USD',
  group: 'crm',
  name: 'Moneda base',
  isPublic: false,
  requiresConfigurePermission: true,
  requiresConfigure: true,
  readOnly: true,
  allowedValues: ['USD'],
  editor: 'text',
});

const RATE_AGE = parameter({
  key: 'crm.tipos_cambio.dias_aviso_antiguedad',
  value: '31',
  type: 'NUMBER',
  group: 'crm',
  name: 'Días de aviso de antigüedad',
  isPublic: false,
  editor: 'number',
  range: { min: 1, max: 366 },
});

const CODE_UNIQUENESS = parameter({
  key: 'crm.clientes.unicidad_codigo',
  value: 'PAIS',
  group: 'crm',
  name: 'Unicidad del código de cliente',
  isPublic: false,
  allowedValues: ['PAIS', 'GLOBAL'],
  editor: 'select',
});

const CUSTOMER_DUPLICATES = parameter({
  key: 'crm.clientes.reglas_duplicidad',
  value: '{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}',
  type: 'JSON',
  group: 'crm',
  name: 'Reglas de duplicidad de clientes',
  isPublic: false,
  editor: 'duplicate-rules',
});

const REQUIRED_FIELDS = parameter({
  key: 'crm.campos_obligatorios',
  value: JSON.stringify({
    customer: ['legalName', 'countryId', 'statusId', 'salesOwnerId'],
    project: ['name', 'customerId', 'countryId', 'ownerId'],
    visit: ['customerId', 'scheduledStartAt', 'ownerId', 'objective'],
    activity: ['typeId', 'subject', 'customerId', 'ownerId', 'priorityId'],
  }),
  type: 'JSON',
  group: 'crm',
  name: 'Campos obligatorios',
  isPublic: false,
  editor: 'required-fields',
});

const DASHBOARD_CARDS_VALUE = JSON.stringify({
  blocks: [
    { key: 'safety-minute', visible: true },
    { key: 'hero', visible: true },
    { key: 'alerts', visible: true },
  ],
  kpis: [
    { key: 'projects-active', visible: true },
    { key: 'forecast', visible: true },
  ],
});

const DASHBOARD_CARDS = parameter({
  key: 'ui.inicio.tarjetas',
  value: DASHBOARD_CARDS_VALUE,
  type: 'JSON',
  group: 'interfaz',
  name: 'Tarjetas del panel de Inicio',
  isPublic: false,
  editor: 'dashboard-cards',
});

const SEARCH_BUTTON = parameter({
  key: 'ui.barra_superior.buscar',
  value: 'false',
  type: 'BOOLEAN',
  group: 'interfaz',
  name: 'Botón de búsqueda',
  isPublic: false,
  editor: 'boolean',
});

const REMOVED = parameter({ key: 'crm.moneda_por_defecto', group: 'crm', name: 'Moneda por defecto (eliminado)' });

const GROUPS: ParameterGroup[] = [
  { group: 'crm', parameters: [BASE_CURRENCY, RATE_AGE, CODE_UNIQUENESS, CUSTOMER_DUPLICATES, REQUIRED_FIELDS, REMOVED] },
  { group: 'general', parameters: [parameter({})] },
  { group: 'seguridad', parameters: [LOCKOUT] },
  { group: 'interfaz', parameters: [DASHBOARD_CARDS, SEARCH_BUTTON] },
];

const LOCAL_AUTH: AuthenticationSettings = {
  provider: 'local',
  localLoginEnabled: true,
  securityParameterKeys: ['seguridad.minutos_bloqueo'],
};

function signInWith(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Persona de Prueba', roles: ['ADMIN'], permissions },
    passwordChangeRequired: false,
    errorMessage: null,
  });
}

function api(extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /parameters': () => jsonResponse({ data: GROUPS }),
    'GET /parameters/authentication': () => jsonResponse(LOCAL_AUTH),
    ...extra,
  });
}

afterEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, passwordChangeRequired: false, errorMessage: null });
});

describe('ParametersPage', () => {
  it('agrupa por prefijo, con Acceso primero, y no muestra claves eliminadas (AC-07.26)', async () => {
    signInWith(['parametros.ver']);
    api();

    renderWithProviders(<ParametersPage />);

    const access = await screen.findByRole('region', { name: 'Acceso' });
    expect(within(access).getByLabelText('Valor de Minutos de bloqueo')).toHaveTextContent('15');
    expect(within(screen.getByRole('region', { name: 'CRM — Duplicidad' })).getByText('Unicidad del código de cliente')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Campos y valores por defecto' })).getByText('Campos obligatorios')).toBeInTheDocument();
    const forecast = screen.getByRole('region', { name: 'Forecast, conversiones y moneda' });
    expect(within(forecast).getByText('Moneda base')).toBeInTheDocument();
    expect(within(forecast).getByRole('link', { name: 'Tipos de cambio' })).toHaveAttribute('href', '/administracion/tipos-cambio');
    expect(screen.getByRole('region', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByText('Moneda por defecto (eliminado)')).not.toBeInTheDocument();

    const regions = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter(Boolean);
    expect(regions[0]).toBe('Acceso');
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it('crm.moneda_base es de sólo lectura: no tiene control de edición (AC-07.42)', async () => {
    signInWith(['parametros.ver', 'parametros.editar', 'parametros.configurar']);
    api();

    renderWithProviders(<ParametersPage />);

    const forecast = await screen.findByRole('region', { name: 'Forecast, conversiones y moneda' });
    expect(within(forecast).getByText('Sólo lectura')).toBeInTheDocument();
    expect(within(forecast).queryByRole('button', { name: 'Editar Moneda base' })).not.toBeInTheDocument();
    expect(within(forecast).getByRole('button', { name: 'Editar Días de aviso de antigüedad' })).toBeInTheDocument();
  });

  it('con parametros.editar sin parametros.configurar, los que lo exigen quedan bloqueados con explicación', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    api();

    renderWithProviders(<ParametersPage />);

    expect(await screen.findByRole('button', { name: 'Editar Nombre de la aplicación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Minutos de bloqueo' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sólo lectura: requiere permiso de configuración')).toBeInTheDocument();
    expect(screen.getByText('Requiere el permiso de configuración (parametros.configurar).')).toBeInTheDocument();
  });

  it('valida el rango que trae la API y guarda un valor válido', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const fetchMock = api({
      'PATCH /parameters/crm.tipos_cambio.dias_aviso_antiguedad': () => jsonResponse({ ...RATE_AGE, value: '45' }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Días de aviso de antigüedad' }));

    const dialog = screen.getByRole('dialog', { name: 'Editar «Días de aviso de antigüedad»' });
    const input = within(dialog).getByLabelText('Valor');
    await user.clear(input);
    await user.type(input, '367');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText('Debe estar entre 1 y 366.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'PATCH', '/parameters/crm.tipos_cambio.dias_aviso_antiguedad')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '45');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = callsTo(fetchMock, 'PATCH', '/parameters/crm.tipos_cambio.dias_aviso_antiguedad');
    expect(JSON.parse(String(patch?.body))).toEqual({ value: '45' });
  });

  it('un parámetro con allowedValues se edita con un selector', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const fetchMock = api({
      'PATCH /parameters/crm.clientes.unicidad_codigo': () => jsonResponse({ ...CODE_UNIQUENESS, value: 'GLOBAL' }),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Unicidad del código de cliente' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Valor' }));
    await user.click(await screen.findByRole('option', { name: 'GLOBAL' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/crm.clientes.unicidad_codigo')).toHaveLength(1));
    const [patch] = callsTo(fetchMock, 'PATCH', '/parameters/crm.clientes.unicidad_codigo');
    expect(JSON.parse(String(patch?.body))).toEqual({ value: 'GLOBAL' });
  });

  it('reglas de duplicidad: el NIT sólo ofrece Avisar o No comprobar (DM-4)', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const fetchMock = api({
      'PATCH /parameters/crm.clientes.reglas_duplicidad': () => jsonResponse(CUSTOMER_DUPLICATES),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Reglas de duplicidad de clientes' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'NIT' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByRole('option', { name: 'Bloquear' })).not.toBeInTheDocument();
    await user.click(within(listbox).getByRole('option', { name: 'No comprobar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/crm.clientes.reglas_duplicidad')).toHaveLength(1));
    const [patch] = callsTo(fetchMock, 'PATCH', '/parameters/crm.clientes.reglas_duplicidad');
    const body = JSON.parse(String(patch?.body)) as { value: string };
    expect(JSON.parse(body.value)).toEqual({ razonSocialNormalizada: 'AVISAR', nit: 'NO' });
  });

  it('editor de campos obligatorios: añade un campo y los de base están bloqueados (PF-07.13)', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const fetchMock = api({
      'PATCH /parameters/crm.campos_obligatorios': () => jsonResponse(REQUIRED_FIELDS),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Campos obligatorios' }));
    const dialog = screen.getByRole('dialog');
    const customer = within(dialog).getByRole('group', { name: 'Cliente' });

    const legalName = within(customer).getByRole('checkbox', { name: 'Razón social (base)' });
    expect(legalName).toBeChecked();
    expect(legalName).toBeDisabled();

    const taxId = within(customer).getByRole('checkbox', { name: 'NIT' });
    expect(taxId).not.toBeChecked();
    await user.click(taxId);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/crm.campos_obligatorios')).toHaveLength(1));
    const [patch] = callsTo(fetchMock, 'PATCH', '/parameters/crm.campos_obligatorios');
    const value = JSON.parse((JSON.parse(String(patch?.body)) as { value: string }).value) as Record<string, string[]>;
    expect(value.customer).toEqual(['legalName', 'taxId', 'countryId', 'statusId', 'salesOwnerId']);
    expect(value.project).toEqual(['name', 'customerId', 'countryId', 'ownerId']);
  });

  it('muestra el 422 del servidor con su motivo', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    api({
      'PATCH /parameters/app.nombre': () =>
        errorResponse(422, 'INVALID_PARAMETER_VALUE', [{ field: 'value', issue: 'Debe tener entre 1 y 1000 caracteres' }]),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Nombre de la aplicación' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Valor'), ' nuevo');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialog).findByText(/El valor no es válido para el tipo de este parámetro\. Debe tener entre 1 y 1000 caracteres/),
    ).toBeInTheDocument();
  });

  it('un error de carga se puede reintentar', async () => {
    signInWith(['parametros.ver']);
    mockApi({ 'GET /parameters': () => errorResponse(403, 'PERMISSION_DENIED') });

    renderWithProviders(<ParametersPage />);

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
  it('agrupa los ui.* en «Interfaz» y resume la composición por defecto en lugar del JSON', async () => {
    signInWith(['parametros.ver']);
    api();

    renderWithProviders(<ParametersPage />);

    const section = await screen.findByRole('region', { name: 'Interfaz' });
    expect(within(section).getByText('Botón de búsqueda')).toBeInTheDocument();
    expect(within(section).getByLabelText('Valor de Tarjetas del panel de Inicio')).toHaveTextContent(
      '3 bloques y 2 indicadores (0 ocultos)',
    );
  });

  it('resume los campos obligatorios por entidad en vez de volcar el JSON y deja el valor completo en el title', async () => {
    signInWith(['parametros.ver']);
    api();

    renderWithProviders(<ParametersPage />);

    const section = await screen.findByRole('region', { name: 'Campos y valores por defecto' });
    const value = within(section).getByLabelText('Valor de Campos obligatorios');
    expect(value).toHaveTextContent('Cliente 4 · Proyecto 4 · Visita 4 · Actividad 5 campos');
    expect(value).not.toHaveTextContent('legalName');
    // El JSON completo sigue disponible al pasar el cursor.
    expect(value).toHaveAttribute('title', expect.stringContaining('"legalName"'));
  });

  it('PF-AJ1.4c: edita la composición por defecto con DashboardCardsEditor y guarda el JSON', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const fetchMock = api({
      'PATCH /parameters/ui.inicio.tarjetas': () => jsonResponse(DASHBOARD_CARDS),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Tarjetas del panel de Inicio' }));

    const dialog = screen.getByRole('dialog', { name: 'Editar «Tarjetas del panel de Inicio»' });
    expect(within(dialog).getByText(/composición de quienes no personalizaron su panel/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Visible: Alertas y pendientes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Bajar Saludo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/ui.inicio.tarjetas')).toHaveLength(1));
    const [call] = callsTo(fetchMock, 'PATCH', '/parameters/ui.inicio.tarjetas');
    const sent = JSON.parse((JSON.parse(String(call?.body)) as { value: string }).value) as {
      blocks: { key: string; visible: boolean }[];
    };
    expect(sent.blocks).toEqual([
      { key: 'safety-minute', visible: true },
      { key: 'alerts', visible: false },
      { key: 'hero', visible: true },
    ]);
  });

  it('el editor del panel completa con editorOptions las claves nuevas y las envía visibles al final', async () => {
    signInWith(['parametros.ver', 'parametros.editar']);
    const withOptions = {
      ...DASHBOARD_CARDS,
      editorOptions: {
        blocks: ['safety-minute', 'hero', 'alerts', 'future-block'],
        kpis: ['projects-active', 'forecast', 'future-kpi'],
        lockedVisibleBlocks: ['safety-minute'],
      },
    };
    const fetchMock = api({
      'GET /parameters': () =>
        jsonResponse({ data: [{ group: 'interfaz', parameters: [withOptions] }] }),
      'PATCH /parameters/ui.inicio.tarjetas': () => jsonResponse(withOptions),
    });
    const user = userEvent.setup();

    renderWithProviders(<ParametersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar Tarjetas del panel de Inicio' }));

    const dialog = screen.getByRole('dialog', { name: 'Editar «Tarjetas del panel de Inicio»' });
    expect(within(within(dialog).getByRole('list', { name: 'Bloques por defecto' })).getAllByRole('listitem')).toHaveLength(4);
    expect(within(dialog).getByRole('checkbox', { name: 'Visible: future-block' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Visible: Alertas y pendientes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/parameters/ui.inicio.tarjetas')).toHaveLength(1));
    const [call] = callsTo(fetchMock, 'PATCH', '/parameters/ui.inicio.tarjetas');
    const sent = JSON.parse((JSON.parse(String(call?.body)) as { value: string }).value) as {
      blocks: { key: string }[];
      kpis: { key: string; visible: boolean }[];
    };
    expect(sent.blocks.map((entry) => entry.key)).toEqual(['safety-minute', 'hero', 'alerts', 'future-block']);
    expect(sent.kpis.at(-1)).toEqual({ key: 'future-kpi', visible: true });
  });
});
