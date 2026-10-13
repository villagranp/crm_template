import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Alert, Button, Collapse, Paper, Stack, useMediaQuery, type Theme } from '@mui/material';
import { useCallback, useId, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FilterChips, ListToolbar, useTableQueryState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';

import { useActivityFormOptions } from '../activities/activities.queries';
import { NewActivityMenuButton } from '../activities/components/NewActivityMenuButton';
import type { AgendaItem, UserRef } from '../common/commercial-activity.api';
import { ACTIVITY_PERMISSIONS, VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';
import { planVisitPath } from '../common/commercial-paths';
import { todayInTimeZone } from '../common/date-time';

import { AGENDA_FILTER_KEYS, AGENDA_SORT_FIELDS, toAgendaApiFilters, type AgendaFilterKey, type AgendaFilterValues } from './agenda.api';
import { CALENDAR_MODES, isValidDayKey, type CalendarMode } from './calendar-grid';
import { AgendaCalendar, type AgendaEmptyContent } from './components/AgendaCalendar';
import { AgendaEventDrawer } from './components/AgendaEventDrawer';
import { ActiveAgendaFilterChips, AgendaFilters, type AgendaTypeOptions } from './components/AgendaFilters';
import { AgendaList } from './components/AgendaList';

const TITLE = 'Agenda';
const DEFAULT_SORT = { field: 'date', direction: 'asc' } as const;
const NO_TYPES: AgendaTypeOptions['activityTypes'] = [];

/** Parámetros de la URL propios de la agenda (los del listado los gestiona `useTableQueryState`). */
const PARAM = { view: 'view', mode: 'mode', date: 'date' } as const;
type AgendaView = 'calendar' | 'list';

const VIEW_OPTIONS = [
  { value: 'calendar', label: 'Calendario' },
  { value: 'list', label: 'Listado' },
] as const;

/** Filtros que solo usa el listado: el calendario fija su rango según la vista. */
const LIST_ONLY_FILTERS: readonly AgendaFilterKey[] = ['from', 'to'];

function isCalendarMode(value: string | null): value is CalendarMode {
  return CALENDAR_MODES.includes(value as CalendarMode);
}

/**
 * Agenda general (04 §E.2, F-21). Ruta `/actividad/agenda` protegida con
 * `actividades.ver`; opción de menú `actividad-agenda`.
 *
 * Calendario (Mes · Semana · Día, propio sin librería, D-04.1) o listado
 * paginado, con filtros comunes. Vista, modo, fecha de referencia, filtros,
 * orden y página viven en la URL: recargar conserva la vista (AC-04.3). En
 * `< md` la vista por defecto es Día con la tira de días de la semana.
 */
export function AgendaPage() {
  const navigate = useNavigate();
  const filtersPanelId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true });
  const isMobile = !isDesktop;

  const canViewActivities = usePermission(ACTIVITY_PERMISSIONS.view);
  const canViewVisits = usePermission(VISIT_PERMISSIONS.view);
  const canCreateActivity = usePermission(ACTIVITY_PERMISSIONS.create);
  const canCreateVisit = usePermission(VISIT_PERMISSIONS.create);
  const options = useActivityFormOptions(canViewActivities);

  const table = useTableQueryState<AgendaFilterKey>({
    filterKeys: AGENDA_FILTER_KEYS,
    sortableFields: AGENDA_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters } = table.state;

  const view: AgendaView = searchParams.get(PARAM.view) === 'list' ? 'list' : 'calendar';
  const modeParam = searchParams.get(PARAM.mode);
  const requestedMode: CalendarMode = isCalendarMode(modeParam) ? modeParam : isMobile ? 'day' : 'month';
  // En móvil la semana se presenta como Día con la tira de días (E.2).
  const mode: CalendarMode = isMobile && requestedMode === 'week' ? 'day' : requestedMode;
  const todayKey = todayInTimeZone();
  const dateParam = searchParams.get(PARAM.date);
  const referenceKey = isValidDayKey(dateParam) ? dateParam : todayKey;

  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Los chips y el contador solo cuentan los filtros que aplican a la vista actual.
  const visibleFilters: AgendaFilterValues = useMemo(
    () =>
      Object.fromEntries(
        AGENDA_FILTER_KEYS.flatMap((key) => (filters[key] && (view === 'list' || !LIST_ONLY_FILTERS.includes(key)) ? [[key, filters[key]]] : [])),
      ),
    [filters, view],
  );
  const activeFilterCount = Object.keys(visibleFilters).length;
  const hasFilters = activeFilterCount > 0;
  const [filtersOpen, setFiltersOpen] = useState(hasFilters);
  const apiFilters = useMemo(() => toAgendaApiFilters(filters), [filters]);
  const typeOptions: AgendaTypeOptions = useMemo(
    () => ({ includeVisit: canViewVisits, activityTypes: canViewActivities ? (options.data?.types ?? NO_TYPES) : NO_TYPES }),
    [canViewVisits, canViewActivities, options.data],
  );
  // Nombre del asesor filtrado: el elegido en el selector; tras recargar, "Seleccionado" (no hay endpoint por id).
  const [knownOwner, setKnownOwner] = useState<UserRef | null>(null);
  const ownerName = filters.ownerId && knownOwner?.id === filters.ownerId ? knownOwner.displayName : null;

  const updateParams = useCallback(
    (changes: Record<string, string | null>) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      }),
    [setSearchParams],
  );

  const clearFilters = () => table.setFilters(Object.fromEntries(AGENDA_FILTER_KEYS.map((key) => [key, undefined])));

  const planVisitButton = canCreateVisit ? (
    <Button variant="outlined" startIcon={<EventAvailableOutlinedIcon />} onClick={() => navigate(planVisitPath())}>
      Planificar visita
    </Button>
  ) : null;
  const newActivityButton = canCreateActivity ? <NewActivityMenuButton types={options.data?.types} /> : null;
  const headerActions =
    planVisitButton || newActivityButton ? (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {planVisitButton}
        {newActivityButton}
      </Stack>
    ) : undefined;

  const empty: AgendaEmptyContent = hasFilters
    ? {
        title: 'Ningún evento coincide',
        description: 'Prueba con otro periodo o quita algún filtro.',
        action: (
          <Button variant="outlined" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ),
      }
    : {
        title: 'No hay visitas ni actividades en este periodo',
        description: 'Aquí verás las visitas y actividades de tu alcance con fecha en el periodo.',
        icon: <CalendarMonthOutlinedIcon />,
        action: headerActions,
      };

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: TITLE })} actions={headerActions} />

      {notice ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Agenda" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              <FilterChips
                label="Vista de la agenda"
                value={view}
                options={VIEW_OPTIONS}
                onChange={(value) => updateParams({ [PARAM.view]: value === 'list' ? 'list' : null })}
              />
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<FilterListIcon />}
                aria-expanded={filtersOpen}
                aria-controls={filtersPanelId}
                onClick={() => setFiltersOpen((open) => !open)}
                sx={{ flex: '0 0 auto', borderColor: 'divider' }}
              >
                {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
              </Button>
            </>
          }
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <AgendaFilters
              values={visibleFilters}
              typeOptions={typeOptions}
              showDateRange={view === 'list'}
              ownerName={ownerName}
              onApply={(values, owner) => {
                setKnownOwner(owner);
                table.setFilters(values);
              }}
            />
          </Collapse>
          <ActiveAgendaFilterChips
            values={visibleFilters}
            typeOptions={typeOptions}
            ownerName={ownerName}
            onRemove={(key) => table.setFilter(key, undefined)}
            onClear={clearFilters}
          />
        </ListToolbar>

        {view === 'calendar' ? (
          <AgendaCalendar
            filters={apiFilters}
            mode={mode}
            referenceKey={referenceKey}
            todayKey={todayKey}
            isMobile={isMobile}
            types={options.data?.types}
            onOpen={setSelected}
            onNavigate={(key) => updateParams({ [PARAM.date]: key })}
            onModeChange={(nextMode, key) => updateParams(key ? { [PARAM.mode]: nextMode, [PARAM.date]: key } : { [PARAM.mode]: nextMode })}
            empty={empty}
          />
        ) : (
          <AgendaList table={table} filters={filters} types={options.data?.types} onOpen={setSelected} empty={empty} />
        )}
      </Paper>

      <AgendaEventDrawer
        item={selected}
        onClose={() => setSelected(null)}
        onCompleted={(saved) => {
          setSelected(null);
          setNotice(`Actividad ${saved.code} completada.`);
        }}
      />
    </>
  );
}
