import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { Box, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, EmptyState, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { formatPercent } from '@/features/crm/common/decimal';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { projectDetailPath } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';

import { formatCalendarDate, formatLocation } from '../customer-format';
import { CUSTOMER_PROJECT_FILTER_KEYS, CUSTOMER_PROJECT_SORT_FIELDS, type CustomerProjectItem } from '../customers.api';
import { withReference } from '../customers.errors';
import { useCustomerProjects } from '../customers.queries';

/**
 * Contrato de `GET /projects?customerId=` fijado por el Módulo 3 (03 F.1,
 * AC-03.86). Los filtros se leen de la URL (con el prefijo `projects.`) y se
 * envían tal cual; sus selectores llegarán con las opciones del Módulo 3
 * (`/projects/form-options`, `/projects/owner-options`).
 */
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;
const PARAM_PREFIX = 'projects.';

const COLUMNS: DataTableColumn<CustomerProjectItem>[] = [
  { id: 'code', header: 'Código', sortable: true, primary: true, render: (project) => project.code },
  { id: 'name', header: 'Nombre', sortable: true, render: (project) => <Box sx={{ overflowWrap: 'anywhere' }}>{project.name}</Box> },
  { id: 'location', header: 'Ubicación', hideOnMobile: true, render: (project) => formatLocation(project.city, project.country.name) },
  {
    // `phaseOrder` es el campo de orden de la API (orden del catálogo de fases).
    id: 'phaseOrder',
    header: 'Fase',
    sortable: true,
    render: (project) => `${project.phase.label} · ${formatPercent(project.phase.progress)}`,
  },
  { id: 'commercialStatus', header: 'Estado comercial', hideOnMobile: true, render: (project) => project.commercialStatus.label },
  { id: 'owner', header: 'Asesor responsable', hideOnMobile: true, render: (project) => project.owner.displayName },
  {
    id: 'estimatedDecisionDate',
    header: 'Fecha estimada de decisión',
    sortable: true,
    hideOnMobile: true,
    render: (project) => formatCalendarDate(project.estimatedDecisionDate),
  },
];

function SectionCard({ titleId, children }: { titleId: string; children: ReactNode }) {
  return (
    <Card component="section" aria-labelledby={titleId}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography id={titleId} variant="h6" component="h2">
          Proyectos
        </Typography>
      </Box>
      {children}
    </Card>
  );
}

function ProjectsTable({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const table = useTableQueryState<(typeof CUSTOMER_PROJECT_FILTER_KEYS)[number]>({
    filterKeys: CUSTOMER_PROJECT_FILTER_KEYS,
    sortableFields: CUSTOMER_PROJECT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    paramPrefix: PARAM_PREFIX,
  });
  const projects = useCustomerProjects(customerId, table.apiQuery, true);

  return (
    <>
      <ListToolbar search={{ value: table.searchInput, onChange: table.setSearchInput, label: 'Buscar proyectos por código o nombre' }} />
      <DataTable
        label="Proyectos del cliente"
        columns={COLUMNS}
        rows={projects.data?.data}
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
        errorMessage={projects.isError ? withReference(describeApiError(projects.error)) : null}
        onRetry={() => void projects.refetch()}
        emptyTitle="Este cliente no tiene proyectos visibles para ti"
        emptyDescription={table.state.search ? 'Prueba con otra búsqueda.' : undefined}
        emptyIcon={<FolderOutlinedIcon />}
        onRowClick={(project) => navigate(projectDetailPath(project.id))}
        getRowLabel={(project) => `Abrir el proyecto ${project.name} (${project.code})`}
      />
    </>
  );
}

/**
 * Proyectos del cliente (02 §E.6, F-08) contra el contrato del Módulo 3.
 * La pantalla sólo la monta con `proyectos.ver`. Mientras el menú del usuario
 * no tenga la opción de Proyectos (D-02.10) muestra un estado informativo y no
 * llama a `/projects`.
 */
export function CustomerProjectsSection({ customerId }: { customerId: string }) {
  const titleId = useId();
  const availability = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);

  if (availability.status === 'loading') {
    return (
      <SectionCard titleId={titleId}>
        <Stack role="status" aria-label="Cargando proyectos" spacing={1} sx={{ p: 2 }}>
          <Skeleton variant="text" />
          <Skeleton variant="text" />
        </Stack>
      </SectionCard>
    );
  }

  if (availability.status === 'unavailable') {
    return (
      <SectionCard titleId={titleId}>
        <EmptyState
          icon={<HourglassEmptyOutlinedIcon />}
          title="Disponible próximamente"
          description="Los proyectos del cliente se mostrarán cuando el módulo de Proyectos esté disponible."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard titleId={titleId}>
      <ProjectsTable customerId={customerId} />
    </SectionCard>
  );
}
