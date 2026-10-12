import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Skeleton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog } from '@/components/data';
import { FormErrorAlert, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';

import type { OpportunityDetail, OpportunityFormOptions, OpportunityResult } from '../opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES, opportunityFieldErrors } from '../opportunities.errors';
import { useOpportunity, useOpportunityFormOptions, useUpdateOpportunityResult } from '../opportunities.queries';
import { buildResultSchema, outcomesForStage, resultValuesFrom, toResultInput, type ResultFormValues } from '../opportunities.schemas';

import { ResultForm } from './ResultForm';

export interface ResultEditDialogProps {
  open: boolean;
  opportunityId: string;
  onClose: () => void;
  onSaved: (result: OpportunityResult) => void;
}

const FORM_FIELDS: ReadonlySet<string> = new Set(['outcome', 'reasonId', 'awardedPercent', 'decisionDate', 'comments']);

function ResultEditForm({ opportunity, options, onClose, onSaved }: { opportunity: OpportunityDetail; options: OpportunityFormOptions } & Omit<ResultEditDialogProps, 'open' | 'opportunityId'>) {
  // RN-03.52: sin salir de la etapa cerrada; Ganado ↔ Parcial, nunca a Perdido (exige reabrir).
  const outcomes = useMemo(() => outcomesForStage(options.outcomes, opportunity.stage.outcome), [options.outcomes, opportunity.stage.outcome]);
  const schema = useMemo(() => buildResultSchema({ outcomes, reasons: options.reasons }), [outcomes, options.reasons]);
  const mutation = useUpdateOpportunityResult(opportunity.id, opportunity.project.id);
  const form = useForm<ResultFormValues>({ resolver: zodResolver(schema), defaultValues: resultValuesFrom(opportunity.result) });
  const { handleSubmit, setError } = form;

  const error = mutation.isError ? mutation.error : null;
  useEffect(() => {
    for (const [field, message] of Object.entries(opportunityFieldErrors(error))) {
      if (FORM_FIELDS.has(field)) {
        setError(field as keyof ResultFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);
  const errorView = error ? describeApiError(error, OPPORTUNITY_ERROR_MESSAGES) : null;

  return (
    <EntityDialog
      open
      onClose={mutation.isPending ? undefined : onClose}
      title="Modificar resultado"
      subtitle={`${opportunity.code} · ${opportunity.project.name}`}
      requiredNote
      maxWidth="sm"
      onSubmit={() => void handleSubmit((values) => mutation.mutate(toResultInput(values, outcomes), { onSuccess: (saved) => onSaved(saved) }))()}
      actions={<DialogFooter onCancel={onClose} submitLabel={mutation.isPending ? 'Guardando…' : 'Guardar resultado'} pending={mutation.isPending} />}
    >
      <FormProvider {...form}>
        <Stack spacing={2}>
          {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
          <Typography variant="body2" color="text.secondary">
            {`La oportunidad sigue en ${opportunity.stage.label}. Para pasar a un resultado de otra etapa hay que reabrirla y volver a cerrarla.`}
          </Typography>
          <ResultForm outcomes={outcomes} reasons={options.reasons} disabled={mutation.isPending} />
        </Stack>
      </FormProvider>
    </EntityDialog>
  );
}

/**
 * "Modificar resultado" (03 §E.4 #5, RN-03.52, `PUT /opportunities/{id}/result`):
 * corrige el resultado vigente sin cambiar de etapa. Se ofrece con
 * `capabilities.canClose` sobre una oportunidad cerrada.
 */
export function ResultEditDialog({ open, opportunityId, onClose, onSaved }: ResultEditDialogProps) {
  const opportunity = useOpportunity(open ? opportunityId : undefined);
  const options = useOpportunityFormOptions(undefined, open);

  if (!open) {
    return null;
  }
  if (opportunity.data && options.data) {
    return <ResultEditForm key={opportunity.data.id} opportunity={opportunity.data} options={options.data} onClose={onClose} onSaved={onSaved} />;
  }
  const failed = opportunity.isError ? opportunity.error : options.isError ? options.error : null;
  return (
    <EntityDialog open onClose={onClose} title="Modificar resultado" maxWidth="sm">
      {failed ? (
        <Alert severity="error">{withReference(describeApiError(failed, OPPORTUNITY_ERROR_MESSAGES))}</Alert>
      ) : (
        <Stack role="status" aria-label="Cargando el resultado" spacing={1}>
          <Skeleton variant="text" />
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        </Stack>
      )}
    </EntityDialog>
  );
}
