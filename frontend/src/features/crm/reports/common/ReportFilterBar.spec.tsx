import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { todayInTimeZone } from '@/features/crm/commercial-activity/entry-points';
import { errorResponse, jsonResponse, mockApi } from '@/test/api-mocks';
import { renderWithProviders } from '@/test/render-with-providers';

import { callCount, CUSTOMER, FILTER_OPTIONS, PROJECT, signInWith, signOut } from '../testing/report-fixtures';

import { ReportFilterBar, type ReportFilterField } from './ReportFilterBar';
import { namedOptions, ownerOptions } from './report-filter-options';
import { presetPeriod } from './report-period';
import { useReportQueryState, type ReportPeriodMode } from './use-report-query-state';

const FILTER_KEYS = ['ownerId', 'countryId', 'city'] as const;
const SORT_FIELDS = ['updatedAt'] as const;
const DEFAULT_SORT = { field: 'updatedAt', direction: 'desc' } as const;
const FIELDS: ReportFilterField[] = [
  { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(FILTER_OPTIONS.owners) },
  { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(FILTER_OPTIONS.countries) },
  { key: 'city', label: 'Ciudad', kind: 'text' },
];

function Harness({ period }: { period: ReportPeriodMode }) {
  const state = useReportQueryState({ filterKeys: FILTER_KEYS, sortableFields: SORT_FIELDS, defaultSort: DEFAULT_SORT, period });
  const location = useLocation();
  return (
    <>
      <ReportFilterBar
        label="Filtros de prueba"
        fields={FIELDS}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={
          period.kind === 'dates'
            ? {
                kind: 'dates',
                period: state.period,
                isDefault: state.isDefaultPeriod,
                today: state.today,
                dateBases: [
                  { value: 'IDENTIFIED', label: 'Fecha de identificación' },
                  { value: 'DECIDED', label: 'Fecha de decisión' },
                  { value: 'SCHEDULED', label: 'Fecha planificada' },
                ],
                defaultDateBasis: period.defaultDateBasis,
                allowEmpty: period.defaultPreset === null,
              }
            : { kind: 'months', appliedRange: null }
        }
        search={{ value: state.table.searchInput, onChange: state.table.setSearchInput, label: 'Buscar' }}
      />
      <p data-testid="location">{location.search}</p>
      <p data-testid="filter-query">{JSON.stringify(state.filterQuery)}</p>
      <p data-testid="export-query">{JSON.stringify(state.exportQuery)}</p>
    </>
  );
}

const OPTIONAL_PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: null, defaultDateBasis: 'IDENTIFIED' };
const MONTH_DEFAULT: ReportPeriodMode = { kind: 'dates', defaultPreset: 'CURRENT_MONTH', defaultDateBasis: 'SCHEDULED' };

function renderBar(period: ReportPeriodMode, initialEntry = '/reportes/x') {
  return renderWithProviders(<Harness period={period} />, { initialEntries: [initialEntry] });
}

function searchParams(): URLSearchParams {
  return new URLSearchParams(screen.getByTestId('location').textContent ?? '');
}

beforeEach(() => signInWith(['reportes.ver']));
afterEach(signOut);

describe('ReportFilterBar + useReportQueryState (05 E.1, PF-05.34)', () => {
  it('aplica los filtros a la URL con los nombres de la API, los muestra como chips y "Limpiar" los quita', async () => {
    const user = userEvent.setup();
    renderBar(OPTIONAL_PERIOD);

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de prueba' });
    await user.click(within(form).getByRole('combobox', { name: 'País' }));
    await user.click(await screen.findByRole('option', { name: 'Guatemala' }));
    await user.click(within(form).getByRole('combobox', { name: 'Asesor' }));
    await user.click(await screen.findByRole('option', { name: 'Ana Asesora' }));
    fireEvent.change(within(form).getByLabelText('Ciudad'), { target: { value: 'Mixco' } });
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(searchParams().get('countryId')).toBe('gt'));
    expect(Object.fromEntries(searchParams())).toEqual({ countryId: 'gt', ownerId: 'u-1', city: 'Mixco' });
    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('País: Guatemala')).toBeInTheDocument();
    expect(within(chips).getByText('Asesor: Ana Asesora')).toBeInTheDocument();
    expect(within(chips).getByText('Ciudad: Mixco')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument();

    await user.click(within(chips).getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(searchParams().toString()).toBe(''));
    expect(screen.queryByLabelText('Filtros activos')).not.toBeInTheDocument();
  });

  it('aplica un período libre con su base de fecha y lo muestra en el chip', async () => {
    const user = userEvent.setup();
    renderBar(OPTIONAL_PERIOD);

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de prueba' });
    fireEvent.change(within(form).getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(form).getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
    await user.click(within(form).getByRole('combobox', { name: 'Fecha del período' }));
    await user.click(await screen.findByRole('option', { name: 'Fecha de decisión' }));
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(searchParams().get('from')).toBe('2026-10-01'));
    expect(Object.fromEntries(searchParams())).toEqual({ from: '2026-10-01', to: '2026-10-15', dateBasis: 'DECIDED' });
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Período: 1 oct 2026 – 15 oct 2026 · Fecha de decisión')).toBeInTheDocument();
  });

  it('una URL compartida (o recargada) conserva los filtros y los envía tal cual', () => {
    renderBar(OPTIONAL_PERIOD, '/reportes/x?countryId=sv&from=2026-01-01&to=2026-03-31&dateBasis=IDENTIFIED&sortBy=updatedAt&sortOrder=asc');

    const chips = screen.getByLabelText('Filtros activos');
    expect(within(chips).getByText('País: El Salvador')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('filter-query').textContent ?? '{}')).toEqual({
      countryId: 'sv',
      from: '2026-01-01',
      to: '2026-03-31',
      dateBasis: 'IDENTIFIED',
    });
    // La exportación lleva los filtros, el orden de la pantalla y el formato, sin paginación (RN-05.44).
    expect(JSON.parse(screen.getByTestId('export-query').textContent ?? '{}')).toEqual({
      countryId: 'sv',
      from: '2026-01-01',
      to: '2026-03-31',
      dateBasis: 'IDENTIFIED',
      sortBy: 'updatedAt',
      sortOrder: 'asc',
      format: 'xlsx',
    });
  });

  it('quitar un chip quita solo ese filtro', async () => {
    const user = userEvent.setup();
    renderBar(OPTIONAL_PERIOD, '/reportes/x?countryId=gt&city=Mixco');

    const chip = within(screen.getByLabelText('Filtros activos')).getByText('Ciudad: Mixco').closest('.MuiChip-root') as HTMLElement;
    await user.click(within(chip).getByTestId('CancelIcon'));

    await waitFor(() => expect(searchParams().has('city')).toBe(false));
    expect(searchParams().get('countryId')).toBe('gt');
  });

  it('con período por defecto envía el mes en curso sin escribirlo en la URL, y su chip no se quita (C.2, P-05.4)', () => {
    renderBar(MONTH_DEFAULT);

    const expected = presetPeriod('CURRENT_MONTH', todayInTimeZone(undefined));
    expect(JSON.parse(screen.getByTestId('filter-query').textContent ?? '{}')).toEqual({ from: expected.from, to: expected.to });
    expect(searchParams().toString()).toBe('');
    const chip = within(screen.getByLabelText('Filtros activos')).getByText(/^Período: Mes en curso/).closest('.MuiChip-root') as HTMLElement;
    expect(within(chip).queryByTestId('CancelIcon')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument();
  });

  it('valida el período antes de aplicarlo y no navega con errores', async () => {
    const user = userEvent.setup();
    renderBar(OPTIONAL_PERIOD);

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de prueba' });
    fireEvent.change(within(form).getByLabelText('Desde'), { target: { value: '2026-10-31' } });
    fireEvent.change(within(form).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    expect(await within(form).findByText('La fecha inicial no puede ser posterior a la final.')).toBeInTheDocument();
    expect(searchParams().toString()).toBe('');
  });

  it('un atajo rellena el rango con fechas de la zona del negocio', async () => {
    const user = userEvent.setup();
    renderBar(OPTIONAL_PERIOD);

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de prueba' });
    await user.click(within(form).getByRole('combobox', { name: 'Período' }));
    await user.click(await screen.findByRole('option', { name: 'Año en curso' }));
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    const expected = presetPeriod('CURRENT_YEAR', todayInTimeZone(undefined));
    await waitFor(() => expect(searchParams().get('from')).toBe(expected.from));
    expect(searchParams().get('to')).toBe(expected.to);
    expect(within(screen.getByLabelText('Filtros activos')).getByText(/^Período: Año en curso/)).toBeInTheDocument();
  });

  it('el rango de meses del forecast valida el máximo de 24 meses', async () => {
    const user = userEvent.setup();
    renderBar({ kind: 'months' });

    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const form = screen.getByRole('search', { name: 'Filtros de prueba' });
    fireEvent.change(within(form).getByLabelText('Mes inicial'), { target: { value: '2026-11' } });
    fireEvent.change(within(form).getByLabelText('Mes final'), { target: { value: '2028-11' } });
    await user.click(within(form).getByRole('button', { name: 'Aplicar filtros' }));

    expect(await within(form).findByText('El rango no puede superar 24 meses.')).toBeInTheDocument();
    expect(searchParams().toString()).toBe('');
  });

  describe('chips de selectores remotos tras recargar (P-05.28)', () => {
    const REMOTE_FIELDS: ReportFilterField[] = [
      { key: 'customerId', label: 'Cliente', kind: 'customer' },
      { key: 'projectId', label: 'Proyecto', kind: 'project' },
      { key: 'productId', label: 'Producto', kind: 'product' },
    ];
    const NO_PERIOD_KEYS = ['customerId', 'projectId', 'productId'] as const;

    function RemoteHarness() {
      const state = useReportQueryState({ filterKeys: NO_PERIOD_KEYS, sortableFields: SORT_FIELDS, defaultSort: DEFAULT_SORT, period: null });
      return <ReportFilterBar label="Filtros remotos" fields={REMOTE_FIELDS} values={state.values} onApply={state.apply} onClear={state.clear} />;
    }

    const URL = '/reportes/x?customerId=c-1&projectId=p-1&productId=prod-9';

    it('con el permiso del selector, cliente y proyecto se nombran con su ficha; producto sigue "Seleccionado"', async () => {
      signInWith(['reportes.ver', 'clientes.ver', 'proyectos.ver', 'productos.ver']);
      mockApi({
        'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
        // Formas mínimas de las fichas (los selectores ya las piden para su valor preseleccionado: caché compartida).
        'GET /customers/c-1': () => jsonResponse({ id: CUSTOMER.id, crmCode: 'CLI-1', legalName: CUSTOMER.name, country: { id: 'gt', name: 'Guatemala' } }),
        'GET /projects/p-1': () => jsonResponse({ id: PROJECT.id, code: PROJECT.code, name: PROJECT.name, customer: { id: CUSTOMER.id, name: CUSTOMER.name } }),
      });
      renderWithProviders(<RemoteHarness />, { initialEntries: [URL] });

      const chips = screen.getByLabelText('Filtros activos');
      expect(await within(chips).findByText('Cliente: Constructora Peña S.A.')).toBeInTheDocument();
      expect(await within(chips).findByText('Proyecto: PRY-2026-00001 · Torre Norte')).toBeInTheDocument();
      expect(within(chips).getByText('Producto: Seleccionado')).toBeInTheDocument();
    });

    it('sin el permiso no se consulta la ficha; fuera de alcance (404) queda "Seleccionado"', async () => {
      signInWith(['reportes.ver', 'clientes.ver']);
      const fetchMock = mockApi({
        'GET /reports/filter-options': () => jsonResponse(FILTER_OPTIONS),
        'GET /customers/c-1': () => errorResponse(404, 'RESOURCE_NOT_FOUND'),
      });
      renderWithProviders(<RemoteHarness />, { initialEntries: [URL] });

      const chips = screen.getByLabelText('Filtros activos');
      await waitFor(() => expect(callCount(fetchMock, '/customers/c-1')).toBeGreaterThan(0));
      expect(within(chips).getByText('Cliente: Seleccionado')).toBeInTheDocument();
      expect(within(chips).getByText('Proyecto: Seleccionado')).toBeInTheDocument();
      expect(callCount(fetchMock, '/projects/p-1')).toBe(0);
    });
  });
});
