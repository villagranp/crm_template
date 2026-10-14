import FilterListIcon from '@mui/icons-material/FilterList';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { Box, Button, Collapse, Link, Paper, Typography } from '@mui/material';
import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { DataTable, FilterChips, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { projectDetailPath } from '@/features/crm/projects';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';

import { AttachmentCount } from '../common/AttachmentCount';
import { withoutSearch, type FollowUpRow } from '../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { COMMERCIAL_RELATED_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useCustomerLookup, useOwnerName } from '../common/commercial-activity.queries';
import { endOfDayIso, startOfDayIso } from '../common/date-time';
import { NextActionDate } from '../common/NextActionDate';
import { useCommercialTimeZones } from '../common/use-commercial-time-zones';
import { useProjectFilterName } from '../common/use-project-filter-name';
import { ZonedDateTime } from '../common/ZonedDateTime';

import { ActiveFollowUpFilterChips, FollowUpFilters } from './components/FollowUpFilters';
import { FollowUpTraceDrawer } from './components/FollowUpTraceDrawer';
import { NotesPreview } from './components/NotesPreview';
import {
  DEFAULT_FOLLOW_UP_GROUP,
  FOLLOW_UP_FILTER_KEYS,
  FOLLOW_UP_SORT_FIELDS,
  type FollowUpFilterKey,
  type FollowUpGroup,
} from './follow-up.api';
import { FOLLOW_UP_FORM_FILTERS, type FollowUpChipFilter, type FollowUpFilterValues } from './follow-up-filters';
import { sourceDetailPath, sourceLinkText } from './follow-up-format';
import { useFollowUps } from './follow-up.queries';

const TITLE = 'Seguimiento comercial';
const DEFAULT_SORT = { field: 'lastInteractionAt', direction: 'desc' } as const;
const CHIP_FILTERS: readonly FollowUpChipFilter[] = FOLLOW_UP_FORM_FILTERS;
const CLEARABLE_FILTERS = FOLLOW_UP_FILTER_KEYS.filter((key) => key !== 'groupBy');

/** Los enlaces dentro de una fila navegable no deben abrir además el drawer. */
function stopRowActivation(event: SyntheticEvent) {
  event.stopPropagation();
}

function rowId(row: FollowUpRow): string {
  return row.project ? `${row.customer.id}:${row.project.id}` : row.customer.id;
}

function buildColumns(groupBy: FollowUpGroup): DataTableColumn<FollowUpRow>[] {
  const columns: DataTableColumn<FollowUpRow>[] = [
    {
      id: 'customerName',
      header: 'Cliente',
      sortable: true,
      primary: true,
      render: (row) => (
        <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
          <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {row.customer.legalName}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary">
            {row.customer.crmCode}
          </Typography>
        </Box>
      ),
    },
  ];
  if (groupBy === 'PROJECT') {
    columns.push({
      id: 'project',
      header: 'Proyecto',
      render: (row) =>
        row.project ? (
          <Link component={RouterLink} to={projectDetailPath(row.project.id)} onClick={stopRowActivation} sx={{ overflowWrap: 'anywhere' }}>
            {row.project.name}
          </Link>
        ) : (
          '—'
        ),
    });
  }
  columns.push(
    {
      id: 'lastInteractionAt',
      header: 'Última interacción',
      sortable: true,
      render: (row) =>
        row.lastInteraction ? (
          <Box component="span" sx={{ display: 'block' }}>
            <Typography component="span" variant="body2" sx={{ display: 'block' }}>
              <ZonedDateTime value={row.lastInteraction.occurredAt} />
              {` · ${row.lastInteraction.typeLabel}`}
            </Typography>
            <Link component={RouterLink} to={sourceDetailPath(row.lastInteraction)} variant="body2" onClick={stopRowActivation}>
              {sourceLinkText(row.lastInteraction.sourceType, row.lastInteraction.sourceCode)}
            </Link>
          </Box>
        ) : (
          'Sin interacciones'
        ),
    },
    {
      id: 'nextAction',
      header: 'Próxima acción',
      render: (row) =>
        row.nextAction ? (
          <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {row.nextAction}
          </Typography>
        ) : (
          'Sin próxima acción'
        ),
    },
    {
      id: 'nextActionDate',
      header: 'Fecha próxima acción',
      sortable: true,
      render: (row) => (row.nextActionDate ? <NextActionDate date={row.nextActionDate} /> : '—'),
    },
    { id: 'responsible', header: 'Responsable', hideOnMobile: true, render: (row) => row.responsible?.displayName ?? '—' },
    { id: 'notes', header: 'Notas', hideOnMobile: true, render: (row) => <NotesPreview notes={row.notes} /> },
    { id: 'attachments', header: 'Adjuntos', align: 'right', hideOnMobile: true, render: (row) => <AttachmentCount count={row.attachmentCount} /> },
  );
  return columns;
}

const COLUMNS: Record<FollowUpGroup, DataTableColumn<FollowUpRow>[]> = {
  CUSTOMER: buildColumns('CUSTOMER'),
  PROJECT: buildColumns('PROJECT'),
};

function toGroup(value: string | undefined): FollowUpGroup {
  return value === 'PROJECT' ? 'PROJECT' : DEFAULT_FOLLOW_UP_GROUP;
}

/**
 * La agrupación siempre se envía explícita; las fechas viajan en la URL como
 * `YYYY-MM-DD` y a la API como instantes del día completo (zona del usuario).
 * `/follow-ups` no admite `search` (`400`): aunque llegue en la URL, no se envía.
 */
function toApiQuery(query: ListQuery, groupBy: FollowUpGroup, timeZone: string | undefined): ListQuery {
  const from = typeof query.lastInteractionFrom === 'string' ? query.lastInteractionFrom : undefined;
  const to = typeof query.lastInteractionTo === 'string' ? query.lastInteractionTo : undefined;
  return { ...withoutSearch(query), groupBy, lastInteractionFrom: startOfDayIso(from, timeZone), lastInteractionTo: endOfDayIso(to, timeZone) };
}

/**
 * Seguimiento comercial (04 §E.4, F-23). Ruta protegida con `actividades.ver`;
 * opción de menú `actividad-seguimiento`. Una fila por cliente (o por proyecto)
 * derivada de visitas y actividades (RN-04.34, sin tabla propia, AC-04.12).
 * Agrupación, filtros, orden y página viven en la URL y se resuelven en el
 * servidor. Clic o `Enter` en una fila abre el drawer de trazabilidad.
 */
export function FollowUpPage() {
  const filtersPanelId = useId();
  const canListCountries = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const table = useTableQueryState<FollowUpFilterKey>({
    filterKeys: FOLLOW_UP_FILTER_KEYS,
    sortableFields: FOLLOW_UP_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters } = table.state;
  const groupBy = toGroup(filters.groupBy);
  const { timeZone } = useCommercialTimeZones();
  const apiQuery = useMemo(() => toApiQuery(table.apiQuery, groupBy, timeZone), [table.apiQuery, groupBy, timeZone]);
  const followUps = useFollowUps(apiQuery);
  const rows = followUps.data?.data;

  // La agrupación se fija al abrir: la trazabilidad es la de la fila elegida.
  const [selected, setSelected] = useState<{ row: FollowUpRow; groupBy: FollowUpGroup } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const chipValues: FollowUpFilterValues = Object.fromEntries(CHIP_FILTERS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : [])));
  const formValues = useMemo<FollowUpFilterValues>(
    () => Object.fromEntries(FOLLOW_UP_FORM_FILTERS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : []))),
    [filters],
  );
  const activeFilterCount = Object.keys(formValues).length;
  const hasFilters = Object.keys(chipValues).length > 0;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);

  const ownerName = useOwnerName(filters.ownerId);
  const customerLookup = useCustomerLookup(canListCountries ? filters.customerId : undefined);
  const customerName =
    (filters.customerId && rows?.find((row) => row.customer.id === filters.customerId)?.customer.legalName) || customerLookup.data?.legalName || null;
  const projectFilterName = useProjectFilterName(filters.projectId);
  const projectName = (filters.projectId && rows?.find((row) => row.project?.id === filters.projectId)?.project?.name) || projectFilterName;

  const clearFilters = () => table.setFilters(Object.fromEntries(CLEARABLE_FILTERS.map((key) => [key, undefined])));
  const openTrace = (row: FollowUpRow) => {
    setSelected({ row, groupBy });
    setDrawerOpen(true);
  };

  return (
    <>
      <PageHeader
        title={TITLE}
        breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: 'Seguimiento' })}
      />

      <Paper component="section" aria-label="Seguimiento comercial" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              <FilterChips
                label="Agrupar seguimiento"
                value={groupBy}
                onChange={(value) => table.setFilter('groupBy', value === 'PROJECT' ? 'PROJECT' : undefined)}
                options={[
                  { value: 'CUSTOMER', label: 'Por cliente' },
                  { value: 'PROJECT', label: 'Por proyecto' },
                ]}
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
          <Collapse in={filtersOpen} id={filtersPanelId} unmountOnExit>
            <FollowUpFilters values={formValues} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <ActiveFollowUpFilterChips
            values={chipValues}
            customerName={customerName}
            projectName={projectName}
            ownerName={ownerName}
            canListCountries={canListCountries}
            onRemove={(key) => table.setFilter(key, undefined)}
            onClear={clearFilters}
          />
        </ListToolbar>

        <DataTable
          label={groupBy === 'PROJECT' ? 'Seguimiento por proyecto' : 'Seguimiento por cliente'}
          columns={COLUMNS[groupBy]}
          rows={rows}
          getRowId={rowId}
          totalItems={followUps.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={followUps.isPending}
          isFetching={followUps.isFetching}
          errorMessage={followUps.isError ? withReference(describeApiError(followUps.error, COMMERCIAL_ERROR_MESSAGES)) : null}
          onRetry={() => void followUps.refetch()}
          emptyTitle={hasFilters ? 'Ningún seguimiento coincide' : 'Aún no hay interacciones registradas'}
          emptyDescription={
            hasFilters
              ? 'Prueba con otros filtros o quita alguno.'
              : 'El seguimiento se calcula a partir de las visitas y actividades de tu alcance.'
          }
          emptyIcon={hasFilters ? undefined : <ForumOutlinedIcon />}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
          onRowClick={openTrace}
          getRowLabel={(row) =>
            row.project ? `Ver la trazabilidad de ${row.project.name} (${row.customer.legalName})` : `Ver la trazabilidad de ${row.customer.legalName}`
          }
        />
      </Paper>

      <FollowUpTraceDrawer row={selected?.row ?? null} groupBy={selected?.groupBy ?? groupBy} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
