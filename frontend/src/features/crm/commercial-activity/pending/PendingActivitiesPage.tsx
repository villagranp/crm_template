import FilterListIcon from '@mui/icons-material/FilterList';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Chip, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, FilterChips, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import { PENDING_FILTER_KEYS, PENDING_SORT_FIELDS, type PendingActivity, type PendingFilterKey } from '../activities/activities.api';
import { useActivityFormOptions, usePendingActivities } from '../activities/activities.queries';
import { ACTIVITY_FIELD_TEXT, activityDetailPath } from '../activities/activity-format';
import {
  ActiveActivityFilterChips,
  ActivityFilters,
  type ActivityFilterField,
  type ActivityFilterValues,
} from '../activities/components/ActivityFilters';
import { ActivityCompletionDialog } from '../activities/components/ActivityCompletionDialog';
import { ActivityTypeLabel } from '../activities/components/ActivityTypeLabel';
import { NewActivityMenuButton } from '../activities/components/NewActivityMenuButton';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { ACTIVITY_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useOwnerName } from '../common/commercial-activity.queries';
import { DueBadge } from '../common/DueBadge';
import { StatusChip } from '../common/StatusChip';

const TITLE = 'Pendientes';
/** Orden fijo RN-04.32 (prioridad, vencimiento…): el usuario puede cambiarlo a vencimiento. */
const DEFAULT_SORT = { field: 'priority', direction: 'asc' } as const;
const FORM_FILTERS: readonly ActivityFilterField[] = ['ownerId', 'typeId', 'priorityId', 'customerId'];

const COLUMNS: DataTableColumn<PendingActivity>[] = [
  {
    id: 'activity',
    header: 'Actividad',
    primary: true,
    render: (activity) => (
      <Box sx={{ minWidth: 0 }}>
        <ActivityTypeLabel type={activity.type} />
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {activity.subject}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {activity.code}
        </Typography>
      </Box>
    ),
  },
  { id: 'dueAt', header: ACTIVITY_FIELD_TEXT.dueAt, sortable: true, render: (activity) => <DueBadge dueAt={activity.dueAt} bucket={activity.bucket} /> },
  { id: 'priority', header: ACTIVITY_FIELD_TEXT.priority, sortable: true, render: (activity) => <Chip size="small" variant="outlined" label={activity.priority.label} /> },
  { id: 'owner', header: ACTIVITY_FIELD_TEXT.owner, hideOnMobile: true, render: (activity) => activity.owner.displayName },
  { id: 'customer', header: ACTIVITY_FIELD_TEXT.customer, render: (activity) => activity.customer.legalName },
  { id: 'project', header: ACTIVITY_FIELD_TEXT.project, hideOnMobile: true, render: (activity) => activity.project?.name ?? '—' },
  { id: 'status', header: ACTIVITY_FIELD_TEXT.status, hideOnMobile: true, render: (activity) => <StatusChip label={activity.status.label} group={activity.status.group} /> },
];

/**
 * Bandeja de actividades pendientes (04 §E.3, F-22). Ruta protegida con
 * `actividades.ver`; opción de menú `actividad-pendientes`.
 *
 * Pestañas con contador (Todas, Vencidas, Próximas a vencer, Pendientes) según
 * la clasificación del backend (RN-04.31); los contadores respetan los demás
 * filtros. Orden fijo por prioridad y vencimiento (RN-04.32), cambiable a
 * vencimiento. Al completar, la fila desaparece (se invalidan las consultas); no
 * hay "Deshacer": la operación es definitiva (D-04.6).
 */
export function PendingActivitiesPage() {
  const navigate = useNavigate();
  const filtersPanelId = useId();
  const canCreate = usePermission(ACTIVITY_PERMISSIONS.create);
  const table = useTableQueryState<PendingFilterKey>({
    filterKeys: PENDING_FILTER_KEYS,
    sortableFields: PENDING_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const pending = usePendingActivities(table.apiQuery);
  const options = useActivityFormOptions();
  const [completing, setCompleting] = useState<PendingActivity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { filters } = table.state;
  // Memorizado: el borrador del panel sólo se reinicia si cambian los filtros aplicados.
  const formFilters = useMemo<ActivityFilterValues>(
    () => Object.fromEntries(FORM_FILTERS.flatMap((key) => (filters[key as PendingFilterKey] ? [[key, filters[key as PendingFilterKey]]] : []))),
    [filters],
  );
  const activeFilterCount = Object.keys(formFilters).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const counts = pending.data?.counts;
  const bucket = filters.bucket ?? '';
  const ownerName = useOwnerName(filters.ownerId);
  const clearFilters = () => table.setFilters(Object.fromEntries(FORM_FILTERS.map((key) => [key, undefined])));

  let emptyTitle = 'No tienes actividades pendientes';
  let emptyDescription = 'Las actividades abiertas de tu alcance aparecerán aquí, ordenadas por prioridad y vencimiento.';
  if (activeFilterCount > 0 || bucket) {
    emptyTitle = 'Ninguna actividad pendiente coincide';
    emptyDescription = 'Prueba con otra pestaña o quita algún filtro.';
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: TITLE })}
        actions={canCreate ? <NewActivityMenuButton types={options.data?.types} /> : undefined}
      />

      {notice ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Bandeja de pendientes" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <>
              <FilterChips
                label="Filtrar por vencimiento"
                value={bucket}
                onChange={(value) => table.setFilter('bucket', value || undefined)}
                options={[
                  { value: '', label: 'Todas', count: counts?.total },
                  { value: 'OVERDUE', label: 'Vencidas', count: counts?.overdue },
                  { value: 'DUE_SOON', label: 'Próximas a vencer', count: counts?.dueSoon },
                  { value: 'PENDING', label: 'Pendientes', count: counts?.pending },
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
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <ActivityFilters
              label="Filtros de pendientes"
              fields={FORM_FILTERS}
              values={formFilters}
              options={options.data}
              onApply={(values) => table.setFilters(values as Partial<Record<PendingFilterKey, string>>)}
            />
          </Collapse>
          <ActiveActivityFilterChips
            values={formFilters}
            options={options.data}
            ownerName={ownerName}
            onRemove={(key) => table.setFilter(key as PendingFilterKey, undefined)}
            onClear={clearFilters}
          />
        </ListToolbar>

        <DataTable
          label="Actividades pendientes"
          columns={COLUMNS}
          rows={pending.data?.data}
          getRowId={(activity) => activity.id}
          totalItems={pending.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={pending.isPending}
          isFetching={pending.isFetching}
          errorMessage={pending.isError ? withReference(describeApiError(pending.error, COMMERCIAL_ERROR_MESSAGES)) : null}
          onRetry={() => void pending.refetch()}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyIcon={<PendingActionsOutlinedIcon />}
          onRowClick={(activity) => navigate(activityDetailPath(activity.id))}
          getRowLabel={(activity) => `Abrir la actividad ${activity.code}: ${activity.subject}`}
          rowActions={(activity) => (
            <Stack direction="row" spacing={0.5}>
              {activity.allowedActions.includes('COMPLETE') ? (
                <Tooltip title="Completar">
                  <IconButton aria-label={`Completar ${activity.code}`} onClick={() => setCompleting(activity)}>
                    <TaskAltOutlinedIcon />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="Ver">
                <IconButton aria-label={`Ver ${activity.code}`} onClick={() => navigate(activityDetailPath(activity.id))}>
                  <VisibilityOutlinedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        />
      </Paper>

      <ActivityCompletionDialog
        open={completing !== null}
        activity={completing}
        onClose={() => setCompleting(null)}
        onCompleted={(saved) => setNotice(`Actividad ${saved.code} completada.`)}
      />
    </>
  );
}
