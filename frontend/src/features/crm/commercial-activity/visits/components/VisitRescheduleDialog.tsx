import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, commercialFieldErrors, withReference } from '../../common/commercial-activity.errors';
import { formatDateTime } from '../../common/date-time';
import { FilesField } from '../../common/FilesField';
import { formTimeZone } from '../../common/use-commercial-time-zones';
import { useVisitScheduleConflicts } from '../use-visit-schedule-conflicts';
import type { VisitDetail, VisitFormOptions } from '../visits.api';
import { useRescheduleVisit } from '../visits.queries';
import { buildVisitRescheduleSchema, toVisitReschedulingInput, type VisitRescheduleValues } from '../visits.schemas';

import { ReasonFields } from './ReasonFields';
import { ScheduleConflictAlert } from './ScheduleConflictAlert';
import { useVisitOperationFiles } from './use-visit-operation-files';

export interface VisitRescheduleDialogProps {
  open: boolean;
  visit: VisitDetail;
  options: VisitFormOptions | undefined;
  /** Usuario de la sesión (el aviso de conflicto dice "Ya tienes…" si es el responsable). */
  currentUserId: string | null;
  onClose: () => void;
  /** Tras reprogramar: el detalle actualizado y, si algún archivo no se adjuntó, el aviso. */
  onDone: (visit: VisitDetail, warning: string | null) => void;
}

const EMPTY: VisitRescheduleValues = { newScheduledStartAt: '', newScheduledEndAt: '', reasonId: '', reasonText: '', comment: '' };
const FIELDS: readonly (keyof VisitRescheduleValues)[] = ['newScheduledStartAt', 'newScheduledEndAt', 'reasonId', 'reasonText', 'comment'];

/**
 * Reprogramar una visita pendiente (04 §E.8, F-29, RN-04.19): nueva fecha y
 * hora (distinta de la vigente y no pasada), fin opcional, motivo de la lista
 * y/o escrito, comentario y archivos, que se suben al evento `RESCHEDULED`
 * recién creado (D-04.18). Avisa de solapes como al planificar, sin bloquear.
 * La misma visita cambia de fecha: nunca se crea otra.
 */
export function VisitRescheduleDialog({ open, visit, options, currentUserId, onClose, onDone }: VisitRescheduleDialogProps) {
  const reschedule = useRescheduleVisit(visit.id);
  const files = useVisitOperationFiles(visit.id, options?.attachments);
  const [selected, setSelected] = useState<File[]>([]);
  // Zona del usuario (RN-04.9): la nueva fecha se escribe y se valida en ella.
  const timeZone = formTimeZone(options);
  const schema = useMemo(() => buildVisitRescheduleSchema(visit.scheduledStartAt, undefined, timeZone), [visit.scheduledStartAt, timeZone]);
  const { register, control, handleSubmit, reset, setError, watch, formState } = useForm<VisitRescheduleValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { errors } = formState;

  const { reset: resetMutation } = reschedule;
  useEffect(() => {
    if (open) {
      reset(EMPTY);
      setSelected([]);
      resetMutation();
    }
  }, [open, reset, resetMutation]);

  useEffect(() => {
    for (const [apiField, message] of Object.entries(commercialFieldErrors(reschedule.error))) {
      const field = FIELDS.find((name) => name === apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [reschedule.error, setError]);

  const ownVisit = visit.owner.id === currentUserId;
  const conflicts = useVisitScheduleConflicts({
    mode: options?.conflictMode,
    ownerId: ownVisit ? undefined : visit.owner.id,
    start: watch('newScheduledStartAt'),
    end: watch('newScheduledEndAt'),
    excludeVisitId: visit.id,
    enabled: open,
    timeZone,
  });

  const pending = reschedule.isPending || files.uploading;
  const submit = (values: VisitRescheduleValues) => {
    reschedule.mutate(toVisitReschedulingInput(values, timeZone), {
      onSuccess: async (saved) => {
        const warning = await files.upload({ eventType: 'RESCHEDULED' }, selected);
        onDone(saved, warning);
        onClose();
      },
    });
  };

  const errorView = reschedule.isError ? describeApiError(reschedule.error, COMMERCIAL_ERROR_MESSAGES) : null;

  return (
    <EntityDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title="Reprogramar visita"
      subtitle={`${visit.code} · ${visit.customer.legalName}`}
      maxWidth="sm"
      requiredNote
      onSubmit={(event) => void handleSubmit(submit)(event)}
      actions={<DialogFooter onCancel={onClose} submitLabel="Reprogramar" pending={pending} submitDisabled={!options} />}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {`Fecha vigente: ${formatDateTime(visit.scheduledStartAt, timeZone)}. La visita conserva su código y su historial.`}
        </Typography>
        <TextField
          {...register('newScheduledStartAt')}
          type="datetime-local"
          label="Nueva fecha y hora"
          required
          disabled={pending}
          error={Boolean(errors.newScheduledStartAt)}
          helperText={errors.newScheduledStartAt?.message ?? 'Distinta de la vigente y no pasada.'}
        />
        <TextField
          {...register('newScheduledEndAt')}
          type="datetime-local"
          label="Nuevo fin"
          disabled={pending}
          error={Boolean(errors.newScheduledEndAt)}
          helperText={errors.newScheduledEndAt?.message ?? 'Opcional. Sin fin, se conserva la duración planificada.'}
        />
        <ScheduleConflictAlert conflicts={conflicts.conflicts} mode={options?.conflictMode} ownVisits={ownVisit} />
        <ReasonFields control={control} reasons={options?.rescheduleReasons ?? []} disabled={pending} />
        <FilesField
          files={selected}
          onChange={setSelected}
          limits={options?.attachments}
          disabled={pending}
          description="Se adjuntan a la reprogramación al guardarla."
        />
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
