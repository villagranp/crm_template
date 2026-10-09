import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Stack,
  TextField,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { describeApiError } from '@/features/admin/common';
import { useIsAdministrador } from '@/hooks/use-permission';

import { grantsNoPermissions } from '../users-access';
import { USER_ERRORS } from '../users-format';
import type { UserDetail } from '../users.api';
import { useAssignableRoles, useCreateUser, useUpdateUser } from '../users.queries';
import { createUserSchema, userFormSchema, type UserFormValues } from '../users.schemas';

export interface UserFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  user: UserDetail | null;
  onClose: () => void;
  /** Tras guardar, con el id del usuario. */
  onSaved?: (userId: string) => void;
}

function defaults(user: UserDetail | null): UserFormValues {
  return {
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    jobTitle: user?.jobTitle ?? '',
    phone: user?.phone ?? '',
    roleIds: [],
  };
}

/**
 * Alta y edición de un usuario. En el alta se eligen los roles iniciales; en
 * la edición, el correo es de sólo lectura y los roles se cambian desde el
 * detalle (con las salvaguardas D3). El estado nunca se edita aquí.
 */
export function UserFormDialog({ open, user, onClose, onSaved }: UserFormDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const isCreate = user === null;
  const isAdministrador = useIsAdministrador();

  const roles = useAssignableRoles(open && isCreate);
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser(user?.id ?? '');
  const mutation = isCreate ? createMutation : updateMutation;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(isCreate ? createUserSchema : userFormSchema),
    defaultValues: defaults(user),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(user));
      createMutation.reset();
      updateMutation.reset();
    }
    // Las mutaciones cambian de identidad en cada render; sólo importa abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, reset]);

  const submit = handleSubmit((values) => {
    const optional = (value: string) => (value.trim() ? value.trim() : undefined);
    if (isCreate) {
      createMutation.mutate(
        {
          email: values.email.trim(),
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          jobTitle: optional(values.jobTitle),
          phone: optional(values.phone),
          roleIds: values.roleIds,
        },
        {
          onSuccess: (created) => {
            onSaved?.(created.id);
            onClose();
          },
        },
      );
      return;
    }
    updateMutation.mutate(
      {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        jobTitle: optional(values.jobTitle),
        phone: optional(values.phone),
      },
      {
        onSuccess: (updated) => {
          onSaved?.(updated.id);
          onClose();
        },
      },
    );
  });

  const error = mutation.isError ? describeApiError(mutation.error, USER_ERRORS) : null;
  // ADR-020: en el alta, un no administrador sólo puede dar roles que no
  // conceden ningún permiso (hoy, `usuario`). Filtrar es UX: el backend
  // rechaza cualquier otro con 403 ADMIN_ONLY.
  const assignable = (roles.data ?? []).filter(
    (role) => role.isActive && (isAdministrador || grantsNoPermissions(role)),
  );

  return (
    <Dialog
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      aria-labelledby={titleId}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        component: 'form',
        noValidate: true,
        onSubmit: (event: FormEvent<HTMLFormElement>) => {
          void submit(event);
        },
      }}
    >
      <DialogTitle id={titleId}>{isCreate ? 'Nuevo usuario' : `Editar ${user.displayName}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            {...register('email')}
            label="Correo"
            type="email"
            required
            disabled={!isCreate || mutation.isPending}
            error={Boolean(errors.email)}
            helperText={errors.email?.message ?? (isCreate ? 'Será su usuario de acceso.' : 'El correo no se puede cambiar.')}
            autoComplete="off"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              {...register('firstName')}
              label="Nombre"
              required
              fullWidth
              disabled={mutation.isPending}
              error={Boolean(errors.firstName)}
              helperText={errors.firstName?.message}
            />
            <TextField
              {...register('lastName')}
              label="Apellidos"
              required
              fullWidth
              disabled={mutation.isPending}
              error={Boolean(errors.lastName)}
              helperText={errors.lastName?.message}
            />
          </Stack>
          <TextField
            {...register('jobTitle')}
            label="Puesto"
            disabled={mutation.isPending}
            error={Boolean(errors.jobTitle)}
            helperText={errors.jobTitle?.message}
          />
          <TextField
            {...register('phone')}
            label="Teléfono"
            type="tel"
            disabled={mutation.isPending}
            error={Boolean(errors.phone)}
            helperText={errors.phone?.message}
          />

          {isCreate ? (
            <Controller
              control={control}
              name="roleIds"
              render={({ field }) => (
                <FormControl component="fieldset" error={Boolean(errors.roleIds)} disabled={mutation.isPending}>
                  <FormLabel component="legend">Roles iniciales</FormLabel>
                  {roles.isError ? (
                    <Alert severity="error">{describeApiError(roles.error).message}</Alert>
                  ) : (
                    <FormGroup>
                      {assignable.map((role) => (
                        <FormControlLabel
                          key={role.id}
                          label={role.name}
                          control={
                            <Checkbox
                              checked={field.value.includes(role.id)}
                              onChange={(event) =>
                                field.onChange(
                                  event.target.checked
                                    ? [...field.value, role.id]
                                    : field.value.filter((id) => id !== role.id),
                                )
                              }
                            />
                          }
                        />
                      ))}
                    </FormGroup>
                  )}
                  <FormHelperText>
                    {errors.roleIds?.message ?? 'Nace como «Invitado» y debe cambiar la contraseña inicial al entrar.'}
                  </FormHelperText>
                  {isAdministrador ? null : (
                    <FormHelperText>
                      Sólo puedes dar roles sin permisos: la asignación de accesos es exclusiva del administrador (ADR-020).
                    </FormHelperText>
                  )}
                </FormControl>
              )}
            />
          ) : null}

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
        <Button variant="text" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {isCreate ? 'Crear usuario' : 'Guardar cambios'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
