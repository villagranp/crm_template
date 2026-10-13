import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, DialogContentText, Stack, Typography } from '@mui/material';
import { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, commercialFieldErrors, withReference } from '../../common/commercial-activity.errors';
import { FilesField } from '../../common/FilesField';
import type { VisitDetail, VisitFormOptions } from '../visits.api';
import { useCancelVisit } from '../visits.queries';
import { buildVisitCancelSchema, toVisitCancellationInput, type VisitReasonValues } from '../visits.schemas';

import { ReasonFields } from './ReasonFields';
import { useVisitOperationFiles } from './use-visit-operation-files';

export interface VisitCancelDialogProps {
  open: boolean;
  visit: VisitDetail;
  options: VisitFormOptions | undefined;
  onClose: () => void;
  onDone: (visit: VisitDetail, warning: string | null) => void;
}

const EMPTY: VisitReasonValues = { reasonId: '', reasonText: '', comment: '' };
const FIELDS: readonly (keyof VisitReasonValues)[] = ['reasonId', 'reasonText', 'comment'];

/**
 * Cancelar una visita pendiente (04 §E.8, F-29, RN-04.20): confirmación
 * destructiva con motivo (de la lista y/o escrito), comentario y archivos, que
 * se suben al evento `CANCELLED` (D-04.18). La visita no se elimina ni se puede
 * reactivar (D-04.6).
 */
export function VisitCancelDialog({ open, visit, options, onClose, onDone }: VisitCancelDialogProps) {
  const descriptionId = useId();
  const cancellation = useCancelVisit(visit.id);
  const files = useVisitOperationFiles(visit.id);
  const [selected, setSelected] = useState<File[]>([]);
  const schema = useMemo(() => buildVisitCancelSchema(), []);
  const { control, handleSubmit, reset, setError } = useForm<VisitReasonValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const { reset: resetMutation } = cancellation;
  useEffect(() => {
    if (open) {
      reset(EMPTY);
      setSelected([]);
      resetMutation();
    }
  }, [open, reset, resetMutation]);

  useEffect(() => {
    for (const [apiField, message] of Object.entries(commercialFieldErrors(cancellation.error))) {
      const field = FIELDS.find((name) => name === apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [cancellation.error, setError]);

  const pending = cancellation.isPending || files.uploading;
  const submit = (values: VisitReasonValues) => {
    cancellation.mutate(toVisitCancellationInput(values), {
      onSuccess: async (saved) => {
        const warning = await files.upload({ eventType: 'CANCELLED' }, selected);
        onDone(saved, warning);
        onClose();
      },
    });
  };

  return (
    <EntityDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title="Cancelar visita"
      subtitle={`${visit.code} · ${visit.customer.legalName}`}
      describedBy={descriptionId}
      maxWidth="sm"
      requiredNote
      onSubmit={(event) => void handleSubmit(submit)(event)}
      actions={<DialogFooter onCancel={onClose} cancelLabel="Volver" submitLabel="Cancelar visita" pending={pending} destructive submitDisabled={!options} />}
    >
      <Stack spacing={2}>
        <DialogContentText id={descriptionId}>La visita quedará cancelada y no podrá reactivarse. Se conserva con su historial.</DialogContentText>
        <ReasonFields control={control} reasons={options?.cancellationReasons ?? []} disabled={pending} />
        <FilesField files={selected} onChange={setSelected} disabled={pending} description="Se adjuntan a la cancelación al confirmarla." />
        {files.uploading ? (
          <Typography role="status" variant="body2" color="text.secondary">
            Subiendo archivos…
          </Typography>
        ) : null}
        {cancellation.isError ? <Alert severity="error">{withReference(describeApiError(cancellation.error, COMMERCIAL_ERROR_MESSAGES))}</Alert> : null}
      </Stack>
    </EntityDialog>
  );
}
