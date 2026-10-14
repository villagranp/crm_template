import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormSection, FullRow, RequiredNote } from '@/components/data';

import { commercialFieldErrors } from '../../common/commercial-activity.errors';
import { CustomerProjectFields } from '../../common/CustomerProjectFields';
import { OwnerPicker } from '../../common/OwnerPicker';
import { ParticipantsField } from '../../common/ParticipantsField';
import { withoutContacts } from '../../common/participants';
import { formTimeZone } from '../../common/use-commercial-time-zones';
import { useVisitScheduleConflicts } from '../use-visit-schedule-conflicts';
import type { VisitFormOptions } from '../visits.api';
import {
  buildVisitPlanningSchema,
  isPastStart,
  isPlanningFieldRequired,
  VISIT_LIMITS,
  visitPlanningFieldFor,
  type VisitPlanningValues,
} from '../visits.schemas';

import { ScheduleConflictAlert } from './ScheduleConflictAlert';

export interface VisitPlanningFormProps {
  mode: 'create' | 'edit';
  options: VisitFormOptions;
  initialValues: VisitPlanningValues;
  /** Con `visitas.administrar`: se elige el responsable (RN-04.5). */
  canChooseOwner: boolean;
  /** Responsable fijo cuando no se puede elegir. */
  fixedOwnerName: string;
  /** Usuario de la sesión: el aviso de conflicto dice "Ya tienes…" si es el responsable. */
  currentUserId: string | null;
  /** Edición: la propia visita no cuenta como conflicto. */
  visitId?: string;
  /** Ayuda bajo el cliente (p. ej. preseleccionado desde una ficha). */
  customerHelperText?: string;
  /** Error del último envío: sus `details[].field` se pintan bajo cada campo. */
  serverError?: unknown;
  /** Alerta general del último envío. */
  formError?: ReactNode;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: VisitPlanningValues) => void;
  /** Secciones extra al final (p. ej. archivos en el alta). */
  children?: ReactNode;
}

const RESCHEDULE_HELP = 'Para cambiar la fecha, reprograma la visita.';
const REMINDER_HELP = 'Se mostrará en la agenda; no se envían notificaciones.';

/**
 * Formulario de planificación de una visita, para el alta y para la edición
 * (04 §E.7, F-26, F-25). Secciones Cuándo, Con quién, Qué, Responsable y
 * Recordatorio. En la edición la fecha de inicio no se cambia (se reprograma,
 * RN-04.15) ni el cliente. Cambiar el cliente limpia el proyecto y los
 * contactos invitados. Al fijar fecha, fin o responsable consulta los solapes y
 * los avisa **sin** deshabilitar "Guardar" (RN-04.14). Una fecha pasada se
 * permite con aviso (registro tardío, D-04.5).
 */
export function VisitPlanningForm({
  mode,
  options,
  initialValues,
  canChooseOwner,
  fixedOwnerName,
  currentUserId,
  visitId,
  customerHelperText,
  serverError,
  formError,
  isPending,
  submitLabel,
  onCancel,
  onSubmit,
  children,
}: VisitPlanningFormProps) {
  const formId = useId();
  // Zona del usuario (RN-04.9): las fechas se escriben, se validan y se consultan en ella.
  const timeZone = formTimeZone(options);
  const context = useMemo(() => ({ mode, requiredFields: options.requiredFields, timeZone }), [mode, options.requiredFields, timeZone]);
  const schema = useMemo(() => buildVisitPlanningSchema(context), [context]);
  const form = useForm<VisitPlanningValues>({ resolver: zodResolver(schema), defaultValues: initialValues });
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
  const required = (field: string) => isPlanningFieldRequired(field, context);

  const link = watch('link');
  const owner = watch('owner');
  const start = watch('scheduledStartAt');
  const end = watch('scheduledEndAt');
  const ownerId = owner?.id ?? undefined;
  const conflicts = useVisitScheduleConflicts({
    mode: options.conflictMode,
    // Sin responsable elegido, el backend usa al usuario; uno ajeno exige `visitas.administrar`.
    ownerId: ownerId && ownerId !== currentUserId ? ownerId : undefined,
    start,
    end,
    excludeVisitId: visitId,
    enabled: !isPending,
    timeZone,
  });
  const ownVisits = !ownerId || ownerId === currentUserId;

  const serverFieldErrors = useMemo(() => commercialFieldErrors(serverError), [serverError]);
  useEffect(() => {
    for (const [apiField, message] of Object.entries(serverFieldErrors)) {
      const field = visitPlanningFieldFor(apiField);
      if (field && field !== 'link') {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [serverFieldErrors, setError]);

  const linkErrors = {
    customerId: serverFieldErrors.customerId ?? (errors.link ? errors.link.message : undefined),
    projectId: serverFieldErrors.projectId,
  };

  return (
    <Box component="form" id={formId} noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)} aria-label={submitLabel}>
      <RequiredNote />
      {formError ? <Box sx={{ mb: 2 }}>{formError}</Box> : null}

      <FormSection number={1} title="Cuándo">
        {mode === 'create' ? (
          <TextField
            {...register('scheduledStartAt')}
            type="datetime-local"
            label="Fecha y hora de inicio"
            required
            disabled={isPending}
            error={Boolean(errors.scheduledStartAt)}
            helperText={
              errors.scheduledStartAt?.message ??
              (isPastStart(start, new Date(), timeZone) ? 'La fecha ya pasó: se registrará como planificación tardía.' : undefined)
            }
          />
        ) : (
          <TextField {...register('scheduledStartAt')} type="datetime-local" label="Fecha y hora de inicio" disabled helperText={RESCHEDULE_HELP} />
        )}
        <TextField
          {...register('scheduledEndAt')}
          type="datetime-local"
          label="Fin"
          required={required('scheduledEndAt')}
          disabled={isPending}
          error={Boolean(errors.scheduledEndAt)}
          helperText={errors.scheduledEndAt?.message ?? `Opcional. Si lo dejas vacío, se calcula con ${options.defaultDurationMinutes} min.`}
        />
        <FullRow>
          <Stack spacing={1}>
            <ScheduleConflictAlert conflicts={conflicts.conflicts} mode={options.conflictMode} ownVisits={ownVisits} />
            {conflicts.isError ? (
              <Typography variant="caption" color="text.secondary">
                No se pudo comprobar si hay otras visitas en ese horario.
              </Typography>
            ) : null}
          </Stack>
        </FullRow>
      </FormSection>

      <FormSection number={2} title="Con quién">
        <CustomerProjectFields
          value={link}
          disabled={isPending}
          customerReadOnly={mode === 'edit'}
          customerHelperText={mode === 'edit' ? 'El cliente de una visita no se cambia.' : customerHelperText}
          errors={linkErrors}
          onChange={(next, change) => {
            setValue('link', { ...next, opportunity: null }, { shouldDirty: true, shouldValidate: Boolean(errors.link) });
            if (change === 'customer') {
              setValue('participants', withoutContacts(getValues('participants')), { shouldDirty: true });
            }
          }}
        />
        <FullRow>
          <Controller
            control={control}
            name="participants"
            render={({ field, fieldState }) => (
              <ParticipantsField
                label="Invitados"
                customerId={link.customer?.id ?? null}
                value={field.value}
                onChange={field.onChange}
                required={required('participants')}
                disabled={isPending}
                error={fieldState.error?.message}
                helperText="Contactos del cliente, usuarios internos o personas externas."
              />
            )}
          />
        </FullRow>
      </FormSection>

      <FormSection number={3} title="Qué">
        <FullRow>
          <TextField
            {...register('objective')}
            label="Objetivo"
            required
            fullWidth
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.objective)}
            helperText={errors.objective?.message}
            slotProps={{ htmlInput: { maxLength: VISIT_LIMITS.objective } }}
          />
        </FullRow>
        <FullRow>
          <TextField
            {...register('location')}
            label="Ubicación"
            required={required('location')}
            fullWidth
            disabled={isPending}
            error={Boolean(errors.location)}
            helperText={errors.location?.message}
            slotProps={{ htmlInput: { maxLength: VISIT_LIMITS.location } }}
          />
        </FullRow>
      </FormSection>

      <FormSection number={4} title="Responsable y recordatorio">
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
                helperText="Solo quien administra visitas asigna otro responsable."
              />
            )
          }
        />
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            {...register('reminderAmount')}
            type="number"
            label="Recordatorio"
            required={required('reminderMinutesBefore')}
            disabled={isPending}
            error={Boolean(errors.reminderAmount)}
            helperText={errors.reminderAmount?.message ?? REMINDER_HELP}
            slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <Controller
            control={control}
            name="reminderUnit"
            render={({ field }) => (
              <TextField
                select
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onChange={field.onChange}
                label="Unidad"
                disabled={isPending}
                sx={{ flex: '0 0 auto', minWidth: (theme) => theme.spacing(15) }}
              >
                <MenuItem value="minutes">Minutos antes</MenuItem>
                <MenuItem value="hours">Horas antes</MenuItem>
              </TextField>
            )}
          />
        </Stack>
      </FormSection>

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
        {/* Nunca se deshabilita por un conflicto horario: es sólo un aviso (RN-04.14). */}
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </Stack>
    </Box>
  );
}
