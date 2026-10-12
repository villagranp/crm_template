import FilterListIcon from '@mui/icons-material/FilterList';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Button, Chip, Collapse, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useProfile } from '@/hooks/use-profile';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';

import { CommercialStatusChip } from './components/CommercialStatusChip';
import { OwnerPicker } from './components/OwnerPicker';
import { PhaseChip } from './components/PhaseChip';
import { splitList } from './components/project-filter-options';
import { MultiSelectFilter } from './components/ProjectFilters';
import { formatCalendarDate, formatDateTime, formatRelativeDateTime, PROJECT_FIELD_LABELS, scopeDescription } from './project-format';
import { projectDetailPath } from './project-paths';
import {
  TEAM_VIEW_FILTER_KEYS,
  TEAM_VIEW_SORT_FIELDS,
  type OwnerOption,
  type TeamProjectItem,
  type TeamViewFilterKey,
} from './projects.api';
import { PROJECT_ERROR_MESSAGES, withReference } from './projects.errors';
import { useProjectFormOptions, useTeamOptions, useTeamProjects } from './projects.queries';

const TITLE = 'Proyectos del equipo';
/** AC-03.27: por defecto, última actualización descendente. */
const DEFAULT_SORT = { field: 'lastActivityAt', direction: 'desc' } as const;

type TeamFilterValues = Partial<Record<TeamViewFilterKey, string>>;

const COLUMNS: DataTableColumn<TeamProjectItem>[] = [
  {
    id: 'name',
    header: 'Proyecto',
    sortable: true,
    primary: true,
    render: (project) => (
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {project.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {project.code}
        </Typography>
      </Box>
    ),
  },
  { id: 'customer', header: 'Cliente', render: (project) => <Box sx={{ overflowWrap: 'anywhere' }}>{project.customer.legalName}</Box> },
  { id: 'ownerName', header: 'Responsable', sortable: true, render: (project) => project.owner.displayName },
  { id: 'teamName', header: 'Equipo', sortable: true, hideOnMobile: true, render: (project) => project.team?.name ?? 'Sin equipo' },
  { id: 'phaseOrder', header: 'Fase', sortable: true, render: (project) => <PhaseChip label={project.phase.label} progress={project.phase.progress} /> },
  { id: 'commercialStatus', header: 'Estado comercial', hideOnMobile: true, render: (project) => <CommercialStatusChip status={project.commercialStatus} /> },
  {
    id: 'lastActivityAt',
    header: 'Última actualización',
    sortable: true,
    render: (project) => (
      <Box>
        <Typography variant="body2">{formatRelativeDateTime(project.lastActivityAt)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(project.lastActivityAt)}
        </Typography>
      </Box>
    ),
  },
  {
    id: 'access',
    header: 'Acceso',
    render: (project) =>
      project.capabilities.canEdit ? null : (
        <Chip size="small" variant="outlined" icon={<LockOutlinedIcon />} label="Solo lectura" />
      ),
  },
];

function TeamFilters({ values, ownerName, onApply }: { values: TeamFilterValues; ownerName: string | null; onApply: (values: TeamFilterValues) => void }) {
  const options = useProjectFormOptions();
  const teams = useTeamOptions();
  const [draft, setDraft] = useState<TeamFilterValues>(values);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(values);
    setDateError(null);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: ownerName ?? 'Responsable seleccionado', countryId: null, primaryTeam: null } : null);
  }, [values, ownerName]);

  const set = (key: TeamViewFilterKey, value: string | undefined) => setDraft((current) => ({ ...current, [key]: value }));
  const multi = (key: 'teamId' | 'phaseId' | 'countryId', choices: { value: string; label: string }[], disabled: boolean) => (
    <MultiSelectFilter
      label={PROJECT_FIELD_LABELS[key]}
      values={splitList(draft[key])}
      options={choices}
      onChange={(selected) => set(key, selected.length > 0 ? selected.join(',') : undefined)}
      disabled={disabled}
    />
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.lastActivityFrom && draft.lastActivityTo && draft.lastActivityFrom > draft.lastActivityTo) {
      setDateError('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    onApply({ ...draft, ownerId: owner?.id });
  };

  return (
    <Box component="form" role="search" aria-label="Filtros de proyectos del equipo" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        {multi('teamId', (teams.data?.data ?? []).map((team) => ({ value: team.id, label: team.name })), !teams.data)}
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <OwnerPicker label="Responsable" purpose="FILTER" value={owner} onChange={setOwner} />
        </Box>
        {multi('phaseId', (options.data?.phases ?? []).map((phase) => ({ value: phase.id, label: phase.label })), !options.data)}
        {multi('countryId', (options.data?.countries ?? []).map((country) => ({ value: country.id, label: country.name })), !options.data)}
        <TextField
          size="small"
          type="date"
          label={PROJECT_FIELD_LABELS.lastActivityFrom}
          value={draft.lastActivityFrom ?? ''}
          onChange={(event) => set('lastActivityFrom', event.target.value || undefined)}
          error={Boolean(dateError)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={PROJECT_FIELD_LABELS.lastActivityTo}
          value={draft.lastActivityTo ?? ''}
          onChange={(event) => set('lastActivityTo', event.target.value || undefined)}
          error={Boolean(dateError)}
          helperText={dateError ?? undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

function filterChipText(key: TeamViewFilterKey, value: string, ownerName: string | null, labels: Map<string, string>): string {
  if (key === 'ownerId') return ownerName ?? 'Seleccionado';
  if (key === 'lastActivityFrom' || key === 'lastActivityTo') return formatCalendarDate(value);
  return splitList(value)
    .map((item) => labels.get(item) ?? 'Seleccionado')
    .join(', ');
}

/**
 * Proyectos del equipo (03 §E.6, F-14). Ruta protegida con `proyectos.ver`;
 * opción de menú `proyectos-equipo`.
 *
 * La lista la decide el backend por alcance (OWN, TEAM con subequipos, COUNTRY,
 * ORGANIZATION; AC-03.26). "Ver" no es "editar": los proyectos que el usuario
 * no puede editar llevan "Solo lectura" (`capabilities.canEdit = false`).
 */
export function TeamProjectsPage() {
  const navigate = useNavigate();
  const panelId = useId();
  const profile = useProfile();
  const options = useProjectFormOptions();
  const teams = useTeamOptions();
  const table = useTableQueryState<TeamViewFilterKey>({
    filterKeys: TEAM_VIEW_FILTER_KEYS,
    sortableFields: TEAM_VIEW_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters, search } = table.state;
  const projects = useTeamProjects(table.apiQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeEntries = (Object.entries(filters) as [TeamViewFilterKey, string | undefined][]).filter(
    (entry): entry is [TeamViewFilterKey, string] => Boolean(entry[1]),
  );
  const hasFilters = Boolean(search) || activeEntries.length > 0;
  const rows = projects.data?.data;
  const ownerName = (filters.ownerId && rows?.find((row) => row.owner.id === filters.ownerId)?.owner.displayName) || null;
  const labels = new Map<string, string>([
    ...(teams.data?.data ?? []).map((team): [string, string] => [team.id, team.name]),
    ...(options.data?.phases ?? []).map((phase): [string, string] => [phase.id, phase.label]),
    ...(options.data?.countries ?? []).map((country): [string, string] => [country.id, country.name]),
  ]);

  const scopeText = profile.data ? scopeDescription(profile.data.dataScope, profile.data.teams.map((team) => team.name)) : null;

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: TITLE })} />

      {scopeText ? (
        <Alert severity="info" icon={<GroupsOutlinedIcon />} sx={{ mb: 2 }} role="status">
          {`${scopeText} Los que no puedes editar aparecen como "Solo lectura".`}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Proyectos del equipo" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<FilterListIcon />}
              aria-expanded={filtersOpen}
              aria-controls={panelId}
              onClick={() => setFiltersOpen((open) => !open)}
              sx={{ flex: '0 0 auto', borderColor: 'divider' }}
            >
              {activeEntries.length > 0 ? `Filtros (${activeEntries.length})` : 'Filtros'}
            </Button>
          }
          search={{ value: table.searchInput, onChange: table.setSearchInput, label: 'Buscar por nombre o código', placeholder: 'Buscar proyectos…' }}
        >
          <Collapse in={filtersOpen} id={panelId}>
            <TeamFilters values={filters} ownerName={ownerName} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          {activeEntries.length > 0 ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
              {activeEntries.map(([key, value]) => (
                <Chip
                  key={key}
                  label={`${PROJECT_FIELD_LABELS[key]}: ${filterChipText(key, value, ownerName, labels)}`}
                  onDelete={() => table.setFilter(key, undefined)}
                />
              ))}
              <Button size="small" variant="text" onClick={() => table.clearFilters()}>
                Limpiar
              </Button>
            </Stack>
          ) : null}
        </ListToolbar>

        <DataTable
          label="Proyectos del equipo"
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
          emptyTitle={hasFilters ? 'No hay proyectos que coincidan con los filtros' : 'Tu equipo aún no tiene proyectos'}
          emptyDescription={hasFilters ? 'Prueba con otra búsqueda o quita algún filtro.' : 'Aquí verás los proyectos de tu alcance.'}
          emptyIcon={hasFilters ? undefined : <GroupsOutlinedIcon />}
          emptyAction={
            hasFilters ? (
              <Button variant="outlined" onClick={() => table.clearFilters()}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
          onRowClick={(project) => navigate(projectDetailPath(project.id))}
          getRowLabel={(project) =>
            `Abrir el proyecto ${project.name} (${project.code})${project.capabilities.canEdit ? '' : ', solo lectura'}`
          }
        />
      </Paper>
    </>
  );
}
