import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  AdminDialog,
  describeApiError,
  DialogFooter,
  FormSection,
  FullRow,
} from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import {
  COUNTRY_ADMIN_ONLY_NOTE,
  CRM_PROFILE_HINT,
  grantsNoPermissions,
  isCommercialRole,
  TEAMS_ADMIN_ONLY_NOTE,
} from '../users-access';
import { userErrorMessages } from '../users-format';
import type { CountryOption, UserDetail } from '../users.api';
import { USER_PERMISSIONS } from '../users.permissions';
import {
  useAssignableRoles,
  useAssignableTeams,
  useCountryOptions,
  useCreateUser,
  useUpdateUser,
} from '../users.queries';
import {
  createUserSchema,
  EMPLOYEE_CODE_MAX_LENGTH,
  normalizeEmployeeCode,
  userFormSchema,
  type UserFormValues,
} from '../users.schemas';

import { UserTeamsEditor } from './UserTeamsEditor';

export interface UserFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  user: UserDetail | null;
  onClose: () => void;
  /** Tras guardar, con el id del usuario. */
  onSaved?: (userId: string) => void;
}

/** Errores cuyos `details[].issue` son útiles para la persona (validación de campos). */
const SHOW_ISSUES_FOR = new Set(['VALIDATION_FAILED']);

function defaults(user: UserDetail | null): UserFormValues {
  return {
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    jobTitle: user?.jobTitle ?? '',
    phone: user?.phone ?? '',
    employeeCode: user?.employeeCode ?? '',
    countryId: user?.country?.id ?? '',
    roleIds: [],
    teams: [],
  };
}

/** Opciones del selector de país: las activas más la actual (puede estar desactivada, RN-07.4). */
function countryChoices(options: readonly CountryOption[], user: UserDetail | null): CountryOption[] {
  const current = user?.country;
  if (!current || options.some((country) => country.id === current.id)) {
    return [...options];
  }
  return [...options, current];
}

/**
 * Alta y edición de un usuario. En el alta se eligen los roles iniciales y,
 * si quien da el alta es administrador, el país y los equipos; en la edición,
 * el correo es de sólo lectura y los roles y equipos se cambian desde el
 * detalle (con las salvaguardas D3). El estado nunca se edita aquí.
 *
 * País y equipos son asignación de acceso (07 RN-07.5, RN-07.10, addendum
 * ADR-020): a un no administrador se le muestran deshabilitados con la
 * explicación y nunca se envían. El backend vuelve a decidirlo.
 */
export function UserFormDialog({ open, user, onClose, onSaved }: UserFormDialogProps) {
  const isCreate = user === null;
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  const canPickCountry = isAdministrador && can(USER_PERMISSIONS.viewCountries);
  const hasTeamPermission = can(USER_PERMISSIONS.editTeams);
  const canPickTeams =
    isCreate && isAdministrador && hasTeamPermission && can(USER_PERMISSIONS.viewTeams);

  const roles = useAssignableRoles(open && isCreate);
  const countries = useCountryOptions(open && canPickCountry);
  const teams = useAssignableTeams(open && canPickTeams);
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
    const employeeCode = normalizeEmployeeCode(values.employeeCode);
    if (isCreate) {
      // El backend marca como principal el primero de `teamIds`.
      const orderedTeams = [...values.teams].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      createMutation.mutate(
        {
          email: values.email.trim(),
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          jobTitle: optional(values.jobTitle),
          phone: optional(values.phone),
          roleIds: values.roleIds,
          employeeCode: employeeCode || undefined,
          countryId: canPickCountry && values.countryId ? values.countryId : undefined,
          teamIds:
            canPickTeams && orderedTeams.length > 0 ? orderedTeams.map((team) => team.teamId) : undefined,
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
    // Sólo viajan los campos de perfil comercial que cambian: así un no
    // administrador nunca envía `countryId` (403 ADMIN_ONLY).
    const previousCode = user.employeeCode ?? '';
    const previousCountry = user.country?.id ?? '';
    updateMutation.mutate(
      {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        jobTitle: optional(values.jobTitle),
        phone: optional(values.phone),
        ...(employeeCode !== previousCode ? { employeeCode: employeeCode || null } : {}),
        ...(canPickCountry && values.countryId !== previousCountry
          ? { countryId: values.countryId || null }
          : {}),
      },
      {
        onSuccess: (updated) => {
          onSaved?.(updated.id);
          onClose();
        },
      },
    );
  });

  const error = mutation.isError
    ? describeApiError(mutation.error, userErrorMessages(mutation.error))
    : null;
  // ADR-020: en el alta, un no administrador sólo puede dar roles que no
  // conceden ningún permiso (hoy, `usuario`). Filtrar es UX: el backend
  // rechaza cualquier otro con 403 ADMIN_ONLY.
  const assignable = (roles.data ?? []).filter(
    (role) => role.isActive && (isAdministrador || grantsNoPermissions(role)),
  );

  const [selectedRoleIds, employeeCodeValue, countryIdValue] = useWatch({
    control,
    name: ['roleIds', 'employeeCode', 'countryId'],
  });
  // 07 D-07.3: aviso de UX; quien decide es el backend (422 CRM_PROFILE_INCOMPLETE).
  const needsCrmProfile =
    isCreate &&
    (!employeeCodeValue.trim() || !countryIdValue) &&
    assignable.some((role) => selectedRoleIds.includes(role.id) && isCommercialRole(role));

  const countryOptions = useMemo(
    () => countryChoices(countries.data ?? [], user),
    [countries.data, user],
  );

  let countryHelper = 'Con alcance «Su país», define qué registros ve.';
  if (!isAdministrador) {
    countryHelper = COUNTRY_ADMIN_ONLY_NOTE;
  } else if (!canPickCountry) {
    countryHelper = 'Necesitas acceso a Clientes para consultar la lista de países.';
  } else if (countries.isError) {
    countryHelper = describeApiError(countries.error).message;
  }

  return (
    <AdminDialog
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      title={isCreate ? 'Nuevo usuario' : `Editar ${user.displayName}`}
      subtitle="Usuarios"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={isCreate ? 'Crear usuario' : 'Guardar cambios'}
          pending={mutation.isPending}
        />
      }
    >
      <FormSection number={1} title="Datos generales">
        <FullRow>
          <TextField
            {...register('email')}
            label="Correo"
            type="email"
            required
            disabled={!isCreate || mutation.isPending}
            error={Boolean(errors.email)}
            helperText={
              errors.email?.message ??
              (isCreate ? 'Será su usuario de acceso.' : 'El correo no se puede cambiar.')
            }
            autoComplete="off"
          />
        </FullRow>
        <TextField
          {...register('firstName')}
          label="Nombre"
          required
          disabled={mutation.isPending}
          error={Boolean(errors.firstName)}
          helperText={errors.firstName?.message}
        />
        <TextField
          {...register('lastName')}
          label="Apellidos"
          required
          disabled={mutation.isPending}
          error={Boolean(errors.lastName)}
          helperText={errors.lastName?.message}
        />
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
      </FormSection>

      <FormSection number={2} title="Perfil comercial">
        <TextField
          {...register('employeeCode')}
          label="Código de colaborador"
          disabled={mutation.isPending}
          error={Boolean(errors.employeeCode)}
          helperText={
            errors.employeeCode?.message ??
            'Único. Letras, dígitos, guion y guion bajo; se guarda en mayúsculas.'
          }
          slotProps={{ htmlInput: { maxLength: EMPLOYEE_CODE_MAX_LENGTH } }}
          autoComplete="off"
        />
        <Controller
          control={control}
          name="countryId"
          render={({ field }) => (
            <TextField
              select
              label="País"
              value={canPickCountry && countries.isPending ? '' : field.value}
              onChange={field.onChange}
              disabled={!canPickCountry || countries.isPending || mutation.isPending}
              error={canPickCountry && countries.isError}
              helperText={countryHelper}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">Sin país</MenuItem>
              {canPickCountry
                ? countryOptions.map((country) => (
                    <MenuItem key={country.id} value={country.id}>
                      {`${country.name} (${country.isoCode})`}
                    </MenuItem>
                  ))
                : user?.country
                  ? [
                      <MenuItem key={user.country.id} value={user.country.id}>
                        {`${user.country.name} (${user.country.isoCode})`}
                      </MenuItem>,
                    ]
                  : null}
            </TextField>
          )}
        />
      </FormSection>

      {isCreate ? (
        <FormSection number={3} title="Roles iniciales" columns={1}>
          <Controller
            control={control}
            name="roleIds"
            render={({ field }) => (
              <FormControl
                component="div"
                error={Boolean(errors.roleIds)}
                disabled={mutation.isPending}
              >
                {roles.isError ? (
                  <Alert severity="error">{describeApiError(roles.error).message}</Alert>
                ) : (
                  <FormGroup
                    aria-label="Roles iniciales"
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))' },
                    }}
                  >
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
                  {errors.roleIds?.message ??
                    'Nace como «Invitado» y debe cambiar la contraseña inicial al entrar.'}
                </FormHelperText>
                {isAdministrador ? null : (
                  <FormHelperText>
                    Sólo puedes dar roles sin permisos: la asignación de accesos es exclusiva del
                    administrador (ADR-020).
                  </FormHelperText>
                )}
              </FormControl>
            )}
          />
          {needsCrmProfile ? <Alert severity="warning">{CRM_PROFILE_HINT}</Alert> : null}
        </FormSection>
      ) : null}

      {canPickTeams ? (
        <FormSection number={4} title="Equipos" columns={1}>
          <Controller
            control={control}
            name="teams"
            render={({ field }) => (
              <Stack spacing={1}>
                <UserTeamsEditor
                  value={field.value}
                  onChange={field.onChange}
                  options={teams.data ?? []}
                  loading={teams.isPending}
                  optionsError={teams.isError ? describeApiError(teams.error).message : null}
                  disabled={mutation.isPending}
                />
                <FormHelperText>El equipo principal es el que se marca; puedes cambiarlo después desde el detalle.</FormHelperText>
              </Stack>
            )}
          />
        </FormSection>
      ) : null}
      {isCreate && hasTeamPermission && !isAdministrador ? (
        <FormHelperText sx={{ mt: 2 }}>{TEAMS_ADMIN_ONLY_NOTE}</FormHelperText>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
          {error.code && SHOW_ISSUES_FOR.has(error.code) && error.issues.length > 0 ? (
            <ul>
              {error.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
