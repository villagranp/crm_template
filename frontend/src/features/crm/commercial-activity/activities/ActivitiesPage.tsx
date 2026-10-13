import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Box, Button, Chip, Collapse, Paper, Typography } from '@mui/material';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';

import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS } from '../common/commercial-activity.permissions';
import { endOfDayIso, formatDateTime, startOfDayIso } from '../common/date-time';
import { DueBadge } from '../common/DueBadge';
import { StatusChip } from '../common/StatusChip';

import { ACTIVITY_FILTER_KEYS, ACTIVITY_SORT_FIELDS, type ActivityFilterKey, type ActivityListItem } from './activities.api';
import { useActivities, useActivityFormOptions } from './activities.queries';
import { ACTIVITY_FIELD_TEXT, activityDetailPath } from './activity-format';
import { ActiveActivityFilterChips, ActivityFilters, type ActivityFilterField, type ActivityFilterValues } from './components/ActivityFilters';
import { ActivityTypeLabel } from './components/ActivityTypeLabel';
import { NewActivityMenuButton } from './components/NewActivityMenuButton';

const TITLE = 'Actividades';
const DEFAULT_SORT = { field: 'dueAt', direction: 'asc' } as const;
const FORM_FILTERS: readonly ActivityFilterField[] = [
  'typeId',
  'statusId',
  'priorityId',
  'ownerId',
  'customerId',
  'scheduledFrom',
  'scheduledTo',
  'dueFrom',
  'dueTo',
  'overdue',
];
const DAY_START_FILTERS = ['scheduledFrom', 'dueFrom'] as const;
const DAY_END_FILTERS = ['scheduledTo', 'dueTo'] as const;

const COLUMNS: DataTableColumn<ActivityListItem>[] = [
  { id: 'code', header: ACTIVITY_FIELD_TEXT.code, sortable: true, primary: true, render: (activity) => activity.code },
  { id: 'type', header: ACTIVITY_FIELD_TEXT.type, render: (activity) => <ActivityTypeLabel type={activity.type} /> },
  {
    id: 'subject',
    header: ACTIVITY_FIELD_TEXT.subject,
    render: (activity) => (
      <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
        {activity.subject}
      </Typography>
    ),
  },
  { id: 'customerName', header: ACTIVITY_FIELD_TEXT.customer, sortable: true, render: (activity) => activity.customer.legalName },
  { id: 'project', header: ACTIVITY_FIELD_TEXT.project, hideOnMobile: true, render: (activity) => activity.project?.name ?? '—' },
  { id: 'ownerName', header: ACTIVITY_FIELD_TEXT.owner, sortable: true, hideOnMobile: true, render: (activity) => activity.owner.displayName },
  { id: 'scheduledAt', header: ACTIVITY_FIELD_TEXT.scheduledAt, sortable: true, hideOnMobile: true, render: (activity) => formatDateTime(activity.scheduledAt) },
  { id: 'dueAt', header: ACTIVITY_FIELD_TEXT.dueAt, sortable: true, render: (activity) => <DueBadge dueAt={activity.dueAt} bucket={activity.dueBucket} /> },
  { id: 'priority', header: ACTIVITY_FIELD_TEXT.priority, sortable: true, hideOnMobile: true, render: (activity) => <Chip size="small" variant="outlined" label={activity.priority.label} /> },
  { id: 'status', header: ACTIVITY_FIELD_TEXT.status, sortable: true, render: (activity) => <StatusChip label={activity.status.label} group={activity.status.group} /> },
  { id: 'result', header: ACTIVITY_FIELD_TEXT.result, hideOnMobile: true, render: (activity) => activity.result?.label ?? '—' },
  {
    id: 'attachments',
    header: ACTIVITY_FIELD_TEXT.attachments,
    align: 'right',
    hideOnMobile: true,
    render: (activity) =>
      activity.attachmentCount > 0 ? (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <AttachFileOutlinedIcon fontSize="inherit" aria-hidden />
          {activity.attachmentCount}
        </Box>
      ) : (
        '—'
      ),
  },
];

/** Las fechas de los filtros viajan en la URL como `YYYY-MM-DD` y a la API como instantes del día completo. */
function toApiQuery(query: ListQuery): ListQuery {
  const result: ListQuery = { ...query };
  for (const key of DAY_START_FILTERS) {
    result[key] = startOfDayIso(typeof query[key] === 'string' ? (query[key] as string) : undefined);
  }
  for (const key of DAY_END_FILTERS) {
    result[key] = endOfDayIso(typeof query[key] === 'string' ? (query[key] as string) : undefined);
  }
  return result;
}

/**
 * Listado de actividades (04 §E.9, F-30). Ruta protegida con `actividades.ver`;
 * opción de menú `actividad-actividades`. Búsqueda, filtros, orden y página
 * viven en la URL; todo se resuelve en el servidor dentro del alcance.
 */
export function ActivitiesPage() {
  const navigate = useNavigate();
  const filtersPanelId = useId();
  const canCreate = usePermission(ACTIVITY_PERMISSIONS.create);
  const table = useTableQueryState<ActivityFilterKey>({
    filterKeys: ACTIVITY_FILTER_KEYS,
    sortableFields: ACTIVITY_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const apiQuery = useMemo(() => toApiQuery(table.apiQuery), [table.apiQuery]);
  const activities = useActivities(apiQuery);
  const options = useActivityFormOptions();

  const { filters, search } = table.state;
  const formFilters: ActivityFilterValues = Object.fromEntries(FORM_FILTERS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : [])));
  const activeFilterCount = Object.keys(formFilters).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const hasFilters = Boolean(search) || activeFilterCount > 0 || Boolean(filters.projectId) || Boolean(filters.opportunityId);
  const ownerName = (filters.ownerId && activities.data?.data.find((row) => row.owner.id === filters.ownerId)?.owner.displayName) || null;

  const clearFilters = () => table.setFilters(Object.fromEntries(ACTIVITY_FILTER_KEYS.map((key) => [key, undefined])));
  const clearAll = () => {
    table.setSearchInput('');
    clearFilters();
  };

  return (
    <>
      <PageHeader
        title={TITLE}
        breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: TITLE })}
        actions={canCreate ? <NewActivityMenuButton types={options.data?.types} /> : undefined}
      />

      <Paper component="section" aria-label="Listado de actividades" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
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
          }
          search={{
            value: table.searchInput,
            onChange: table.setSearchInput,
            label: 'Buscar por código, asunto o razón social',
            placeholder: 'Buscar actividades…',
          }}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <ActivityFilters
              label="Filtros de actividades"
              fields={FORM_FILTERS}
              values={formFilters}
              options={options.data}
              ownerName={ownerName}
              onApply={(values) => table.setFilters(values)}
            />
          </Collapse>
          <ActiveActivityFilterChips
            values={formFilters}
            options={options.data}
            ownerName={ownerName}
            onRemove={(key) => table.setFilter(key, undefined)}
            onClear={clearFilters}
          />
        </ListToolbar>

        <DataTable
          label={TITLE}
          columns={COLUMNS}
          rows={activities.data?.data}
          getRowId={(activity) => activity.id}
          totalItems={activities.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={activities.isPending}
          isFetching={activities.isFetching}
          errorMessage={activities.isError ? withReference(describeApiError(activities.error, COMMERCIAL_ERROR_MESSAGES)) : null}
          onRetry={() => void activities.refetch()}
          emptyTitle={hasFilters ? 'Ninguna actividad coincide' : 'Todavía no hay actividades visibles para ti'}
          emptyDescription={
            hasFilters ? 'Prueba con otra búsqueda o quita algún filtro.' : 'Aquí verás las llamadas, reuniones, correos y tareas de tu alcance.'
          }
          emptyIcon={hasFilters ? undefined : <TaskAltOutlinedIcon />}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={clearAll}>
                Limpiar filtros
              </Button>
            ) : canCreate ? (
              <NewActivityMenuButton types={options.data?.types} />
            ) : undefined
          }
          onRowClick={(activity) => navigate(activityDetailPath(activity.id))}
          getRowLabel={(activity) => `Abrir la actividad ${activity.code}: ${activity.subject}`}
        />
      </Paper>
    </>
  );
}
