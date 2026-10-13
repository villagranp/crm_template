import { Box, MenuItem, TextField } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { FullRow } from '@/components/data';
import { DecimalField } from '@/features/crm/common/DecimalField';
import { DECIMAL_SPECS } from '@/features/crm/common/decimal';

import type { OutcomeOption, ReasonOption } from '../opportunities.api';
import { OPPORTUNITY_LIMITS, reasonsForOutcome, type ResultFormValues } from '../opportunities.schemas';
import { OPPORTUNITY_FIELD_LABELS } from '../opportunity-format';

export interface ResultFormProps {
  /** Resultados que admite la etapa cerrada (`outcomesForStage`): Ganado → Ganado/Parcial; Perdido → Perdido. */
  outcomes: readonly OutcomeOption[];
  /** Motivos activos (`form-options.reasons`); se filtran por `appliesTo` del resultado elegido. */
  reasons: readonly ReasonOption[];
  disabled?: boolean;
}

/**
 * Resultado de una oportunidad (03 §E.7, F-18, RN-03.46–RN-03.52). Va dentro
 * de un formulario de React Hook Form (`FormProvider`) cuyos valores incluyen
 * `ResultFormValues`: el diálogo de cambio de etapa al cerrar y "Modificar
 * resultado".
 *
 * - Resultado: solo los que admite la etapa; si hay uno, queda elegido.
 * - Motivo: los aplicables al resultado (`appliesTo`); obligatorio si el
 *   resultado lo exige (`requiresReason`, Perdido).
 * - Porcentaje adjudicado: solo si el resultado lo exige (`requiresAwardedPercent`,
 *   Parcial), 0–100 con 2 decimales. Ganado implica el 100 % (DM-15).
 * - Fecha de decisión obligatoria (fecha de calendario) y comentarios.
 */
export function ResultForm({ outcomes, reasons, disabled = false }: ResultFormProps) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<ResultFormValues>();
  const outcomeCode = watch('outcome');
  const outcome = outcomes.find((option) => option.code === outcomeCode);
  const applicableReasons = reasonsForOutcome(reasons, outcomeCode);

  // Con un único resultado posible (p. ej. Perdido), queda elegido.
  const onlyOutcome = outcomes.length === 1 ? outcomes[0]?.code : undefined;
  useEffect(() => {
    if (onlyOutcome && !getValues('outcome')) {
      setValue('outcome', onlyOutcome);
    }
  }, [onlyOutcome, getValues, setValue]);

  // Al cambiar de resultado se limpia lo que deja de aplicar.
  useEffect(() => {
    const { reasonId, awardedPercent } = getValues();
    if (reasonId && !reasonsForOutcome(reasons, outcomeCode).some((reason) => reason.id === reasonId)) {
      setValue('reasonId', '');
    }
    if (awardedPercent && !outcomes.find((option) => option.code === outcomeCode)?.requiresAwardedPercent) {
      setValue('awardedPercent', '');
    }
  }, [outcomeCode, outcomes, reasons, getValues, setValue]);

  const showReason = Boolean(outcome) && (applicableReasons.length > 0 || Boolean(outcome?.requiresReason));

  return (
    <Box
      role="group"
      aria-label="Resultado de la oportunidad"
      sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}
    >
      <Controller
        control={control}
        name="outcome"
        render={({ field }) => (
          <TextField
            select
            label={OPPORTUNITY_FIELD_LABELS.outcome}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            required
            disabled={disabled}
            error={Boolean(errors.outcome)}
            helperText={errors.outcome?.message}
          >
            {outcomes.map((option) => (
              <MenuItem key={option.code} value={option.code}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <TextField
        {...register('decisionDate')}
        type="date"
        label={OPPORTUNITY_FIELD_LABELS.decisionDate}
        required
        disabled={disabled}
        error={Boolean(errors.decisionDate)}
        helperText={errors.decisionDate?.message}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {showReason ? (
        <Controller
          control={control}
          name="reasonId"
          render={({ field }) => (
            <TextField
              select
              label={OPPORTUNITY_FIELD_LABELS.reasonId}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required={Boolean(outcome?.requiresReason)}
              disabled={disabled}
              error={Boolean(errors.reasonId)}
              helperText={errors.reasonId?.message ?? (applicableReasons.length === 0 ? 'No hay motivos configurados para este resultado.' : undefined)}
            >
              {outcome?.requiresReason ? null : <MenuItem value="">Sin motivo</MenuItem>}
              {applicableReasons.map((reason) => (
                <MenuItem key={reason.id} value={reason.id}>
                  {reason.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      ) : null}
      {outcome?.requiresAwardedPercent ? (
        <Controller
          control={control}
          name="awardedPercent"
          render={({ field }) => (
            <DecimalField
              label={OPPORTUNITY_FIELD_LABELS.awardedPercent}
              spec={DECIMAL_SPECS.percent}
              unit="%"
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required
              disabled={disabled}
              error={Boolean(errors.awardedPercent)}
              helperText={errors.awardedPercent?.message ?? 'Entre 0 y 100, con hasta 2 decimales.'}
            />
          )}
        />
      ) : null}
      <FullRow>
        <TextField
          {...register('comments')}
          label={OPPORTUNITY_FIELD_LABELS.comments}
          multiline
          minRows={2}
          disabled={disabled}
          error={Boolean(errors.comments)}
          helperText={errors.comments?.message}
          slotProps={{ htmlInput: { maxLength: OPPORTUNITY_LIMITS.resultComments } }}
        />
      </FullRow>
    </Box>
  );
}
