import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useMemo, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { describeApiError } from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import { buildTeamTree, teamWithDescendants } from '../team-tree';
import type { Team, TeamDetail } from '../teams.api';
import { TEAM_PERMISSIONS } from '../teams.permissions';
import { useCreateTeam, useTeamHierarchy, useUpdateTeam } from '../teams.queries';
import { teamFormSchema, type TeamFormValues } from '../teams.schemas';

import { UserPicker } from './UserPicker';
import { TEAM_FORM_ERRORS } from '../teams.errors';

/** Mensajes propios de esta pantalla (ganan sobre los comunes de `describeApiError`). */

const INDENT = '  ';

export interface TeamFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  team: Team | TeamDetail | null;
  onClose: () => void;
}

function defaults(team: Team | null): TeamFormValues {
  return {
    code: team?.code ?? '',
    name: team?.name ?? '',
    description: team?.description ?? '',
    parentId: team?.parentId ?? '',
    manager: team?.manager ?? null,
    isActive: team?.isActive ?? true,
  };
}

/** Alta y edición de un equipo. El código sólo se escribe en el alta: después es inmutable. */
export function TeamFormDialog({ open, team, onClose }: TeamFormDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const canSearchUsers = usePermission(TEAM_PERMISSIONS.searchUsers);
  const isEdit = team !== null;
  const hierarchy = useTeamHierarchy(open);
  const createMutation = useCreateTeam();
  const updateMutation = useUpdateTeam();
  const mutation = isEdit ? updateMutation : createMutation;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TeamFormValues>({ resolver: zodResolver(teamFormSchema), defaultValues: defaults(team) });

  useEffect(() => {
    if (open) {
      reset(defaults(team));
      createMutation.reset();
      updateMutation.reset();
    }
    // Las mutaciones se reinician sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team, reset]);

  /** Padres posibles: todos menos el propio equipo y sus descendientes (evita `TEAM_CYCLE`). */
  const parentOptions = useMemo(() => {
    const teams = hierarchy.data ?? [];
    const excluded = team ? teamWithDescendants(team.id, teams) : new Set<string>();
    return buildTeamTree(teams).filter((row) => !excluded.has(row.team.id));
  }, [hierarchy.data, team]);

  const submit = handleSubmit((values) => {
    const common = {
      name: values.name,
      description: values.description || null,
      parentId: values.parentId || null,
      managerId: values.manager?.id ?? null,
      isActive: values.isActive,
    };
    const onSuccess = () => onClose();
    if (team) {
      updateMutation.mutate({ teamId: team.id, body: common }, { onSuccess });
    } else {
      createMutation.mutate({ code: values.code, ...common }, { onSuccess });
    }
  });

  const error = mutation.isError ? describeApiError(mutation.error, TEAM_FORM_ERRORS) : null;
  const isPending = mutation.isPending;

  return (
    <Dialog
      open={open}
      onClose={isPending ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      PaperProps={{
        component: 'form',
        noValidate: true,
        onSubmit: (event: FormEvent<HTMLFormElement>) => {
          void submit(event);
        },
      }}
    >
      <DialogTitle id={titleId}>{isEdit ? `Editar equipo ${team.name}` : 'Nuevo equipo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            {...register('code')}
            label="Código"
            required={!isEdit}
            disabled={isEdit || isPending}
            error={Boolean(errors.code)}
            helperText={errors.code?.message ?? (isEdit ? 'El código no se puede cambiar.' : 'Único. No se podrá cambiar.')}
          />
          <TextField
            {...register('name')}
            label="Nombre"
            required
            disabled={isPending}
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <TextField
                select
                label="Equipo padre"
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || hierarchy.isPending}
                helperText={
                  hierarchy.isError
                    ? 'No se pudo cargar la lista de equipos.'
                    : 'Un equipo no puede depender de sí mismo ni de sus subequipos.'
                }
                error={hierarchy.isError}
              >
                <MenuItem value="">Ninguno (equipo raíz)</MenuItem>
                {parentOptions.map(({ team: option, depth }) => (
                  <MenuItem key={option.id} value={option.id}>
                    {`${INDENT.repeat(depth)}${option.name} (${option.code})`}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="manager"
            render={({ field }) =>
              canSearchUsers ? (
                <UserPickerField value={field.value} onChange={field.onChange} disabled={isPending} />
              ) : (
                <TextField
                  label="Responsable"
                  value={field.value?.displayName ?? 'Sin responsable'}
                  disabled
                  helperText="Necesitas permiso para consultar usuarios para cambiar el responsable."
                />
              )
            }
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />}
                label="Activo"
                disabled={isPending}
              />
            )}
          />
          {error ? (
            <Alert severity="error">
              {error.message}
              {error.issues.length > 0 ? (
                <ul>
                  {error.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isEdit ? 'Guardar cambios' : 'Crear equipo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


function UserPickerField({
  value,
  onChange,
  disabled,
}: {
  value: TeamFormValues['manager'];
  onChange: (value: TeamFormValues['manager']) => void;
  disabled: boolean;
}) {
  const selected = value ? { id: value.id, displayName: value.displayName, email: '', status: '' } : null;
  return (
    <UserPicker
      label="Responsable"
      value={selected}
      onChange={(user) => onChange(user ? { id: user.id, displayName: user.displayName } : null)}
      disabled={disabled}
      helperText="Opcional. Busca por nombre o correo."
    />
  );
}
