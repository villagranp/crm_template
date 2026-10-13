import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { DetailList, DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, commercialFieldErrors, withReference } from '../../common/commercial-activity.errors';
import type { AttachmentLimits } from '@/features/crm/common/attachments.api';

import { formatCalendarDate, formatDateTime } from '../../common/date-time';
import { FilesField } from '../../common/FilesField';
import type { VisitDetail } from '../visits.api';
import { useConfirmVisit } from '../visits.queries';
import { buildVisitConfirmationSchema, confirmationSummaryRequired, toVisitConfirmationInput, VISIT_LIMITS } from '../visits.schemas';

import { useVisitOperationFiles } from './use-visit-operation-files';

export interface VisitConfirmationDialogProps {
  open: boolean;
  visit: VisitDetail;
  /** `form-options.attachments` de visitas: comprobación previa de los archivos. */
  limits?: AttachmentLimits;
  /** Zona del usuario para la fecha real; `undefined` = la del navegador. */
  timeZone?: string;
  onClose: () => void;
  onDone: (visit: VisitDetail, warning: string | null) => void;
}

interface ConfirmationValues {
  confirmationSummary: string;
}

function textOrDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—';
}

/**
 * Confirmar una visita realizada (04 §E.8, F-28, RN-04.18). Sólo se ofrece al
 * dueño de la visita (`allowedActions` incluye `CONFIRM`, DM-20); el backend
 * vuelve a decidir (`403 VISIT_CONFIRMATION_OWNER_ONLY`). Muestra la realización
 * en solo lectura para revisarla; el resumen es obligatorio si la realización no
 * tiene resumen ni comentarios. Los archivos se suben al evento `CONFIRMED`.
 */
export function VisitConfirmationDialog({ open, visit, limits, timeZone, onClose, onDone }: VisitConfirmationDialogProps) {
  const confirmation = useConfirmVisit(visit.id);
  const files = useVisitOperationFiles(visit.id, limits);
  const [selected, setSelected] = useState<File[]>([]);
  const summaryRequired = confirmationSummaryRequired(visit);
  const schema = useMemo(() => buildVisitConfirmationSchema(summaryRequired), [summaryRequired]);
  const { register, handleSubmit, reset, setError, formState } = useForm<ConfirmationValues>({
    resolver: zodResolver(schema),
    defaultValues: { confirmationSummary: '' },
  });
  const { errors } = formState;

  const { reset: resetMutation } = confirmation;
  useEffect(() => {
    if (open) {
      reset({ confirmationSummary: '' });
      setSelected([]);
      resetMutation();
    }
  }, [open, reset, resetMutation]);

  useEffect(() => {
    const message = commercialFieldErrors(confirmation.error).confirmationSummary;
    if (message) {
      setError('confirmationSummary', { type: 'server', message }, { shouldFocus: false });
    }
  }, [confirmation.error, setError]);

  const pending = confirmation.isPending || files.uploading;
  const submit = (values: ConfirmationValues) => {
    confirmation.mutate(toVisitConfirmationInput(values), {
      onSuccess: async (saved) => {
        const warning = await files.upload({ eventType: 'CONFIRMED' }, selected);
        onDone(saved, warning);
        onClose();
      },
    });
  };

  const completion = visit.completion;
  const errorView = confirmation.isError ? describeApiError(confirmation.error, COMMERCIAL_ERROR_MESSAGES) : null;

  return (
    <EntityDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title="Confirmar visita"
      subtitle={`${visit.code} · ${visit.customer.legalName}`}
      maxWidth="sm"
      requiredNote={summaryRequired}
      onSubmit={(event) => void handleSubmit(submit)(event)}
      actions={<DialogFooter onCancel={onClose} submitLabel="Confirmar" pending={pending} />}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Al confirmarla, la visita queda cerrada y de solo lectura.
        </Typography>
        {completion ? (
          <Box component="section" aria-label="Realización registrada" sx={{ p: 2, borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <DetailList
              items={[
                { label: 'Fecha real', value: formatDateTime(completion.actualStartAt, timeZone) },
                { label: 'Resultado', value: textOrDash(completion.result?.label) },
                { label: 'Resumen del resultado', value: textOrDash(completion.resultSummary), wide: true },
                { label: 'Comentarios', value: textOrDash(completion.comments), wide: true },
                {
                  label: 'Próxima acción',
                  value: completion.nextAction
                    ? `${completion.nextAction}${completion.nextActionDate ? ` (${formatCalendarDate(completion.nextActionDate)})` : ''}`
                    : '—',
                  wide: true,
                },
              ]}
            />
          </Box>
        ) : null}
        <TextField
          {...register('confirmationSummary')}
          label="Resumen de confirmación"
          required={summaryRequired}
          multiline
          minRows={3}
          disabled={pending}
          error={Boolean(errors.confirmationSummary)}
          helperText={
            errors.confirmationSummary?.message ??
            (summaryRequired ? 'Obligatorio: la realización no tiene resumen ni comentarios.' : 'Opcional: la realización ya tiene resumen o comentarios.')
          }
          slotProps={{ htmlInput: { maxLength: VISIT_LIMITS.confirmationSummary } }}
        />
        <FilesField files={selected} onChange={setSelected} limits={limits} disabled={pending} description="Se adjuntan a la confirmación." />
        {files.uploading ? (
          <Typography role="status" variant="body2" color="text.secondary">
            Subiendo archivos…
          </Typography>
        ) : null}
        {errorView ? <Alert severity="error">{withReference(errorView)}</Alert> : null}
      </Stack>
    </EntityDialog>
  );
}
