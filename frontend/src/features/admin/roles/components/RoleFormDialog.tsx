import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  AdminDialog,
  describeApiError,
  DialogFooter,
  FormSection,
  FullRow,
} from '@/features/admin/common';
import { useIsAdministrador } from '@/hooks/use-permission';

import { DATA_SCOPE_LABEL, ROLE_ERRORS } from '../roles-format';
import { DATA_SCOPES, type Role } from '../roles.api';
import { useCreateRole, useDuplicateRole, useUpdateRole } from '../roles.queries';
import { roleFormSchema, type RoleFormValues } from '../roles.schemas';

export type RoleFormMode =
  { kind: 'create' } | { kind: 'edit'; role: Role } | { kind: 'duplicate'; role: Role };

export interface RoleFormDialogProps {
  mode: RoleFormMode | null;
  onClose: () => void;
  onSaved?: (role: Role) => void;
}

function defaults(mode: RoleFormMode | null): RoleFormValues {
  if (!mode || mode.kind === 'create') {
    return { code: '', name: '', description: '', dataScope: 'OWN', isActive: true };
  }
  const { role } = mode;
  if (mode.kind === 'duplicate') {
    return {
      code: `${role.code}-copia`,
      name: `${role.name} (copia)`,
      description: role.description ?? '',
      dataScope: role.dataScope,
      isActive: true,
    };
  }
  return {
    code: role.code,
    name: role.name,
    description: role.description ?? '',
    dataScope: role.dataScope,
    isActive: role.isActive,
  };
}

const TITLES = { create: 'Nuevo rol', edit: 'Editar rol', duplicate: 'Duplicar rol' } as const;
const SUBMIT = { create: 'Crear rol', edit: 'Guardar cambios', duplicate: 'Crear copia' } as const;

/**
 * Alta, edición y duplicado de un rol. El código sólo se escribe al crear o
 * duplicar (es inmutable). Al duplicar se copian permisos, opciones y alcance.
 */
export function RoleFormDialog({ mode, onClose, onSaved }: RoleFormDialogProps) {
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const duplicateMutation = useDuplicateRole();
  const kind = mode?.kind ?? 'create';
  // ADR-020: el alcance de datos y la activación cambian lo que concede el rol
  // y son sólo para el administrador; quien no lo es edita nombre y
  // descripción. El backend responde 403 ADMIN_ONLY si cambian igualmente.
  const canChangeGrants = useIsAdministrador();
  const mutation =
    kind === 'create' ? createMutation : kind === 'edit' ? updateMutation : duplicateMutation;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: defaults(mode),
  });

  useEffect(() => {
    if (mode) {
      reset(defaults(mode));
      createMutation.reset();
      updateMutation.reset();
      duplicateMutation.reset();
    }
    // Sólo al abrir: las mutaciones cambian de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reset]);

  const done = (role: Role) => {
    onSaved?.(role);
    onClose();
  };

  const submit = handleSubmit((values) => {
    const description = values.description.trim();
    if (!mode || mode.kind === 'create') {
      createMutation.mutate(
        {
          code: values.code,
          name: values.name,
          dataScope: values.dataScope,
          ...(description ? { description } : {}),
        },
        { onSuccess: done },
      );
    } else if (mode.kind === 'duplicate') {
      duplicateMutation.mutate(
        {
          id: mode.role.id,
          body: { code: values.code, name: values.name, ...(description ? { description } : {}) },
        },
        { onSuccess: done },
      );
    } else {
      updateMutation.mutate(
        {
          id: mode.role.id,
          body: {
            name: values.name,
            description: description || null,
            ...(canChangeGrants ? { dataScope: values.dataScope, isActive: values.isActive } : {}),
          },
        },
        { onSuccess: done },
      );
    }
  });

  const error = mutation.isError ? describeApiError(mutation.error, ROLE_ERRORS) : null;
  const pending = mutation.isPending;

  return (
    <AdminDialog
      open={mode !== null}
      onClose={pending ? undefined : onClose}
      title={TITLES[kind]}
      subtitle="Roles y permisos"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={<DialogFooter onCancel={onClose} submitLabel={SUBMIT[kind]} pending={pending} />}
    >
      {mode?.kind === 'duplicate' ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Se copiarán los permisos, las opciones de menú y el alcance de «{mode.role.name}».
        </Alert>
      ) : null}
      <FormSection number={1} title="Datos generales">
        <TextField
          {...register('code')}
          label="Código"
          required
          disabled={kind === 'edit' || pending}
          error={Boolean(errors.code)}
          helperText={
            errors.code?.message ??
            (kind === 'edit' ? 'El código no se puede cambiar.' : 'No se podrá cambiar después.')
          }
        />
        <TextField
          {...register('name')}
          label="Nombre"
          required
          disabled={pending}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
        />
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
        </FullRow>
      </FormSection>
      {kind !== 'duplicate' ? (
        <FormSection number={2} title="Acceso">
          <Controller
            control={control}
            name="dataScope"
            render={({ field }) => (
              <TextField
                select
                label="Alcance de datos"
                value={field.value}
                onChange={field.onChange}
                disabled={pending || (kind === 'edit' && !canChangeGrants)}
                helperText={
                  kind === 'edit' && !canChangeGrants
                    ? 'Sólo un administrador puede cambiar el alcance (ADR-020).'
                    : 'Hasta dónde ven los datos las personas con este rol.'
                }
              >
                {DATA_SCOPES.map((scope) => (
                  <MenuItem key={scope} value={scope}>
                    {DATA_SCOPE_LABEL[scope]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          {kind === 'edit' ? (
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <FormControlLabel
                  label={
                    canChangeGrants
                      ? 'Activo (un rol inactivo deja de conceder acceso)'
                      : 'Activo. Sólo un administrador puede activarlo o desactivarlo (ADR-020).'
                  }
                  control={
                    <Switch
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                      disabled={pending || !canChangeGrants}
                    />
                  }
                />
              )}
            />
          ) : null}
        </FormSection>
      ) : null}
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
