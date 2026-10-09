import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useMemo, useState } from 'react';

import { describeApiError, EmptyState } from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import type { TeamMember } from '../teams.api';
import { TEAM_PERMISSIONS } from '../teams.permissions';
import { useReplaceTeamMembers, useTeam } from '../teams.queries';
import { UserPicker } from './UserPicker';
import { TEAM_MEMBERS_ERRORS } from '../teams.errors';


export interface TeamMembersDialogProps {
  teamId: string | null;
  onClose: () => void;
}

/**
 * Editor de miembros: añadir (búsqueda de usuarios), quitar y marcar el equipo
 * principal. Se guarda en bloque con `PUT /teams/{id}/members`. Marcar
 * "principal" aquí lo desmarca en los otros equipos del usuario (lo hace el
 * backend en la misma transacción).
 */
export function TeamMembersDialog({ teamId, onClose }: TeamMembersDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const canSearchUsers = usePermission(TEAM_PERMISSIONS.searchUsers);
  const team = useTeam(teamId);
  const mutation = useReplaceTeamMembers();
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (team.data) {
      setMembers(team.data.members);
    }
  }, [team.data]);

  useEffect(() => {
    if (teamId) {
      mutation.reset();
    }
    // Sólo al abrir con otro equipo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const memberIds = useMemo(() => new Set(members.map((member) => member.userId)), [members]);
  const error = mutation.isError ? describeApiError(mutation.error, TEAM_MEMBERS_ERRORS) : null;
  const isPending = mutation.isPending;

  const save = () => {
    if (!teamId) return;
    mutation.mutate(
      { teamId, members: members.map(({ userId, isPrimary }) => ({ userId, isPrimary })) },
      { onSuccess: onClose },
    );
  };

  let content;
  if (team.isError) {
    content = <Alert severity="error">{describeApiError(team.error).message}</Alert>;
  } else if (team.isPending) {
    content = (
      <Stack role="status" aria-label="Cargando" spacing={1}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </Stack>
    );
  } else {
    content = (
      <Stack spacing={2}>
        {canSearchUsers ? (
          <UserPicker
            label="Añadir miembro"
            value={null}
            clearOnSelect
            excludeIds={memberIds}
            disabled={isPending}
            onChange={(user) => {
              if (user && !memberIds.has(user.id)) {
                setMembers((current) => [
                  ...current,
                  { userId: user.id, displayName: user.displayName, email: user.email, isPrimary: false },
                ]);
              }
            }}
          />
        ) : (
          <Alert severity="info">Necesitas permiso para consultar usuarios para añadir miembros.</Alert>
        )}
        {members.length === 0 ? (
          <EmptyState title="El equipo no tiene miembros" description="Busca usuarios para añadirlos." />
        ) : (
          <List aria-label="Miembros" disablePadding>
            {members.map((member) => (
              <ListItem
                key={member.userId}
                divider
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label={`Quitar a ${member.displayName}`}
                    disabled={isPending}
                    onClick={() => setMembers((current) => current.filter((item) => item.userId !== member.userId))}
                  >
                    <PersonRemoveOutlinedIcon />
                  </IconButton>
                }
              >
                <Stack sx={{ minWidth: 0, pr: 6 }}>
                  <ListItemText
                    primary={member.displayName}
                    secondary={member.email}
                    secondaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={member.isPrimary}
                        disabled={isPending}
                        onChange={(event) =>
                          setMembers((current) =>
                            current.map((item) =>
                              item.userId === member.userId ? { ...item, isPrimary: event.target.checked } : item,
                            ),
                          )
                        }
                      />
                    }
                    label="Equipo principal"
                  />
                </Stack>
              </ListItem>
            ))}
          </List>
        )}
        {error ? <Alert severity="error">{error.message}</Alert> : null}
      </Stack>
    );
  }

  return (
    <Dialog
      open={teamId !== null}
      onClose={isPending ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle id={titleId}>{team.data ? `Miembros de ${team.data.name}` : 'Miembros'}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Cada persona tiene como mucho un equipo principal: al marcarlo aquí se desmarca en sus otros equipos.
        </DialogContentText>
        {content}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={isPending || !team.data}>
          Guardar miembros
        </Button>
      </DialogActions>
    </Dialog>
  );
}
