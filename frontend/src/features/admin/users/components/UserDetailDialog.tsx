import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useState } from 'react';

import { env } from '@/config/env';
import { ConfirmDialog, describeApiError } from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { USER_ERRORS, USER_STATUS_VIEW, formatDate, formatDateTime } from '../users-format';
import type { UserDetail } from '../users.api';
import { USER_PERMISSIONS } from '../users.permissions';
import {
  useAssignableRoles,
  useChangeUserStatus,
  useMenuOptionCatalog,
  usePermissionCatalog,
  useReplaceUserMenuOptions,
  useReplaceUserPermissions,
  useReplaceUserRoles,
  useResetUserPassword,
  useUser,
  useUserAccess,
} from '../users.queries';

import { DirectAssignmentsPanel } from './DirectAssignmentsPanel';
import { UserFormDialog } from './UserFormDialog';

export interface UserDetailDialogProps {
  userId: string | null;
  onClose: () => void;
}

type TabKey = 'datos' | 'roles' | 'excepciones' | 'acceso';
type StatusAction = 'suspend' | 'reactivate';

const SUSPENDABLE = new Set(['ACTIVE', 'INVITED', 'LOCKED']);
const REACTIVATABLE = new Set(['SUSPENDED', 'LOCKED']);

/** Detalle de un usuario: datos, roles, excepciones directas y acceso efectivo con su origen. */
export function UserDetailDialog({ userId, onClose }: UserDetailDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const [tab, setTab] = useState<TabKey>('datos');
  const user = useUser(userId);

  useEffect(() => {
    if (userId) {
      setTab('datos');
    }
  }, [userId]);

  return (
    <Dialog open={userId !== null} onClose={onClose} aria-labelledby={titleId} fullScreen={fullScreen} fullWidth maxWidth="md">
      <DialogTitle id={titleId}>{user.data?.displayName ?? 'Usuario'}</DialogTitle>
      <DialogContent dividers>
        {user.isPending ? (
          <Stack role="status" aria-label="Cargando" spacing={1}>
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </Stack>
        ) : user.isError ? (
          <Alert severity="error">{describeApiError(user.error).message}</Alert>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_, value: TabKey) => setTab(value)}
              variant="scrollable"
              allowScrollButtonsMobile
              aria-label="Secciones del usuario"
              sx={{ mb: 2 }}
            >
              <Tab value="datos" label="Datos" />
              <Tab value="roles" label="Roles" />
              <Tab value="excepciones" label="Excepciones" />
              <Tab value="acceso" label="Acceso efectivo" />
            </Tabs>
            {tab === 'datos' ? <ProfileSection user={user.data} /> : null}
            {tab === 'roles' ? <RolesSection user={user.data} /> : null}
            {tab === 'excepciones' ? <ExceptionsSection user={user.data} /> : null}
            {tab === 'acceso' ? <AccessSection userId={user.data.id} /> : null}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ProfileSection({ user }: { user: UserDetail }) {
  const can = useCan();
  const canEdit = can(USER_PERMISSIONS.edit);
  const [editing, setEditing] = useState(false);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const statusMutation = useChangeUserStatus(user.id);
  const resetMutation = useResetUserPassword(user.id);
  const status = USER_STATUS_VIEW[user.status];

  const fields: [string, string][] = [
    ['Correo', user.email],
    ['Puesto', user.jobTitle ?? '—'],
    ['Teléfono', user.phone ?? '—'],
    ['Último acceso', formatDateTime(user.lastLoginAt)],
    ['Alta', formatDate(user.createdAt)],
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary">
          Estado:
        </Typography>
        <Chip size="small" color={status.color} label={status.label} />
      </Stack>

      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
        {fields.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box>
        <Typography variant="subtitle2" component="h3">
          Equipos
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
          Los miembros se gestionan desde la pantalla de Equipos.
        </Typography>
        {user.teams.length === 0 ? (
          <Typography variant="body2">Sin equipo.</Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {user.teams.map((team) => (
              <Chip key={team.id} label={team.isPrimary ? `${team.name} (principal)` : team.name} variant="outlined" />
            ))}
          </Stack>
        )}
      </Box>

      {notice ? (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      {canEdit ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
            Editar datos
          </Button>
          {SUSPENDABLE.has(user.status) ? (
            <Button
              variant="outlined"
              color="error"
              startIcon={<PauseCircleOutlineIcon />}
              onClick={() => {
                statusMutation.reset();
                setStatusAction('suspend');
              }}
            >
              Suspender
            </Button>
          ) : null}
          {REACTIVATABLE.has(user.status) ? (
            <Button
              variant="outlined"
              startIcon={<PlayCircleOutlineIcon />}
              onClick={() => {
                statusMutation.reset();
                setStatusAction('reactivate');
              }}
            >
              Reactivar
            </Button>
          ) : null}
          {env.VITE_AUTH_PROVIDER === 'local' ? (
            <Button
              variant="outlined"
              startIcon={<LockResetOutlinedIcon />}
              onClick={() => {
                resetMutation.reset();
                setConfirmReset(true);
              }}
            >
              Restablecer contraseña
            </Button>
          ) : null}
        </Stack>
      ) : null}

      <UserFormDialog open={editing} user={user} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={statusAction !== null}
        title={statusAction === 'suspend' ? 'Suspender usuario' : 'Reactivar usuario'}
        description={
          statusAction === 'suspend'
            ? `${user.displayName} perderá el acceso de inmediato y se cerrarán todas sus sesiones.`
            : `${user.displayName} podrá volver a entrar con sus roles actuales.`
        }
        confirmLabel={statusAction === 'suspend' ? 'Suspender' : 'Reactivar'}
        destructive={statusAction === 'suspend'}
        reason={{ label: 'Motivo', helperText: 'Queda en la bitácora. Mínimo 10 caracteres.' }}
        isPending={statusMutation.isPending}
        errorMessage={statusMutation.isError ? describeApiError(statusMutation.error, USER_ERRORS).message : null}
        onClose={() => setStatusAction(null)}
        onConfirm={(reason) => {
          if (statusAction) {
            statusMutation.mutate(
              { action: statusAction, reason },
              {
                onSuccess: () => {
                  setNotice(statusAction === 'suspend' ? 'Usuario suspendido. Sus sesiones se cerraron.' : 'Usuario reactivado.');
                  setStatusAction(null);
                },
              },
            );
          }
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Restablecer contraseña"
        description={`${user.displayName} tendrá la contraseña inicial y deberá cambiarla al entrar. Se cerrarán sus sesiones.`}
        confirmLabel="Restablecer"
        destructive
        isPending={resetMutation.isPending}
        errorMessage={resetMutation.isError ? describeApiError(resetMutation.error, USER_ERRORS).message : null}
        onClose={() => setConfirmReset(false)}
        onConfirm={() =>
          resetMutation.mutate(undefined, {
            onSuccess: () => {
              setNotice('Contraseña restablecida. Deberá cambiarla en su próximo acceso.');
              setConfirmReset(false);
            },
          })
        }
      />
    </Stack>
  );
}

function RolesSection({ user }: { user: UserDetail }) {
  const can = useCan();
  const canEdit = can(USER_PERMISSIONS.edit);
  const canListRoles = can(USER_PERMISSIONS.viewRoles);
  const roles = useAssignableRoles(canListRoles);
  const mutation = useReplaceUserRoles(user.id);
  const [selected, setSelected] = useState<string[]>(() => user.roles.map((role) => role.id));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(user.roles.map((role) => role.id));
  }, [user.roles]);

  if (!canEdit || !canListRoles) {
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {user.roles.map((role) => (
          <Chip key={role.id} label={role.name} />
        ))}
      </Stack>
    );
  }

  const options = (roles.data ?? []).filter((role) => role.isActive || selected.includes(role.id));
  const dirty =
    selected.length !== user.roles.length || selected.some((id) => !user.roles.some((role) => role.id === id));

  return (
    <Stack spacing={2}>
      {roles.isError ? <Alert severity="error">{describeApiError(roles.error).message}</Alert> : null}
      <FormGroup aria-label="Roles del usuario">
        {options.map((role) => (
          <FormControlLabel
            key={role.id}
            label={role.isSystem ? `${role.name} (sistema)` : role.name}
            control={
              <Checkbox
                checked={selected.includes(role.id)}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setSaved(false);
                  setSelected((current) =>
                    event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id),
                  );
                }}
              />
            }
          />
        ))}
      </FormGroup>
      {selected.length === 0 ? <Alert severity="warning">El usuario debe conservar al menos un rol.</Alert> : null}
      {mutation.isError ? <Alert severity="error">{describeApiError(mutation.error, USER_ERRORS).message}</Alert> : null}
      {saved ? <Alert severity="success">Roles actualizados.</Alert> : null}
      <Box>
        <Button
          disabled={!dirty || selected.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate(selected, { onSuccess: () => setSaved(true) })}
        >
          Guardar roles
        </Button>
      </Box>
    </Stack>
  );
}

function ExceptionsSection({ user }: { user: UserDetail }) {
  const can = useCan();
  const canEditPermissions = can(USER_PERMISSIONS.edit) && can(USER_PERMISSIONS.viewPermissions);
  const canEditMenu = can(USER_PERMISSIONS.assignMenuOptions) && can(USER_PERMISSIONS.viewMenuOptions);
  const permissions = usePermissionCatalog(canEditPermissions);
  const menuOptions = useMenuOptionCatalog(canEditMenu);
  const permissionMutation = useReplaceUserPermissions(user.id);
  const menuMutation = useReplaceUserMenuOptions(user.id);

  return (
    <Stack spacing={3}>
      <Box component="section" aria-labelledby="excepciones-permisos">
        <Typography id="excepciones-permisos" variant="subtitle1" component="h3" sx={{ mb: 1 }}>
          Permisos
        </Typography>
        <DirectAssignmentsPanel
          noun="permiso"
          canEdit={canEditPermissions}
          items={user.directPermissions.map((item) => ({ ...item, label: item.name, secondary: item.code }))}
          targets={(permissions.data ?? []).map((permission) => ({
            id: permission.id,
            label: `${permission.name} (${permission.code})`,
          }))}
          isPending={permissionMutation.isPending}
          errorMessage={permissionMutation.isError ? describeApiError(permissionMutation.error, USER_ERRORS).message : null}
          onResetError={() => permissionMutation.reset()}
          onReplace={(assignments, onDone) => permissionMutation.mutate(assignments, { onSuccess: onDone })}
        />
      </Box>
      <Box component="section" aria-labelledby="excepciones-opciones">
        <Typography id="excepciones-opciones" variant="subtitle1" component="h3" sx={{ mb: 1 }}>
          Opciones de menú
        </Typography>
        <DirectAssignmentsPanel
          noun="opción de menú"
          canEdit={canEditMenu}
          items={user.directMenuOptions.map((item) => ({ ...item, label: item.label, secondary: item.key }))}
          targets={(menuOptions.data ?? []).map((option) => ({
            id: option.id,
            label: option.label,
            group: option.module.name,
          }))}
          isPending={menuMutation.isPending}
          errorMessage={menuMutation.isError ? describeApiError(menuMutation.error, USER_ERRORS).message : null}
          onResetError={() => menuMutation.reset()}
          onReplace={(assignments, onDone) => menuMutation.mutate(assignments, { onSuccess: onDone })}
        />
      </Box>
    </Stack>
  );
}

function AccessSection({ userId }: { userId: string }) {
  const access = useUserAccess(userId);

  if (access.isPending) {
    return <Skeleton variant="rectangular" role="status" aria-label="Cargando" />;
  }
  if (access.isError) {
    return <Alert severity="error">{describeApiError(access.error).message}</Alert>;
  }
  if (access.data.origins.length === 0) {
    return <Alert severity="info">El usuario no tiene ningún permiso.</Alert>;
  }

  return (
    <TableContainer className="scroll-x">
      <Table size="small" aria-label="Permisos efectivos y su origen">
        <TableHead>
          <TableRow>
            <TableCell>Permiso</TableCell>
            <TableCell>Resultado</TableCell>
            <TableCell>Origen</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {access.data.origins.map((origin) => (
            <TableRow key={origin.code}>
              <TableCell>{origin.code}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={origin.effective ? 'success' : 'error'}
                  label={origin.effective ? 'Concedido' : 'Denegado'}
                />
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {origin.roles.map((role) => (
                    <Chip key={role} size="small" variant="outlined" label={`Rol: ${role}`} />
                  ))}
                  {origin.grant ? (
                    <Chip size="small" variant="outlined" color="success" label="Concesión directa" title={origin.grant.reason} />
                  ) : null}
                  {origin.deny ? (
                    <Chip size="small" variant="outlined" color="error" label="Denegación directa" title={origin.deny.reason} />
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
