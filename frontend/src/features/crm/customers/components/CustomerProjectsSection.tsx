import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { Box, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, EmptyState, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { describeApiError } from '@/lib/api-error-view';

import { formatDate, formatLocation, orDash } from '../customer-format';
import type { CustomerProjectItem } from '../customers.api';
import { withReference } from '../customers.errors';
import { useCustomerProjects } from '../customers.queries';

/**
 * Filtros del contrato del Módulo 3 (02 §F.7). Se leen de la URL (con el
 * prefijo `projects.`) y se envían tal cual; sus selectores llegarán cuando el
 * Módulo 3 publique las opciones de fase, asesor y estado comercial.
 */
const FILTER_KEYS = ['phaseId', 'ownerId', 'commercialStatus'] as const;
/** Columnas que se ofrecen como ordenables; el Módulo 3 fija la lista blanca definitiva (03 F.1). */
const SORTABLE = ['code', 'name', 'estimatedDecisionDate'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;
const PARAM_PREFIX = 'projects.';
/** Ruta de detalle del Módulo 3 (02 §F.7). */
const PROJECT_DETAIL_PATH = '/proyectos/:projectId';

const COLUMNS: DataTableColumn<CustomerProjectItem>[] = [
  { id: 'code', header: 'Código', sortable: true, primary: true, render: (project) => project.code },
  { id: 'name', header: 'Nombre', sortable: true, render: (project) => <Box sx={{ overflowWrap: 'anywhere' }}>{project.name}</Box> },
  { id: 'location', header: 'Ubicación', hideOnMobile: true, render: (project) => formatLocation(project.city, project.country?.name) },
  {
    id: 'phase',
    header: 'Fase',
    render: (project) =>
      project.phase ? `${project.phase.label}${project.phase.progress !== null ? ` · ${project.phase.progress} %` : ''}` : '—',
  },
  { id: 'commercialStatus', header: 'Estado comercial', hideOnMobile: true, render: (project) => orDash(project.commercialStatus?.label) },
  { id: 'owner', header: 'Asesor responsable', hideOnMobile: true, render: (project) => orDash(project.owner?.displayName) },
  {
    id: 'estimatedDecisionDate',
    header: 'Fecha estimada de decisión',
    sortable: true,
    hideOnMobile: true,
    render: (project) => formatDate(project.estimatedDecisionDate),
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
  const table = useTableQueryState<(typeof FILTER_KEYS)[number]>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
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
        onRowClick={(project) => navigate(PROJECT_DETAIL_PATH.replace(':projectId', encodeURIComponent(project.id)))}
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
