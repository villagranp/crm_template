import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { Box, Button, Chip, Collapse, Paper, Stack, Typography } from '@mui/material';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';

import { AttachmentCount } from '../common/AttachmentCount';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../common/commercial-activity.errors';
import { COMMERCIAL_RELATED_PERMISSIONS, VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';
import { useOwnerName } from '../common/commercial-activity.queries';
import { planVisitPath, visitDetailPath } from '../common/commercial-paths';
import { endOfDayIso, startOfDayIso } from '../common/date-time';
import { StatusChip } from '../common/StatusChip';
import { useCommercialTimeZones } from '../common/use-commercial-time-zones';
import { ZonedDateTime } from '../common/ZonedDateTime';

import { ActiveVisitFilterChips, VisitFilters } from './components/VisitFilters';
import { rescheduleLabel, VISIT_FIELD_TEXT, VISIT_FILTER_FIELDS, type VisitFilterValues } from './visit-format';
import { VISIT_FILTER_KEYS, VISIT_SORT_FIELDS, type VisitFilterKey, type VisitListItem } from './visits.api';
import { useVisitFormOptions, useVisits } from './visits.queries';

const TITLE = 'Visitas';
const DEFAULT_SORT = { field: 'scheduledStartAt', direction: 'desc' } as const;

const COLUMNS: DataTableColumn<VisitListItem>[] = [
  { id: 'code', header: VISIT_FIELD_TEXT.code, sortable: true, primary: true, render: (visit) => visit.code },
  {
    id: 'scheduledStartAt',
    header: VISIT_FIELD_TEXT.scheduledStartAt,
    sortable: true,
    render: (visit) => {
      const rescheduled = rescheduleLabel(visit.rescheduleCount);
      return (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2">
            <ZonedDateTime value={visit.scheduledStartAt} />
          </Typography>
          {rescheduled ? (
            <Typography variant="caption" color="text.secondary">
              {rescheduled}
            </Typography>
          ) : null}
        </Box>
      );
    },
  },
  { id: 'customerName', header: VISIT_FIELD_TEXT.customer, sortable: true, render: (visit) => visit.customer.legalName },
  { id: 'project', header: VISIT_FIELD_TEXT.project, hideOnMobile: true, render: (visit) => visit.project?.name ?? '—' },
  { id: 'ownerName', header: VISIT_FIELD_TEXT.owner, sortable: true, hideOnMobile: true, render: (visit) => visit.owner.displayName },
  {
    id: 'objective',
    header: VISIT_FIELD_TEXT.objective,
    render: (visit) => (
      <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
        {visit.objective}
      </Typography>
    ),
  },
  {
    id: 'status',
    header: VISIT_FIELD_TEXT.status,
    sortable: true,
    render: (visit) => <StatusChip label={visit.status.label} group={visit.status.group} isRescheduled={visit.status.isRescheduled} isUnregistered={visit.isUnregistered} />,
  },
  {
    id: 'result',
    header: VISIT_FIELD_TEXT.result,
    hideOnMobile: true,
    render: (visit) => (visit.result ? <Chip size="small" variant="outlined" label={visit.result.label} /> : '—'),
  },
  { id: 'attachments', header: VISIT_FIELD_TEXT.attachments, align: 'right', hideOnMobile: true, render: (visit) => <AttachmentCount count={visit.attachmentCount} /> },
];

/**
 * Las fechas de los filtros viajan en la URL como `YYYY-MM-DD` y a la API como
 * instantes del día completo en la zona del usuario.
 */
function toApiQuery(query: ListQuery, timeZone: string | undefined): ListQuery {
  return {
    ...query,
    from: startOfDayIso(typeof query.from === 'string' ? query.from : undefined, timeZone),
    to: endOfDayIso(typeof query.to === 'string' ? query.to : undefined, timeZone),
  };
}

/**
 * Listado de visitas (04 §E.6, F-25). Ruta protegida con `visitas.ver`; opción
 * de menú `actividad-visitas`. Búsqueda (código, objetivo, razón social),
 * filtros, orden y página viven en la URL; todo se resuelve en el servidor
 * dentro del alcance.
 */
export function VisitsPage() {
  const navigate = useNavigate();
  const filtersPanelId = useId();
  const canCreate = usePermission(VISIT_PERMISSIONS.create);
  const canListCountries = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const table = useTableQueryState<VisitFilterKey>({
    filterKeys: VISIT_FILTER_KEYS,
    sortableFields: VISIT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { timeZone } = useCommercialTimeZones();
  const apiQuery = useMemo(() => toApiQuery(table.apiQuery, timeZone), [table.apiQuery, timeZone]);
  const visits = useVisits(apiQuery);
  const options = useVisitFormOptions();

  const { filters, search } = table.state;
  // Memorizado: el borrador del panel sólo se reinicia si cambian los filtros aplicados.
  const formFilters = useMemo<VisitFilterValues>(
    () => Object.fromEntries(VISIT_FILTER_FIELDS.flatMap((key) => (filters[key] ? [[key, filters[key]]] : []))),
    [filters],
  );
  const activeFilterCount = Object.keys(formFilters).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const hasFilters = Boolean(search) || activeFilterCount > 0 || Boolean(filters.statusGroup);
  const ownerName = useOwnerName(filters.ownerId);

  const clearFilters = () => table.setFilters(Object.fromEntries(VISIT_FILTER_KEYS.map((key) => [key, undefined])));
  const clearAll = () => {
    table.setSearchInput('');
    clearFilters();
  };
  const planButton = canCreate ? (
    <Button startIcon={<AddIcon />} onClick={() => navigate(planVisitPath())}>
      Planificar visita
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: 'Actividad comercial' }, { label: TITLE })} actions={planButton} />

      <Paper component="section" aria-label="Listado de visitas" sx={{ overflow: 'hidden', boxShadow: 1 }}>
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
            label: 'Buscar por código, objetivo o razón social',
            placeholder: 'Buscar visitas…',
          }}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <VisitFilters values={formFilters} options={options.data} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <ActiveVisitFilterChips
            values={formFilters}
            options={options.data}
            ownerName={ownerName}
            countriesEnabled={canListCountries}
            onRemove={(key) => table.setFilter(key, undefined)}
            onClear={clearFilters}
          />
          {filters.statusGroup ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ pt: 2 }} aria-label="Filtros de origen">
              <Chip label="Grupo de estado seleccionado" onDelete={() => table.setFilter('statusGroup', undefined)} />
            </Stack>
          ) : null}
        </ListToolbar>

        <DataTable
          label={TITLE}
          columns={COLUMNS}
          rows={visits.data?.data}
          getRowId={(visit) => visit.id}
          totalItems={visits.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={visits.isPending}
          isFetching={visits.isFetching}
          errorMessage={visits.isError ? withReference(describeApiError(visits.error, COMMERCIAL_ERROR_MESSAGES)) : null}
          onRetry={() => void visits.refetch()}
          emptyTitle={hasFilters ? 'Ninguna visita coincide' : 'Todavía no hay visitas visibles para ti'}
          emptyDescription={hasFilters ? 'Prueba con otra búsqueda o quita algún filtro.' : 'Aquí verás las visitas comerciales de tu alcance.'}
          emptyIcon={hasFilters ? undefined : <LocationOnOutlinedIcon />}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={clearAll}>
                Limpiar filtros
              </Button>
            ) : (
              planButton
            )
          }
          onRowClick={(visit) => navigate(visitDetailPath(visit.id))}
          getRowLabel={(visit) => `Abrir la visita ${visit.code}: ${visit.objective}`}
        />
      </Paper>
    </>
  );
}
