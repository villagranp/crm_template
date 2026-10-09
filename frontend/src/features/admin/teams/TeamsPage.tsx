import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import {
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { TeamFormDialog } from './components/TeamFormDialog';
import { TeamMembersDialog } from './components/TeamMembersDialog';
import { TeamTree } from './components/TeamTree';
import type { Team } from './teams.api';
import { TEAM_PERMISSIONS } from './teams.permissions';
import { useDeleteTeam, useTeams } from './teams.queries';
import { TEAM_DELETE_ERRORS } from './teams.errors';

const TITLE = 'Equipos';
const FILTER_KEYS = ['isActive'] as const;
const SORTABLE = ['name', 'code', 'createdAt', 'updatedAt'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;


const COLUMNS: DataTableColumn<Team>[] = [
  { id: 'name', header: 'Nombre', render: (team) => team.name, sortable: true, primary: true },
  { id: 'code', header: 'Código', render: (team) => team.code, sortable: true },
  { id: 'parent', header: 'Depende de', render: (team) => team.parentName ?? '—', hideOnMobile: true },
  { id: 'manager', header: 'Responsable', render: (team) => team.manager?.displayName ?? '—', hideOnMobile: true },
  { id: 'members', header: 'Miembros', render: (team) => team.memberCount, align: 'right' },
  {
    id: 'status',
    header: 'Estado',
    render: (team) => (
      <Chip size="small" color={team.isActive ? 'success' : 'default'} label={team.isActive ? 'Activo' : 'Inactivo'} />
    ),
  },
];

type View = 'table' | 'tree';
type FormState = { open: false } | { open: true; team: Team | null };

/** Pantalla de administración «Equipos». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function TeamsPage() {
  const can = useCan();
  const [view, setView] = useState<View>('table');
  const [form, setForm] = useState<FormState>({ open: false });
  const [membersTeamId, setMembersTeamId] = useState<string | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  const table = useTableQueryState<'isActive'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const teams = useTeams(table.apiQuery);
  const deleteMutation = useDeleteTeam();

  const canCreate = can(TEAM_PERMISSIONS.create);
  const canEdit = can(TEAM_PERMISSIONS.edit);
  const canDelete = can(TEAM_PERMISSIONS.remove);

  const rowActions = (team: Team) => (
    <>
      {canEdit ? (
        <>
          <IconButton aria-label={`Editar ${team.name}`} onClick={() => setForm({ open: true, team })}>
            <EditOutlinedIcon />
          </IconButton>
          <IconButton aria-label={`Miembros de ${team.name}`} onClick={() => setMembersTeamId(team.id)}>
            <GroupOutlinedIcon />
          </IconButton>
        </>
      ) : null}
      {canDelete ? (
        <IconButton
          aria-label={`Eliminar ${team.name}`}
          onClick={() => {
            deleteMutation.reset();
            setTeamToDelete(team);
          }}
        >
          <DeleteOutlineIcon />
        </IconButton>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Jerarquía de equipos, responsables y miembros."
        breadcrumbs={adminBreadcrumbs(TITLE)}
        actions={
          canCreate ? (
            <Button startIcon={<AddIcon />} onClick={() => setForm({ open: true, team: null })}>
              Nuevo equipo
            </Button>
          ) : null
        }
      />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_, next: View | null) => next && setView(next)}
            aria-label="Vista"
          >
            <ToggleButton value="table" aria-label="Tabla">
              <TableRowsOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
              Tabla
            </ToggleButton>
            <ToggleButton value="tree" aria-label="Jerarquía">
              <AccountTreeOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
              Jerarquía
            </ToggleButton>
          </ToggleButtonGroup>
          {view === 'table' ? (
            <>
              <TextField
                label="Buscar por código o nombre"
                size="small"
                value={table.searchInput}
                onChange={(event) => table.setSearchInput(event.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                label="Estado"
                size="small"
                value={table.state.filters.isActive ?? ''}
                onChange={(event) => table.setFilter('isActive', event.target.value || undefined)}
                sx={{ minWidth: { sm: '12rem' } }}
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="true">Activos</MenuItem>
                <MenuItem value="false">Inactivos</MenuItem>
              </TextField>
            </>
          ) : null}
        </Stack>

        {view === 'table' ? (
          <DataTable
            label="Equipos"
            columns={COLUMNS}
            rows={teams.data?.data}
            getRowId={(team) => team.id}
            totalItems={teams.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            sort={table.state.sort}
            onSortChange={table.setSort}
            isLoading={teams.isPending}
            isFetching={teams.isFetching}
            errorMessage={teams.isError ? describeApiError(teams.error).message : null}
            onRetry={() => void teams.refetch()}
            emptyTitle="No hay equipos"
            rowActions={canEdit || canDelete ? rowActions : undefined}
          />
        ) : (
          <TeamTree rowActions={rowActions} />
        )}
      </Stack>

      <TeamFormDialog
        open={form.open}
        team={form.open ? form.team : null}
        onClose={() => setForm({ open: false })}
      />
      <TeamMembersDialog teamId={membersTeamId} onClose={() => setMembersTeamId(null)} />
      <ConfirmDialog
        open={teamToDelete !== null}
        title="Eliminar equipo"
        description={
          teamToDelete
            ? `Se eliminará «${teamToDelete.name}». Sólo es posible si no tiene miembros ni subequipos. Su código quedará reservado.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={deleteMutation.isPending}
        errorMessage={deleteMutation.isError ? describeApiError(deleteMutation.error, TEAM_DELETE_ERRORS).message : null}
        onConfirm={() => {
          if (teamToDelete) {
            deleteMutation.mutate(teamToDelete.id, { onSuccess: () => setTeamToDelete(null) });
          }
        }}
        onClose={() => setTeamToDelete(null)}
      />
    </>
  );
}
