import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import { Chip, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  FilterChips,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  RowIdentity,
  useFilterCounts,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import { TeamFormDialog } from './components/TeamFormDialog';
import { TeamMembersDialog } from './components/TeamMembersDialog';
import { TeamTree } from './components/TeamTree';
import { listTeams, type Team } from './teams.api';
import { TEAM_PERMISSIONS } from './teams.permissions';
import { teamKeys, useDeleteTeam, useTeams } from './teams.queries';
import { TEAM_DELETE_ERRORS } from './teams.errors';

const TITLE = 'Equipos';
const DESCRIPTION = 'Jerarquía de equipos, responsables y miembros.';
const FILTER_KEYS = ['isActive'] as const;
const SORTABLE = ['name', 'code', 'createdAt', 'updatedAt'] as const;
const DEFAULT_SORT = { field: 'name', direction: 'asc' } as const;
/** Chips de estado (`isActive`). */
const STATUS_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Activos' },
  { value: 'false', label: 'Inactivos' },
] as const;
const STATUS_CHIP_VALUES: readonly string[] = STATUS_CHIPS.map((chip) => chip.value);

const COLUMNS: DataTableColumn<Team>[] = [
  {
    id: 'name',
    header: 'Nombre',
    render: (team) => <RowIdentity name={team.name} />,
    sortable: true,
    primary: true,
  },
  { id: 'code', header: 'Código', render: (team) => team.code, sortable: true },
  {
    id: 'parent',
    header: 'Depende de',
    render: (team) => team.parentName ?? '—',
    hideOnMobile: true,
  },
  {
    id: 'manager',
    header: 'Responsable',
    render: (team) => team.manager?.displayName ?? '—',
    hideOnMobile: true,
  },
  { id: 'members', header: 'Miembros', render: (team) => team.memberCount, align: 'right' },
  {
    id: 'status',
    header: 'Estado',
    render: (team) => (
      <Chip
        size="small"
        color={team.isActive ? 'success' : 'default'}
        label={team.isActive ? 'Activo' : 'Inactivo'}
      />
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
  const queryClient = useQueryClient();
  const statusCounts = useFilterCounts({
    baseQuery: table.apiQuery,
    filterKey: 'isActive',
    values: STATUS_CHIP_VALUES,
    queryKey: teamKeys.list,
    queryFn: listTeams,
    enabled: view === 'table',
  });

  const isAdministrador = useIsAdministrador();
  const canCreate = can(TEAM_PERMISSIONS.create);
  const canEdit = can(TEAM_PERMISSIONS.edit);
  const canDelete = can(TEAM_PERMISSIONS.remove);
  // 07 RN-07.45 (addendum ADR-020): cambiar miembros y eliminar un equipo con
  // miembros o subequipos es asignación de acceso, sólo del administrador.
  // Ocultarlo es UX: el backend responde 403 ADMIN_ONLY igualmente.
  const canEditMembers = canEdit && isAdministrador;
  const canDeleteTeam = (team: Team) =>
    canDelete && (isAdministrador || (team.memberCount === 0 && team.childCount === 0));

  const rowActions = (team: Team) => (
    <>
      {canEdit ? (
        <IconButton
          aria-label={`Editar ${team.name}`}
          onClick={() => setForm({ open: true, team })}
        >
          <EditOutlinedIcon />
        </IconButton>
      ) : null}
      {canEditMembers ? (
        <IconButton
          aria-label={`Miembros de ${team.name}`}
          onClick={() => setMembersTeamId(team.id)}
        >
          <GroupOutlinedIcon />
        </IconButton>
      ) : null}
      {canDeleteTeam(team) ? (
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
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

      <AdminListCard
        icon={<GroupsOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(
          view === 'table' ? teams.data?.pagination.totalItems : undefined,
          DESCRIPTION,
        )}
        tools={
          <>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_, next: View | null) => next && setView(next)}
              aria-label="Vista"
              sx={{ mr: 0.5 }}
            >
              <ToggleButton value="table" aria-label="Tabla">
                <Tooltip title="Tabla">
                  <TableRowsOutlinedIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="tree" aria-label="Jerarquía">
                <Tooltip title="Jerarquía">
                  <AccountTreeOutlinedIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
            <RefreshTool
              busy={teams.isFetching}
              onRefresh={() => void queryClient.invalidateQueries({ queryKey: teamKeys.all })}
            />
          </>
        }
        toolbar={
          <ListToolbar
            filters={
              view === 'table' ? (
                <FilterChips
                  label="Filtrar por estado"
                  value={table.state.filters.isActive ?? ''}
                  onChange={(value) => table.setFilter('isActive', value || undefined)}
                  options={STATUS_CHIPS.map((chip) => ({
                    ...chip,
                    count: statusCounts[chip.value],
                  }))}
                />
              ) : undefined
            }
            search={
              view === 'table'
                ? {
                    value: table.searchInput,
                    onChange: table.setSearchInput,
                    label: 'Buscar por código o nombre',
                  }
                : undefined
            }
            primaryAction={
              canCreate
                ? { label: 'Nuevo equipo', onClick: () => setForm({ open: true, team: null }) }
                : undefined
            }
          />
        }
      >
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
      </AdminListCard>

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
        errorMessage={
          deleteMutation.isError
            ? describeApiError(deleteMutation.error, TEAM_DELETE_ERRORS).message
            : null
        }
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
