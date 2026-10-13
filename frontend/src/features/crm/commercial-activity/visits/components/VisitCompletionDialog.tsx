import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, commercialFieldErrors, withReference } from '../../common/commercial-activity.errors';
import { FilesField } from '../../common/FilesField';
import { ParticipantsField } from '../../common/ParticipantsField';
import { formTimeZone } from '../../common/use-commercial-time-zones';
import type { VisitDetail, VisitFormOptions } from '../visits.api';
import { useVisitCompletion } from '../visits.queries';
import {
  buildVisitCompletionSchema,
  isCompletionFieldRequired,
  toVisitCompletionInput,
  VISIT_LIMITS,
  visitCompletionFieldFor,
  visitCompletionValuesFrom,
  type VisitCompletionField,
  type VisitCompletionValues,
} from '../visits.schemas';

import { useVisitOperationFiles } from './use-visit-operation-files';

export interface VisitCompletionDialogProps {
  open: boolean;
  /** `record`: registrar realizada (`POST`); `correct`: corregir la realización (`PUT`, RN-04.17). */
  mode: 'record' | 'correct';
  visit: VisitDetail;
  options: VisitFormOptions | undefined;
  onClose: () => void;
  onDone: (visit: VisitDetail, warning: string | null) => void;
}

/**
 * Registrar una visita como realizada o corregir su realización antes de
 * confirmarla (04 §E.8, F-27, RN-04.16, RN-04.17). Sólo la fecha real es
 * obligatoria (D-04.4) más lo que añada `crm.campos_obligatorios.visitCompletion`;
 * la fecha real y el fin real no pueden ser futuros. Al registrar, los asistentes
 * parten de los invitados (editables) y los archivos se suben al evento
 * `COMPLETED`; al corregir (sin evento nuevo, D-04.6) se suben a la visita. La
 * corrección sustituye la realización guardada: el formulario parte de ella.
 */
export function VisitCompletionDialog({ open, mode, visit, options, onClose, onDone }: VisitCompletionDialogProps) {
  const completion = useVisitCompletion(visit.id, mode);
  const files = useVisitOperationFiles(visit.id, options?.attachments);
  const [selected, setSelected] = useState<File[]>([]);
  // Zona del usuario (RN-04.9): las fechas reales se escriben y se validan en ella.
  const timeZone = formTimeZone(options);
  const requiredFields = useMemo(() => options?.completionRequiredFields ?? [], [options?.completionRequiredFields]);
  const schema = useMemo(() => buildVisitCompletionSchema(requiredFields, undefined, timeZone), [requiredFields, timeZone]);
  const { register, control, handleSubmit, reset, setError, formState } = useForm<VisitCompletionValues>({
    resolver: zodResolver(schema),
    defaultValues: visitCompletionValuesFrom(visit, undefined, timeZone),
  });
  const { errors } = formState;
  const required = (field: VisitCompletionField) => isCompletionFieldRequired(field, requiredFields);

  const { reset: resetMutation } = completion;
  useEffect(() => {
    if (open) {
      reset(visitCompletionValuesFrom(visit, undefined, timeZone));
      setSelected([]);
      resetMutation();
    }
    // Se reinicia al abrir; no al refrescar la visita con el diálogo abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset, resetMutation, timeZone]);

  useEffect(() => {
    for (const [apiField, message] of Object.entries(commercialFieldErrors(completion.error))) {
      const field = visitCompletionFieldFor(apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [completion.error, setError]);

  const pending = completion.isPending || files.uploading;
  const submit = (values: VisitCompletionValues) => {
    completion.mutate(toVisitCompletionInput(values, timeZone), {
      onSuccess: async (saved) => {
        const warning = await files.upload(mode === 'record' ? { eventType: 'COMPLETED' } : { visit: true }, selected);
        onDone(saved, warning);
        onClose();
      },
    });
  };

  const errorView = completion.isError ? describeApiError(completion.error, COMMERCIAL_ERROR_MESSAGES) : null;
  const text = (field: 'topics' | 'agreements' | 'resultSummary' | 'comments' | 'nextAction', label: string, limit: number, rows?: number) => (
    <TextField
      {...register(field)}
      label={label}
      required={required(field)}
      multiline={rows !== undefined}
      minRows={rows}
      disabled={pending}
      error={Boolean(errors[field])}
      helperText={errors[field]?.message}
      slotProps={{ htmlInput: { maxLength: limit } }}
    />
  );

  return (
    <EntityDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={mode === 'record' ? 'Registrar visita realizada' : 'Corregir realización'}
      subtitle={`${visit.code} · ${visit.customer.legalName}`}
      maxWidth="md"
      requiredNote
      onSubmit={(event) => void handleSubmit(submit)(event)}
      actions={
        <DialogFooter onCancel={onClose} submitLabel={mode === 'record' ? 'Registrar realizada' : 'Guardar corrección'} pending={pending} submitDisabled={!options} />
      }
    >
      <Stack spacing={2}>
        {mode === 'correct' ? (
          <Typography variant="body2" color="text.secondary">
            La corrección sustituye la realización registrada. Queda en la auditoría y no genera un evento nuevo.
          </Typography>
        ) : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <TextField
            {...register('actualStartAt')}
            type="datetime-local"
            label="Fecha y hora real"
            required
            disabled={pending}
            error={Boolean(errors.actualStartAt)}
            helperText={errors.actualStartAt?.message ?? 'No puede ser futura.'}
          />
          <TextField
            {...register('actualEndAt')}
            type="datetime-local"
            label="Fin real"
            required={required('actualEndAt')}
            disabled={pending}
            error={Boolean(errors.actualEndAt)}
            helperText={errors.actualEndAt?.message ?? 'Opcional.'}
          />
        </Box>
        <Controller
          control={control}
          name="attendees"
          render={({ field, fieldState }) => (
            <ParticipantsField
              label="Asistentes"
              customerId={visit.customer.id}
              value={field.value}
              onChange={field.onChange}
              required={required('attendees')}
              disabled={pending}
              error={fieldState.error?.message}
              helperText={mode === 'record' ? 'Parten de los invitados: quita o añade a quien asistió.' : undefined}
            />
          )}
        />
        {text('topics', 'Temas tratados', VISIT_LIMITS.topics, 2)}
        {text('agreements', 'Acuerdos', VISIT_LIMITS.agreements, 2)}
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
              label="Resultado"
              required={required('resultId')}
              disabled={pending}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            >
              <MenuItem value="">Sin resultado de la lista</MenuItem>
              {(options?.results ?? []).map((result) => (
                <MenuItem key={result.id} value={result.id}>
                  {result.label}
                </MenuItem>
              ))}
              {visit.completion?.result && !(options?.results ?? []).some((result) => result.id === visit.completion?.result?.id) ? (
                <MenuItem value={visit.completion.result.id}>{visit.completion.result.label}</MenuItem>
              ) : null}
            </TextField>
          )}
        />
        {text('resultSummary', 'Resumen del resultado', VISIT_LIMITS.resultSummary, 2)}
        {text('comments', 'Comentarios', VISIT_LIMITS.comments, 2)}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          {text('nextAction', 'Próxima acción', VISIT_LIMITS.nextAction)}
          <TextField
            {...register('nextActionDate')}
            type="date"
            label="Fecha de la próxima acción"
            required={required('nextActionDate')}
            disabled={pending}
            error={Boolean(errors.nextActionDate)}
            helperText={errors.nextActionDate?.message}
          />
        </Box>
        <FilesField
          files={selected}
          onChange={setSelected}
          limits={options?.attachments}
          disabled={pending}
          description={mode === 'record' ? 'Se adjuntan al registro de la realización.' : 'Se adjuntan a la visita.'}
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
