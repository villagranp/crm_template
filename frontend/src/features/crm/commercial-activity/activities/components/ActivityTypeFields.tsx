import { MenuItem, TextField } from '@mui/material';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { FullRow } from '@/components/data';

import { ParticipantsField } from '../../common/ParticipantsField';
import type { ActivitySpecificField, CatalogOption } from '../activities.api';
import { ACTIVITY_LIMITS, type ActivityFormValues } from '../activities.schemas';
import { ACTIVITY_FIELD_LABELS } from '../activity-format';

export interface ActivityTypeFieldsProps {
  form: UseFormReturn<ActivityFormValues>;
  /** Campos específicos que admite el tipo elegido (`metadata.fields`). */
  allowed: readonly ActivitySpecificField[];
  /** `form-options.results` (`crm.resultado_interaccion`). */
  results: readonly CatalogOption[];
  /** Resultado guardado que quizá ya no esté entre los activos (edición). */
  currentResult?: { id: string; label: string } | null;
  customerId: string | null;
  isRequired: (field: ActivitySpecificField) => boolean;
  /** Con "Ya realizada" el resultado se pide en la finalización: aquí se ocultan. */
  hideResult?: boolean;
  disabled?: boolean;
}


/**
 * Campos específicos del tipo de actividad (04 §E.10, RN-04.24): sólo pinta los
 * que declara `metadata.fields` del tipo elegido, en el orden del contrato, y
 * cambian al cambiar de tipo. No hay listas fijas por tipo en el frontend.
 */
export function ActivityTypeFields({
  form,
  allowed,
  results,
  currentResult,
  customerId,
  isRequired,
  hideResult = false,
  disabled = false,
}: ActivityTypeFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const has = (field: ActivitySpecificField) => allowed.includes(field) && !(hideResult && (field === 'resultId' || field === 'resultNotes'));
  const resultOptions =
    currentResult && !results.some((result) => result.id === currentResult.id) ? [{ ...currentResult, code: '', sortOrder: -1 }, ...results] : results;

  return (
    <>
      {has('scheduledAt') ? (
        <TextField
          {...register('scheduledAt')}
          type="datetime-local"
          label={ACTIVITY_FIELD_LABELS.scheduledAt}
          required={isRequired('scheduledAt')}
          disabled={disabled}
          error={Boolean(errors.scheduledAt)}
          helperText={errors.scheduledAt?.message}
        />
      ) : null}
      {has('durationMinutes') ? (
        <TextField
          {...register('durationMinutes')}
          type="number"
          label={ACTIVITY_FIELD_LABELS.durationMinutes}
          required={isRequired('durationMinutes')}
          disabled={disabled}
          error={Boolean(errors.durationMinutes)}
          helperText={errors.durationMinutes?.message}
          slotProps={{ htmlInput: { min: 0, max: ACTIVITY_LIMITS.durationMinutes, step: 1, inputMode: 'numeric' } }}
        />
      ) : null}
      {has('participants') ? (
        <FullRow>
          <Controller
            control={control}
            name="participants"
            render={({ field, fieldState }) => (
              <ParticipantsField
                customerId={customerId}
                value={field.value}
                onChange={field.onChange}
                required={isRequired('participants')}
                disabled={disabled}
                error={fieldState.error?.message}
                helperText="Contactos del cliente, usuarios internos o personas externas."
              />
            )}
          />
        </FullRow>
      ) : null}
      {has('summary') ? (
        <FullRow>
          <TextField
            {...register('summary')}
            label={ACTIVITY_FIELD_LABELS.summary}
            required={isRequired('summary')}
            disabled={disabled}
            fullWidth
            multiline
            minRows={2}
            error={Boolean(errors.summary)}
            helperText={errors.summary?.message}
            slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.summary } }}
          />
        </FullRow>
      ) : null}
      {has('resultId') ? (
        <Controller
          control={control}
          name="resultId"
          render={({ field, fieldState }) => (
            <TextField
              select
              name={field.name}
              inputRef={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              label={ACTIVITY_FIELD_LABELS.resultId}
              required={isRequired('resultId')}
              disabled={disabled}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            >
              <MenuItem value="">Sin resultado</MenuItem>
              {resultOptions.map((result) => (
                <MenuItem key={result.id} value={result.id}>
                  {result.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      ) : null}
      {has('resultNotes') ? (
        <TextField
          {...register('resultNotes')}
          label={ACTIVITY_FIELD_LABELS.resultNotes}
          required={isRequired('resultNotes')}
          disabled={disabled}
          multiline
          minRows={1}
          error={Boolean(errors.resultNotes)}
          helperText={errors.resultNotes?.message}
          slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.resultNotes } }}
        />
      ) : null}
      {has('nextAction') ? (
        <TextField
          {...register('nextAction')}
          label={ACTIVITY_FIELD_LABELS.nextAction}
          required={isRequired('nextAction')}
          disabled={disabled}
          error={Boolean(errors.nextAction)}
          helperText={errors.nextAction?.message ?? 'Alimenta el seguimiento comercial; no crea una tarea.'}
          slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.nextAction } }}
        />
      ) : null}
      {has('nextActionDate') ? (
        <TextField
          {...register('nextActionDate')}
          type="date"
          label={ACTIVITY_FIELD_LABELS.nextActionDate}
          required={isRequired('nextActionDate')}
          disabled={disabled}
          error={Boolean(errors.nextActionDate)}
          helperText={errors.nextActionDate?.message}
        />
      ) : null}
    </>
  );
}
