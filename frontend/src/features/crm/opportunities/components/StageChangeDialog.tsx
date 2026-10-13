import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog } from '@/components/data';
import { FormErrorAlert, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';

import type { OpportunityDetail, OpportunityFormOptions } from '../opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES, opportunityFieldErrors } from '../opportunities.errors';
import { useChangeOpportunityStage, useOpportunity, useOpportunityFormOptions } from '../opportunities.queries';
import {
  buildStageChangeSchema,
  emptyResultValues,
  isReopening,
  OPPORTUNITY_LIMITS,
  outcomesForStage,
  toStageChangeInput,
  type StageChangeContext,
  type StageChangeFormValues,
} from '../opportunities.schemas';
import { OPPORTUNITY_FIELD_LABELS, resultText } from '../opportunity-format';

import { ResultForm } from './ResultForm';

export interface StageChangeDialogProps {
  open: boolean;
  /** Oportunidad a cambiar; su detalle trae `allowedTransitions` (lo calcula el backend). */
  opportunityId: string;
  onClose: () => void;
  onChanged: (opportunity: OpportunityDetail) => void;
}

const FORM_FIELDS: ReadonlySet<string> = new Set(['toStageId', 'comment', 'outcome', 'reasonId', 'awardedPercent', 'decisionDate', 'comments']);

interface StageChangeFormProps {
  opportunity: OpportunityDetail;
  options: OpportunityFormOptions;
  onClose: () => void;
  onChanged: (opportunity: OpportunityDetail) => void;
}

function StageChangeForm({ opportunity, options, onClose, onChanged }: StageChangeFormProps) {
  const transitions = useMemo(() => [...opportunity.allowedTransitions].sort((a, b) => a.order - b.order), [opportunity.allowedTransitions]);
  const context: StageChangeContext = useMemo(
    () => ({ current: opportunity.stage, transitions, outcomes: options.outcomes, reasons: options.reasons }),
    [opportunity.stage, transitions, options.outcomes, options.reasons],
  );
  const schema = useMemo(() => buildStageChangeSchema(context), [context]);
  const mutation = useChangeOpportunityStage(opportunity.id, opportunity.project.id);
  const form = useForm<StageChangeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { toStageId: '', comment: '', ...emptyResultValues(options.defaults.opportunityDate) },
  });
  const { control, register, handleSubmit, watch, setValue, getValues, setError, formState } = form;
  const { errors } = formState;

  const toStageId = watch('toStageId');
  const target = transitions.find((stage) => stage.id === toStageId);
  const reopening = isReopening(opportunity.stage, target);
  const closing = Boolean(target?.isClosed);
  const targetOutcome = target?.outcome;
  const allowedOutcomes = useMemo(() => outcomesForStage(options.outcomes, targetOutcome), [options.outcomes, targetOutcome]);

  // Un resultado elegido para otra etapa deja de valer al cambiar de destino.
  useEffect(() => {
    const outcome = getValues('outcome');
    if (outcome && !allowedOutcomes.some((option) => option.code === outcome)) {
      setValue('outcome', '');
    }
  }, [allowedOutcomes, getValues, setValue]);

  const error = mutation.isError ? mutation.error : null;
  const fieldErrors = useMemo(() => opportunityFieldErrors(error), [error]);
  useEffect(() => {
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (FORM_FIELDS.has(field)) {
        setError(field as keyof StageChangeFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [fieldErrors, setError]);
  // Si el error ya se pinta bajo su campo, no se repite en la alerta general.
  const shownOnField = Object.keys(fieldErrors).some((field) => FORM_FIELDS.has(field));
  const errorView = error && !shownOnField ? describeApiError(error, OPPORTUNITY_ERROR_MESSAGES) : null;

  const onSubmit = (values: StageChangeFormValues) => {
    mutation.mutate(toStageChangeInput(values, context), { onSuccess: (changed) => onChanged(changed) });
  };

  let submitLabel = 'Cambiar etapa';
  if (reopening) submitLabel = 'Reabrir oportunidad';
  else if (closing) submitLabel = 'Cerrar oportunidad';

  return (
    <EntityDialog
      open
      onClose={mutation.isPending ? undefined : onClose}
      title="Cambiar etapa"
      subtitle={`${opportunity.code} · ${opportunity.project.name}`}
      requiredNote
      maxWidth="sm"
      onSubmit={() => void handleSubmit(onSubmit)()}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={mutation.isPending ? 'Guardando…' : submitLabel}
          pending={mutation.isPending}
          submitDisabled={transitions.length === 0}
        />
      }
    >
      <FormProvider {...form}>
        <Stack spacing={2}>
          {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
          <Typography variant="body2" color="text.secondary">
            {`Etapa actual: ${opportunity.stage.label}`}
          </Typography>
          {transitions.length === 0 ? (
            <Alert severity="info">No hay etapas a las que puedas pasar esta oportunidad desde la etapa actual.</Alert>
          ) : (
            <Controller
              control={control}
              name="toStageId"
              render={({ field }) => (
                <TextField
                  select
                  label={OPPORTUNITY_FIELD_LABELS.toStageId}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  required
                  disabled={mutation.isPending}
                  error={Boolean(errors.toStageId)}
                  helperText={errors.toStageId?.message ?? 'Solo las etapas permitidas desde la etapa actual.'}
                >
                  {transitions.map((stage) => (
                    <MenuItem key={stage.id} value={stage.id}>
                      {isReopening(opportunity.stage, stage) ? `${stage.label} (reabrir)` : stage.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}
          {reopening ? (
            <Alert severity="warning" role="status">
              {opportunity.result
                ? `Al reabrir se anula el resultado vigente (${resultText(opportunity.result, options.outcomes)}); queda en su historial.`
                : 'Al reabrir se anula el resultado vigente; queda en su historial.'}
            </Alert>
          ) : null}
          {closing ? (
            <Box>
              <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
                Resultado
              </Typography>
              <ResultForm outcomes={allowedOutcomes} reasons={options.reasons} disabled={mutation.isPending} />
            </Box>
          ) : null}
          <TextField
            {...register('comment')}
            label={OPPORTUNITY_FIELD_LABELS.comment}
            multiline
            minRows={2}
            required={reopening}
            disabled={mutation.isPending}
            error={Boolean(errors.comment)}
            helperText={errors.comment?.message ?? (reopening ? 'Obligatorio para reabrir.' : undefined)}
            slotProps={{ htmlInput: { maxLength: OPPORTUNITY_LIMITS.comment } }}
          />
        </Stack>
      </FormProvider>
    </EntityDialog>
  );
}

/**
 * Cambio de etapa (03 §E.7, F-17, F-18). Solo ofrece los destinos que el
 * backend devuelve en `allowedTransitions` (mapa del parámetro, regla de
 * respaldo, `oportunidades.cerrar` para las cerradas y `administrar` para
 * reabrir). Al cerrar, el resultado se registra en la misma operación con
 * `ResultForm`; al reabrir, el comentario es obligatorio y se avisa de que se
 * anula el resultado (RN-03.42). La etapa nunca cambia la fase (RN-03.44).
 */
export function StageChangeDialog({ open, opportunityId, onClose, onChanged }: StageChangeDialogProps) {
  const opportunity = useOpportunity(open ? opportunityId : undefined);
  const options = useOpportunityFormOptions(undefined, open);

  if (!open) {
    return null;
  }
  if (opportunity.data && options.data) {
    return <StageChangeForm key={opportunity.data.id} opportunity={opportunity.data} options={options.data} onClose={onClose} onChanged={onChanged} />;
  }
  const failed = opportunity.isError ? opportunity.error : options.isError ? options.error : null;
  return (
    <EntityDialog open onClose={onClose} title="Cambiar etapa" maxWidth="sm">
      {failed ? (
        <Alert severity="error">{withReference(describeApiError(failed, OPPORTUNITY_ERROR_MESSAGES))}</Alert>
      ) : (
        <Stack role="status" aria-label="Cargando la oportunidad" spacing={1}>
          <Skeleton variant="text" />
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        </Stack>
      )}
    </EntityDialog>
  );
}
