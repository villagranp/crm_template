import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import { describeApiError } from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import { TEAMS_ADMIN_ONLY_NOTE } from '../users-access';
import { USER_TEAMS_ERRORS } from '../users-format';
import type { UserDetail } from '../users.api';
import { USER_PERMISSIONS } from '../users.permissions';
import type { TeamAssignmentValue } from '../users.schemas';
import { useAssignableTeams, useReplaceUserTeams } from '../users.queries';

import { UserTeamsEditor } from './UserTeamsEditor';

export interface UserTeamsPanelProps {
  user: Pick<UserDetail, 'id' | 'teams'>;
}

function toValue(teams: UserDetail['teams']): TeamAssignmentValue[] {
  return teams.map((team) => ({ teamId: team.id, name: team.name, isPrimary: team.isPrimary }));
}

function sameTeams(a: readonly TeamAssignmentValue[], b: readonly TeamAssignmentValue[]): boolean {
  return (
    a.length === b.length &&
    a.every((team) => b.some((other) => other.teamId === team.teamId && other.isPrimary === team.isPrimary))
  );
}

/**
 * Equipos del usuario en su ficha (07 E.1, D-07.4). Editable sólo por un
 * administrador con `equipos.editar` (y `equipos.ver` para elegir): cambiar
 * los equipos cambia lo que ve con alcance «Su equipo» (DM-12, addendum
 * ADR-020). Para el resto, solo lectura. Ocultar es UX: el backend responde
 * `403 ADMIN_ONLY` igualmente.
 */
export function UserTeamsPanel({ user }: UserTeamsPanelProps) {
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  const hasEditPermission = can(USER_PERMISSIONS.editTeams);
  const editable = hasEditPermission && isAdministrador && can(USER_PERMISSIONS.viewTeams);
  const teams = useAssignableTeams(editable);
  const mutation = useReplaceUserTeams(user.id);
  const [value, setValue] = useState<TeamAssignmentValue[]>(() => toValue(user.teams));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(toValue(user.teams));
  }, [user.teams]);

  if (!editable) {
    return (
      <Stack spacing={1}>
        {hasEditPermission && !isAdministrador ? (
          <Typography variant="caption" color="text.secondary" component="p">
            {TEAMS_ADMIN_ONLY_NOTE}
          </Typography>
        ) : null}
        {user.teams.length === 0 ? (
          <Typography variant="body2">Sin equipo.</Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {user.teams.map((team) => (
              <Chip
                key={team.id}
                label={team.isPrimary ? `${team.name} (principal)` : team.name}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  const dirty = !sameTeams(value, toValue(user.teams));

  return (
    <Stack spacing={2}>
      <UserTeamsEditor
        value={value}
        onChange={(next) => {
          setSaved(false);
          mutation.reset();
          setValue(next);
        }}
        options={teams.data ?? []}
        loading={teams.isPending}
        optionsError={teams.isError ? describeApiError(teams.error).message : null}
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <Alert severity="error">{describeApiError(mutation.error, USER_TEAMS_ERRORS).message}</Alert>
      ) : null}
      {saved ? <Alert severity="success">Equipos actualizados.</Alert> : null}
      <Box>
        <Button
          disabled={!dirty || mutation.isPending}
          onClick={() =>
            mutation.mutate(
              value.map(({ teamId, isPrimary }) => ({ teamId, isPrimary })),
              { onSuccess: () => setSaved(true) },
            )
          }
        >
          Guardar equipos
        </Button>
      </Box>
    </Stack>
  );
}
