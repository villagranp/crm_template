import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { Box, Button, Collapse, LinearProgress, Link, Pagination, Paper, Skeleton, Stack, Typography, useMediaQuery, type Theme } from '@mui/material';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { DataTable, EmptyState, FilterChips, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';

import { useActivityFormOptions } from '../activities/activities.queries';
import { withoutSearch, type Interaction } from '../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS, COMMERCIAL_RELATED_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useCustomerLookup, useOwnerName } from '../common/commercial-activity.queries';
import { endOfDayIso, startOfDayIso } from '../common/date-time';
import { InteractionTimelineList } from '../common/InteractionTimeline';
import { useCommercialTimeZones } from '../common/use-commercial-time-zones';
import { ZonedDateTime } from '../common/ZonedDateTime';
import { sourceLinkText } from '../follow-up/follow-up-format';

import { ActiveInteractionFilterChips, InteractionFilters } from './components/InteractionFilters';
import { INTERACTION_FORM_FILTERS, type InteractionChipFilter, type InteractionFilterValues } from './interaction-filters';
import { DEFAULT_INTERACTION_SORT, INTERACTION_FILTER_KEYS, INTERACTION_SORT_FIELDS, type InteractionFilterKey } from './interactions.api';
import { useInteractionHistory } from './interactions.queries';

const TITLE = 'Historial de interacciones';
const CHIP_FILTERS: readonly InteractionChipFilter[] = [...INTERACTION_FORM_FILTERS, 'projectId', 'opportunityId'];
/** Parámetro de la URL de la vista (no va a la API). */
const VIEW_PARAM = 'view';
type HistoryView = 'timeline' | 'table';

const COLUMNS: DataTableColumn<Interaction>[] = [
  { id: 'occurredAt', header: 'Fecha', sortable: true, render: (item) => <ZonedDateTime value={item.occurredAt} /> },
  { id: 'type', header: 'Tipo', render: (item) => item.typeLabel },
  { id: 'user', header: 'Usuario', render: (item) => item.user.displayName },
  { id: 'customer', header: 'Cliente', primary: true, render: (item) => item.customer.legalName },
  { id: 'project', header: 'Proyecto', render: (item) => item.project?.name ?? '—' },
  {
    id: 'summary',
    header: 'Resumen',
    render: (item) => (
      <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {item.subject}
        </Typography>
        {item.summary ? (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            {item.summary}
          </Typography>
        ) : null}
      </Box>
    ),
  },
  { id: 'result', header: 'Resultado', render: (item) => item.result?.label ?? '—' },
  {
    id: 'source',
    header: 'Registro',
    render: (item) => (
      <Link component={RouterLink} to={item.sourcePath} sx={{ whiteSpace: 'nowrap' }}>
        {sourceLinkText(item.sourceType, item.sourceCode)}
      </Link>
    ),
  },
];

/**
 * `from`/`to` viajan en la URL como `YYYY-MM-DD` y a la API como instantes del
 * día completo (zona del usuario). `/interactions` no admite `search` (`400`).
 */
function toApiQuery(query: ListQuery, timeZone: string | undefined): ListQuery {
  const from = typeof query.from === 'string' ? query.from : undefined;
  const to = typeof query.to === 'string' ? query.to : undefined;
  return { ...withoutSearch(query), from: startOfDayIso(from, timeZone), to: endOfDayIso(to, timeZone) };
}

interface TimelineViewProps {
  items: readonly Interaction[] | undefined;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  empty: ReactNode;
  hideCustomer: boolean;
  hideProject: boolean;
}

/** Vista de línea de tiempo agrupada por día con paginación en el servidor. */
function TimelineView({ items, totalItems, page, pageSize, onPageChange, isLoading, isFetching, errorMessage, onRetry, empty, hideCustomer, hideProject }: TimelineViewProps) {
  const rows = items ?? [];
  if (errorMessage) {
    return (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar el historial"
        description={errorMessage}
        action={
          <Button variant="outlined" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    );
  }
  if (isLoading && rows.length === 0) {
    return (
      <Stack role="status" aria-label="Cargando el historial" spacing={1.5} sx={{ p: 2 }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(8) }} />
        ))}
      </Stack>
    );
  }
  if (rows.length === 0) {
    return empty;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <Box>
      <Box sx={{ visibility: isFetching ? 'visible' : 'hidden' }}>
        <LinearProgress aria-hidden />
      </Box>
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}>
        <InteractionTimelineList items={rows} hideCustomer={hideCustomer} hideProject={hideProject} />
      </Box>
      {totalPages > 1 ? (
        <Stack alignItems="center" sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Pagination
            count={totalPages}
            page={Math.min(page, totalPages)}
            onChange={(_, next) => onPageChange(next)}
            color="primary"
            shape="rounded"
            getItemAriaLabel={(type, itemPage, selected) =>
              type === 'page'
                ? selected
                  ? `Página ${itemPage}, actual`
                  : `Ir a la página ${itemPage}`
                : type === 'next'
                  ? 'Página siguiente'
                  : type === 'previous'
                    ? 'Página anterior'
                    : ''
            }
          />
        </Stack>
      ) : null}
    </Box>
  );
}

/**
 * Historial de interacciones (04 §E.5, F-24). Ruta protegida con
 * `actividades.ver`; opción de menú `actividad-historial`. Sólo visitas
 * realizadas/confirmadas y actividades completadas de tipos que cuentan como
 * interacción, cada una una vez (RN-04.33, lo resuelve el backend). Más
 * recientes primero, invertible; línea de tiempo por día o tabla (`≥ md`).
 * Filtros, orden, vista y página viven en la URL (`?customerId=` etc. llegan de
 * las fichas y del seguimiento).
 */
export function InteractionHistoryPage() {
  const filtersPanelId = useId();
  const canViewActivities = usePermission(ACTIVITY_PERMISSIONS.view);
  const canViewCustomers = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const isWide = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true });
  const [searchParams, setSearchParams] = useSearchParams();
  const table = useTableQueryState<InteractionFilterKey>({
    filterKeys: INTERACTION_FILTER_KEYS,
    sortableFields: INTERACTION_SORT_FIELDS,
    defaultSort: DEFAULT_INTERACTION_SORT,
  });
  const { timeZone } = useCommercialTimeZones();
  const apiQuery = useMemo(() => toApiQuery(table.apiQuery, timeZone), [table.apiQuery, timeZone]);
  const history = useInteractionHistory(apiQuery);
  const options = useActivityFormOptions(canViewActivities);
  const rows = history.data?.data;

  const view: HistoryView = isWide && searchParams.get(VIEW_PARAM) === 'table' ? 'table' : 'timeline';
  const setView = (next: string) =>
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === 'table') {
        params.set(VIEW_PARAM, 'table');
      } else {
        params.delete(VIEW_PARAM);
      }
      return params;
    });

  const { filters, sort } = table.state;
  const ascending = sort?.direction === 'asc';
  const toggleOrder = () => table.setSort({ field: DEFAULT_INTERACTION_SORT.field, direction: ascending ? 'desc' : 'asc' });

  const chipValues: InteractionFilterValues = Object.fromEntries(CHIP_FILTERS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : [])));
  const formValues = useMemo<InteractionFilterValues>(
    () => Object.fromEntries(INTERACTION_FORM_FILTERS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : []))),
    [filters],
  );
  const activeFilterCount = INTERACTION_FORM_FILTERS.filter((key) => key !== 'typeId' && Boolean(filters[key])).length + (filters.typeId && !filters.sourceType ? 1 : 0);
  const hasFilters = Object.keys(chipValues).length > 0;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);

  const customerLookup = useCustomerLookup(canViewCustomers ? filters.customerId : undefined);
  const userName = useOwnerName(filters.userId);
  const names = {
    customer: (filters.customerId && rows?.find((item) => item.customer.id === filters.customerId)?.customer.legalName) || customerLookup.data?.legalName || null,
    project: (filters.projectId && rows?.find((item) => item.project?.id === filters.projectId)?.project?.name) || null,
    opportunity: (filters.opportunityId && rows?.find((item) => item.opportunity?.id === filters.opportunityId)?.opportunity?.code) || null,
    user: userName,
  };

  const clearFilters = () => table.setFilters(Object.fromEntries(INTERACTION_FILTER_KEYS.map((key) => [key, undefined])));
  const removeFilter = (key: InteractionChipFilter) => table.setFilter(key, undefined);

  const errorMessage = history.isError ? withReference(describeApiError(history.error, COMMERCIAL_ERROR_MESSAGES)) : null;
  const emptyTitle = hasFilters ? 'Ninguna interacción coincide' : 'Aún no hay interacciones registradas';
  const emptyDescription = hasFilters
    ? 'Prueba con otros filtros o quita alguno.'
    : 'Aquí verás las visitas realizadas o confirmadas y las actividades completadas de tu alcance.';
  const emptyAction = hasFilters ? (
    <Button variant="outlined" onClick={clearFilters}>
      Limpiar filtros
    </Button>
  ) : undefined;
  const emptyIcon = hasFilters ? <SearchOffOutlinedIcon /> : <ForumOutlinedIcon />;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: 'Historial' })} />

      <Paper component="section" aria-label={TITLE} sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              {isWide ? (
                <FilterChips
                  label="Vista del historial"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'timeline', label: 'Línea de tiempo' },
                    { value: 'table', label: 'Tabla' },
                  ]}
                />
              ) : null}
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<SwapVertIcon />}
                aria-pressed={ascending}
                onClick={toggleOrder}
                sx={{ flex: '0 0 auto', borderColor: 'divider' }}
              >
                Más antiguas primero
              </Button>
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
          <Collapse in={filtersOpen} id={filtersPanelId} unmountOnExit>
            <InteractionFilters values={formValues} options={options.data} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <ActiveInteractionFilterChips values={chipValues} options={options.data} names={names} onRemove={removeFilter} onClear={clearFilters} />
        </ListToolbar>

        {view === 'table' ? (
          <DataTable
            label="Interacciones"
            columns={COLUMNS}
            rows={rows}
            getRowId={(item) => `${item.sourceType}-${item.sourceId}`}
            totalItems={history.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            sort={sort}
            onSortChange={table.setSort}
            isLoading={history.isPending}
            isFetching={history.isFetching}
            errorMessage={errorMessage}
            onRetry={() => void history.refetch()}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyIcon={emptyIcon}
            emptyAction={emptyAction}
          />
        ) : (
          <TimelineView
            items={rows}
            totalItems={history.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            isLoading={history.isPending}
            isFetching={history.isFetching}
            errorMessage={errorMessage}
            onRetry={() => void history.refetch()}
            empty={<EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />}
            hideCustomer={Boolean(filters.customerId)}
            hideProject={Boolean(filters.projectId)}
          />
        )}
      </Paper>
    </>
  );
}
