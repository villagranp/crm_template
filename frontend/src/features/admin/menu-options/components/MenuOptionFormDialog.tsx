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
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useMemo, type FormEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { describeApiError } from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import type { MenuOption, MenuOptionRequest } from '../menu-options.api';
import { MENU_OPTION_PERMISSIONS } from '../menu-options.permissions';
import {
  useCreateMenuOption,
  useModules,
  usePermissionOptions,
  useRegisteredRoutes,
  useUpdateMenuOption,
} from '../menu-options.queries';
import { menuOptionFormSchema, type MenuOptionFormValues } from '../menu-options.schemas';
import { MENU_OPTION_ERRORS, withDescendants } from '../menu-tree';

export type MenuOptionFormMode = { kind: 'create'; moduleId?: string; parentId?: string } | { kind: 'edit'; option: MenuOption };

export interface MenuOptionFormDialogProps {
  mode: MenuOptionFormMode | null;
  /** Catálogo actual, para el selector de padre. */
  options: readonly MenuOption[];
  onClose: () => void;
}

function defaults(mode: MenuOptionFormMode | null): MenuOptionFormValues {
  if (mode?.kind === 'edit') {
    const { option } = mode;
    return {
      moduleId: option.module.id,
      parentId: option.parentId ?? '',
      key: option.key,
      label: option.label,
      description: option.description ?? '',
      icon: option.icon ?? '',
      kind: option.kind,
      path: option.path ?? '',
      sortOrder: option.sortOrder,
      requiredPermissionId: option.requiredPermissionId ?? '',
      isPublic: option.isPublic,
      isActive: option.isActive,
    };
  }
  return {
    moduleId: mode?.moduleId ?? '',
    parentId: mode?.parentId ?? '',
    key: '',
    label: '',
    description: '',
    icon: '',
    kind: 'LINK',
    path: '',
    sortOrder: 0,
    requiredPermissionId: '',
    isPublic: false,
    isActive: true,
  };
}

function toRequest(values: MenuOptionFormValues): MenuOptionRequest {
  return {
    parentId: values.parentId || null,
    label: values.label.trim(),
    description: values.description.trim() || null,
    icon: values.icon.trim() || null,
    kind: values.kind,
    path: values.kind === 'LINK' ? values.path : null,
    sortOrder: values.sortOrder,
    requiredPermissionId: values.requiredPermissionId || null,
    isPublic: values.isPublic,
    isActive: values.isActive,
  };
}

/** Sólo los campos que cambiaron: una opción de sistema rechaza tocar ruta, tipo, permiso o padre. */
function changedFields(next: MenuOptionRequest, current: MenuOption): MenuOptionRequest {
  const changes: MenuOptionRequest = {};
  for (const [field, value] of Object.entries(next) as [keyof MenuOptionRequest, unknown][]) {
    if (value !== (current as unknown as Record<string, unknown>)[field]) {
      (changes as Record<string, unknown>)[field] = value;
    }
  }
  return changes;
}

/**
 * Alta y edición de una opción de menú (D6, D7). Una opción navegable sólo
 * puede apuntar a una ruta registrada; la clave y el módulo no cambian
 * después; las de sistema no cambian de ruta, tipo, permiso, padre ni visibilidad.
 */
export function MenuOptionFormDialog({ mode, options, onClose }: MenuOptionFormDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const can = useCan();
  const open = mode !== null;
  const isEdit = mode?.kind === 'edit';
  const isSystem = mode?.kind === 'edit' && mode.option.isSystem;

  const modules = useModules(open);
  const routes = useRegisteredRoutes(open);
  const permissions = usePermissionOptions(open && can(MENU_OPTION_PERMISSIONS.viewPermissions));
  const createMutation = useCreateMenuOption();
  const updateMutation = useUpdateMenuOption();
  const mutation = isEdit ? updateMutation : createMutation;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MenuOptionFormValues>({ resolver: zodResolver(menuOptionFormSchema), defaultValues: defaults(mode) });
  const moduleId = useWatch({ control, name: 'moduleId' });
  const kind = useWatch({ control, name: 'kind' });

  useEffect(() => {
    if (mode) {
      reset(defaults(mode));
      createMutation.reset();
      updateMutation.reset();
    }
    // Sólo al abrir: las mutaciones cambian de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reset]);

  /** Padres posibles: grupos del mismo módulo, sin la propia opción ni sus descendientes. */
  const parentCandidates = useMemo(() => {
    const excluded = mode?.kind === 'edit' ? withDescendants(options, mode.option.id) : new Set<string>();
    return options.filter((option) => option.kind === 'GROUP' && option.module.id === moduleId && !excluded.has(option.id));
  }, [options, mode, moduleId]);

  const submit = handleSubmit((values) => {
    const request = toRequest(values);
    if (mode?.kind === 'edit') {
      updateMutation.mutate({ id: mode.option.id, body: changedFields(request, mode.option) }, { onSuccess: onClose });
    } else {
      createMutation.mutate({ ...request, moduleId: values.moduleId, key: values.key.trim() }, { onSuccess: onClose });
    }
  });

  const pending = mutation.isPending;
  const error = mutation.isError ? describeApiError(mutation.error, MENU_OPTION_ERRORS) : null;

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
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
      <DialogTitle id={titleId}>{isEdit ? 'Editar opción de menú' : 'Nueva opción de menú'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isSystem ? (
            <Alert severity="info">Opción del sistema: sólo se cambian etiqueta, descripción, icono, orden y estado.</Alert>
          ) : null}
          <Controller
            control={control}
            name="moduleId"
            render={({ field }) => (
              <TextField
                select
                label="Módulo"
                required
                value={field.value}
                onChange={field.onChange}
                disabled={isEdit || pending}
                error={Boolean(errors.moduleId)}
                helperText={errors.moduleId?.message ?? (isEdit ? 'El módulo no se puede cambiar.' : undefined)}
              >
                {(modules.data ?? []).map((module) => (
                  <MenuItem key={module.id} value={module.id}>
                    {module.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            {...register('key')}
            label="Clave"
            required
            disabled={isEdit || pending}
            error={Boolean(errors.key)}
            helperText={errors.key?.message ?? (isEdit ? 'La clave no se puede cambiar.' : 'Única y permanente, p. ej. ventas-cotizaciones.')}
          />
          <TextField {...register('label')} label="Etiqueta" required disabled={pending} error={Boolean(errors.label)} helperText={errors.label?.message} />
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
          <TextField
            {...register('icon')}
            label="Icono"
            disabled={pending}
            error={Boolean(errors.icon)}
            helperText={errors.icon?.message ?? 'Nombre del glifo de Material Symbols, p. ej. manage_accounts.'}
          />
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <RadioGroup row aria-label="Tipo de opción" value={field.value} onChange={(event) => field.onChange(event.target.value)}>
                <FormControlLabel value="LINK" control={<Radio />} label="Navegable" disabled={isSystem || pending} />
                <FormControlLabel value="GROUP" control={<Radio />} label="Grupo" disabled={isSystem || pending} />
              </RadioGroup>
            )}
          />
          {kind === 'LINK' ? (
            <Controller
              control={control}
              name="path"
              render={({ field }) => (
                <TextField
                  select
                  label="Pantalla"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSystem || pending}
                  error={Boolean(errors.path)}
                  helperText={errors.path?.message ?? 'Sólo rutas registradas en la aplicación.'}
                >
                  {(routes.data ?? []).map((route) => (
                    <MenuItem key={route.path} value={route.path}>
                      {`${route.label} · ${route.path}`}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          ) : null}
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <TextField select label="Dentro de" value={field.value} onChange={field.onChange} disabled={isSystem || pending}>
                <MenuItem value="">Raíz del módulo</MenuItem>
                {parentCandidates.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          {permissions.data ? (
            <Controller
              control={control}
              name="requiredPermissionId"
              render={({ field }) => (
                <TextField
                  select
                  label="Permiso que exige"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSystem || pending}
                  helperText="Sin el permiso, la opción no aparece aunque esté asignada."
                >
                  <MenuItem value="">Ninguno</MenuItem>
                  {permissions.data.map((permission) => (
                    <MenuItem key={permission.id} value={permission.id}>
                      {permission.code}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          ) : null}
          <TextField
            {...register('sortOrder', { valueAsNumber: true })}
            label="Orden"
            type="number"
            disabled={pending}
            error={Boolean(errors.sortOrder)}
            helperText={errors.sortOrder?.message}
          />
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <FormControlLabel
                label="Pública (visible sin asignación)"
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={isSystem || pending} />}
              />
            )}
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <FormControlLabel
                label="Activa"
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={pending} />}
              />
            )}
          />
          {error ? <Alert severity="error">{error.message}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {isEdit ? 'Guardar cambios' : 'Crear opción'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
