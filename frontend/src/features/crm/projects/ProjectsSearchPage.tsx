import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, Collapse, Paper, Typography } from '@mui/material';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';

import { CommercialStatusChip } from './components/CommercialStatusChip';
import { PhaseChip } from './components/PhaseChip';
import { ActiveFilterChips, ProjectFilters, type ProjectFilterValues } from './components/ProjectFilters';
import { formatCalendarDate, formatDateTime, formatLocation, orDash } from './project-format';
import { projectDetailPath } from './project-paths';
import { PROJECT_FILTER_KEYS, PROJECT_SORT_FIELDS, type ProjectFilterKey, type ProjectListItem } from './projects.api';
import { PROJECT_ERROR_MESSAGES, withReference } from './projects.errors';
import { PROJECT_PERMISSIONS } from './projects.permissions';
import { useProjectFormOptions, useProjects } from './projects.queries';

const TITLE = 'Proyectos';
const DEFAULT_SORT = { field: 'lastActivityAt', direction: 'desc' } as const;

/** Las columnas ordenables usan como `id` el `sortBy` de la API (03 F.1). */
const COLUMNS: DataTableColumn<ProjectListItem>[] = [
  { id: 'code', header: 'Código', sortable: true, primary: true, render: (project) => project.code },
  {
    id: 'name',
    header: 'Nombre',
    sortable: true,
    render: (project) => (
      <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
        {project.name}
      </Typography>
    ),
  },
  { id: 'customerName', header: 'Cliente', sortable: true, render: (project) => <Box sx={{ overflowWrap: 'anywhere' }}>{project.customer.legalName}</Box> },
  { id: 'location', header: 'País / ciudad', hideOnMobile: true, render: (project) => formatLocation(project.city, project.country.name) },
  { id: 'owner', header: 'Asesor', hideOnMobile: true, render: (project) => project.owner.displayName },
  { id: 'projectType', header: 'Tipo', hideOnMobile: true, render: (project) => orDash(project.projectType?.label) },
  { id: 'phaseOrder', header: 'Fase', sortable: true, render: (project) => <PhaseChip label={project.phase.label} progress={project.phase.progress} /> },
  { id: 'commercialStatus', header: 'Estado comercial', render: (project) => <CommercialStatusChip status={project.commercialStatus} /> },
  {
    id: 'estimatedDecisionDate',
    header: 'Decisión estimada',
    sortable: true,
    hideOnMobile: true,
    render: (project) => formatCalendarDate(project.estimatedDecisionDate),
  },
  { id: 'lastActivityAt', header: 'Última actualización', sortable: true, hideOnMobile: true, render: (project) => formatDateTime(project.lastActivityAt) },
];

/**
 * Búsqueda de proyectos (03 §E.2, F-13). Ruta protegida con `proyectos.ver`;
 * opción de menú `proyectos-buscar`.
 *
 * Búsqueda, filtros, orden y página viven en la URL con los nombres de la API
 * (§E.1), así que los enlaces de Inicio y de Clientes (`?active=true`,
 * `?customerId=`, `?commercialStatus=WON,LOST`) se aplican tal cual. Sólo
 * muestra lo que el backend considera visible para el usuario.
 */
export function ProjectsSearchPage() {
  const navigate = useNavigate();
  const can = useCan();
  const filtersPanelId = useId();
  const canCreate = can(PROJECT_PERMISSIONS.create);

  const table = useTableQueryState<ProjectFilterKey>({
    filterKeys: PROJECT_FILTER_KEYS,
    sortableFields: PROJECT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters, search } = table.state;
  const projects = useProjects(table.apiQuery);
  const options = useProjectFormOptions();

  const formFilters: ProjectFilterValues = filters;
  const activeFilterCount = Object.keys(formFilters).filter((key) => key !== 'dateField').length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const rows = projects.data?.data;
  const ownerName = (filters.ownerId && rows?.find((row) => row.owner.id === filters.ownerId)?.owner.displayName) || null;
  const customerName = (filters.customerId && rows?.find((row) => row.customer.id === filters.customerId)?.customer.legalName) || null;

  const goToCreate = () => navigate(ROUTE_PATHS.crm.projects.create);
  const clearAll = () => table.clearFilters();
  const removeFilter = (key: ProjectFilterKey) => {
    const remaining = { ...filters, [key]: undefined };
    // Sin rango, el campo de fecha sobra (RN-03.17).
    table.setFilters({ [key]: undefined, ...(remaining.dateFrom || remaining.dateTo ? {} : { dateField: undefined }) });
  };

  let emptyTitle = 'Aún no hay proyectos';
  let emptyDescription = 'Aquí verás los proyectos que tienes asignados o que puedes consultar.';
  let emptyAction = canCreate ? <Button onClick={goToCreate}>Nuevo proyecto</Button> : undefined;
  if (hasFilters) {
    emptyTitle = 'No hay proyectos que coincidan con los filtros';
    emptyDescription = 'Prueba con otra búsqueda o quita algún filtro.';
    emptyAction = (
      <Button variant="outlined" onClick={clearAll}>
        Limpiar filtros
      </Button>
    );
  }

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: TITLE })} />

      <Paper component="section" aria-label="Búsqueda de proyectos" sx={{ overflow: 'hidden', boxShadow: 1 }}>
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
            label: 'Buscar por nombre o código',
            placeholder: 'Buscar proyectos…',
          }}
          primaryAction={canCreate ? { label: 'Nuevo proyecto', onClick: goToCreate } : undefined}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <ProjectFilters values={formFilters} options={options.data} ownerName={ownerName} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <ActiveFilterChips
            values={formFilters}
            options={options.data}
            customerName={customerName}
            ownerName={ownerName}
            onRemove={removeFilter}
            onClear={() => table.setFilters(Object.fromEntries(PROJECT_FILTER_KEYS.map((key) => [key, undefined])) as ProjectFilterValues)}
          />
        </ListToolbar>

        <DataTable
          label="Proyectos"
          columns={COLUMNS}
          rows={rows}
          getRowId={(project) => project.id}
          totalItems={projects.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={projects.isPending}
          isFetching={projects.isFetching}
          errorMessage={projects.isError ? withReference(describeApiError(projects.error, PROJECT_ERROR_MESSAGES)) : null}
          onRetry={() => void projects.refetch()}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyIcon={hasFilters ? undefined : <ApartmentOutlinedIcon />}
          emptyAction={emptyAction}
          onRowClick={(project) => navigate(projectDetailPath(project.id))}
          getRowLabel={(project) => `Abrir el proyecto ${project.name} (${project.code})`}
        />
      </Paper>
    </>
  );
}
