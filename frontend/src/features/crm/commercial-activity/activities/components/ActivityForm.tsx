import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormSection, FullRow, RequiredNote } from '@/components/data';

import type { CatalogRef } from '../../common/commercial-activity.api';
import { commercialFieldErrors } from '../../common/commercial-activity.errors';
import { CustomerProjectFields } from '../../common/CustomerProjectFields';
import { OwnerPicker } from '../../common/OwnerPicker';
import { withoutContacts } from '../../common/participants';
import type { ActivityFormOptions, ActivitySpecificField, ActivityTypeRef } from '../activities.api';
import {
  ACTIVITY_LIMITS,
  activityFormFieldFor,
  allowedSpecificFields,
  buildActivityFormSchema,
  isActivityFieldRequired,
  type ActivityFormValues,
} from '../activities.schemas';
import { isEmailType } from '../activity-format';

import { ActivityTypeFields } from './ActivityTypeFields';

export interface ActivityFormProps {
  mode: 'create' | 'edit';
  options: ActivityFormOptions;
  initialValues: ActivityFormValues;
  /** Edición: valores guardados que quizá ya no estén activos en el catálogo. */
  current?: { type: ActivityTypeRef; priority: CatalogRef; status: CatalogRef; result: CatalogRef | null };
  /** Con `actividades.administrar`: se elige el responsable (RN-04.5). */
  canChooseOwner: boolean;
  /** Responsable fijo cuando no se puede elegir. */
  fixedOwnerName: string;
  /** Alta con `actividades.cerrar`: casilla "Ya realizada" (RN-04.29). */
  canCompleteOnCreate?: boolean;
  /** Ayuda bajo el cliente (p. ej. preseleccionado desde una ficha). */
  customerHelperText?: string;
  /** Error del último envío: sus `details[].field` se pintan bajo cada campo. */
  serverError?: unknown;
  /** Alerta general del último envío. */
  formError?: ReactNode;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: ActivityFormValues) => void;
  /** Secciones extra al final (p. ej. archivos en el alta). */
  children?: ReactNode;
}

const EMAIL_HELP = 'Registro de un correo enviado o recibido fuera del CRM. No se envía nada.';

/**
 * Formulario de actividad para el alta y la edición (04 §E.10, F-31, F-32).
 *
 * El tipo decide qué campos específicos se ven (`metadata.fields`); tipos,
 * estados abiertos, prioridades y resultados salen de `form-options`. Cambiar
 * de cliente limpia proyecto, oportunidad y contactos participantes. La
 * validación es de experiencia de usuario; los errores del backend se pintan
 * bajo su campo.
 */
export function ActivityForm({
  mode,
  options,
  initialValues,
  current,
  canChooseOwner,
  fixedOwnerName,
  canCompleteOnCreate = false,
  customerHelperText,
  serverError,
  formError,
  isPending,
  submitLabel,
  onCancel,
  onSubmit,
  children,
}: ActivityFormProps) {
  const formId = useId();
  const types = useMemo<ActivityTypeRef[]>(
    () => (current && !options.types.some((type) => type.id === current.type.id) ? [current.type, ...options.types] : options.types),
    [current, options.types],
  );
  const schema = useMemo(
    () => buildActivityFormSchema({ mode, types, requiredFields: options.requiredFields, canChooseOwner }),
    [mode, types, options.requiredFields, canChooseOwner],
  );
  const form = useForm<ActivityFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = form;

  const typeId = watch('typeId');
  const alreadyDone = watch('alreadyDone');
  const link = watch('link');
  const type = types.find((item) => item.id === typeId);
  const allowed = allowedSpecificFields(type);
  const required = (field: string) => isActivityFieldRequired(field, options.requiredFields, allowed);
  const completing = mode === 'create' && alreadyDone;

  const serverFieldErrors = useMemo(() => commercialFieldErrors(serverError), [serverError]);
  useEffect(() => {
    for (const [apiField, message] of Object.entries(serverFieldErrors)) {
      const field = activityFormFieldFor(apiField, getValues('alreadyDone'));
      if (field && field !== 'link') {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [serverFieldErrors, setError, getValues]);

  const openStatuses = options.statuses.filter((status) => status.group === 'OPEN');
  const statusOptions =
    current && !openStatuses.some((status) => status.id === current.status.id) ? [current.status, ...openStatuses] : openStatuses;
  const priorityOptions =
    current && !options.priorities.some((priority) => priority.id === current.priority.id) ? [current.priority, ...options.priorities] : options.priorities;

  const linkErrors = {
    customerId: serverFieldErrors.customerId ?? (errors.link ? errors.link.message : undefined),
    projectId: serverFieldErrors.projectId,
    opportunityId: serverFieldErrors.opportunityId,
  };

  let sectionNumber = 0;
  const nextSection = () => {
    sectionNumber += 1;
    return sectionNumber;
  };

  return (
    <Box component="form" id={formId} noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} aria-label={submitLabel}>
      <RequiredNote />
      {formError ? <Box sx={{ mb: 2 }}>{formError}</Box> : null}

      <FormSection number={nextSection()} title="Tipo">
        <Controller
          control={control}
          name="typeId"
          render={({ field, fieldState }) => (
            <TextField
              select
              name={field.name}
              inputRef={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              label="Tipo de actividad"
              required
              disabled={isPending}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message ?? (isEmailType(type) ? EMAIL_HELP : 'Los campos del formulario dependen del tipo.')}
            >
              {types.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </FormSection>

      <FormSection number={nextSection()} title="Datos generales">
        <FullRow>
          <TextField
            {...register('subject')}
            label="Asunto"
            required
            fullWidth
            disabled={isPending}
            error={Boolean(errors.subject)}
            helperText={errors.subject?.message}
            slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.subject } }}
          />
        </FullRow>
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            required={required('description')}
            fullWidth
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
            slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.description } }}
          />
        </FullRow>
        <CustomerProjectFields
          withOpportunity
          value={link}
          disabled={isPending}
          errors={linkErrors}
          customerHelperText={customerHelperText}
          onChange={(next, change) => {
            setValue('link', next, { shouldDirty: true, shouldValidate: Boolean(errors.link) });
            if (change === 'customer') {
              setValue('participants', withoutContacts(getValues('participants')), { shouldDirty: true });
            }
          }}
        />
        <Controller
          control={control}
          name="owner"
          render={({ field, fieldState }) =>
            canChooseOwner ? (
              <OwnerPicker
                name="ownerId"
                label="Responsable"
                value={field.value}
                onChange={field.onChange}
                disabled={isPending}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? (mode === 'create' ? 'Si lo dejas vacío, serás tú.' : undefined)}
              />
            ) : (
              <TextField
                name="ownerId"
                label="Responsable"
                value={field.value?.displayName ?? fixedOwnerName}
                disabled
                helperText="Solo quien administra actividades asigna otro responsable."
              />
            )
          }
        />
        <Controller
          control={control}
          name="priorityId"
          render={({ field, fieldState }) => (
            <TextField
              select
              name={field.name}
              inputRef={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              label="Prioridad"
              required
              disabled={isPending}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            >
              {priorityOptions.map((priority) => (
                <MenuItem key={priority.id} value={priority.id}>
                  {priority.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {completing ? null : (
          <Controller
            control={control}
            name="statusId"
            render={({ field, fieldState }) => (
              <TextField
                select
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                label="Estado"
                disabled={isPending}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? 'Completar y cancelar tienen su propia acción.'}
              >
                {statusOptions.map((status) => (
                  <MenuItem key={status.id} value={status.id}>
                    {status.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )}
        <TextField
          {...register('dueAt')}
          type="datetime-local"
          label="Vencimiento"
          required={required('dueAt')}
          disabled={isPending}
          error={Boolean(errors.dueAt)}
          helperText={errors.dueAt?.message}
        />
      </FormSection>

      {allowed.length > 0 ? (
        <FormSection number={nextSection()} title={type ? `Detalles de ${type.label.toLowerCase()}` : 'Detalles'}>
          <ActivityTypeFields
            form={form}
            allowed={allowed}
            results={options.results}
            currentResult={current?.result}
            customerId={link.customer?.id ?? null}
            isRequired={(field: ActivitySpecificField) => required(field) && !(completing && (field === 'resultId' || field === 'resultNotes'))}
            hideResult={completing}
            disabled={isPending}
          />
        </FormSection>
      ) : null}

      {mode === 'create' && canCompleteOnCreate ? (
        <FormSection number={nextSection()} title="Realización">
          <FullRow>
            <Controller
              control={control}
              name="alreadyDone"
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={isPending} />}
                  label="Ya realizada: registrar la gestión como completada"
                />
              )}
            />
          </FullRow>
          {completing ? (
            <>
              <TextField
                {...register('completedAt')}
                type="datetime-local"
                label="Fecha de finalización"
                required
                disabled={isPending}
                error={Boolean(errors.completedAt)}
                helperText={errors.completedAt?.message ?? 'No puede ser futura.'}
              />
              <Controller
                control={control}
                name="completionResultId"
                render={({ field, fieldState }) => (
                  <TextField
                    select
                    name={field.name}
                    inputRef={field.ref}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    label="Resultado"
                    disabled={isPending}
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message ?? 'Resultado de la lista o notas: al menos uno.'}
                  >
                    <MenuItem value="">Sin resultado de la lista</MenuItem>
                    {options.results.map((result) => (
                      <MenuItem key={result.id} value={result.id}>
                        {result.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <FullRow>
                <TextField
                  {...register('completionResultNotes')}
                  label="Notas del resultado"
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={isPending}
                  error={Boolean(errors.completionResultNotes)}
                  helperText={errors.completionResultNotes?.message}
                  slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.resultNotes } }}
                />
              </FullRow>
              <FullRow>
                <TextField
                  {...register('completionComment')}
                  label="Comentario"
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={isPending}
                  error={Boolean(errors.completionComment)}
                  helperText={errors.completionComment?.message}
                  slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.completionComment } }}
                />
              </FullRow>
            </>
          ) : null}
        </FormSection>
      ) : null}

      {children}

      {Object.keys(errors).length > 0 && !formError ? (
        <Alert severity="error" sx={{ mt: 3 }}>
          Revisa los campos marcados.
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
        <Button variant="outlined" color="inherit" onClick={onCancel} disabled={isPending} sx={{ borderColor: 'divider' }}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </Stack>
    </Box>
  );
}
