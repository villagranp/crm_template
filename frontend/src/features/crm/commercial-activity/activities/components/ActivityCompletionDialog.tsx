import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DialogFooter, EntityDialog } from '@/components/data';
import { attachmentKeys } from '@/features/crm/common/attachments.queries';
import { describeApiError } from '@/lib/api-error-view';

import { commercialAttachmentsPath } from '../../common/attachment-owner';
import { COMMERCIAL_ERROR_MESSAGES, commercialFieldErrors, withReference } from '../../common/commercial-activity.errors';
import { isFutureLocalValue, nowDateTimeLocalValue } from '../../common/date-time';
import { FilesField } from '../../common/FilesField';
import { uploadFilesInOrder } from '../../common/upload-files';
import type { ActivityDetail } from '../activities.api';
import { useActivityFormOptions, useCompleteActivity } from '../activities.queries';
import { ACTIVITY_LIMITS, toCompletionInput } from '../activities.schemas';

export interface ActivityCompletionDialogProps {
  open: boolean;
  /** Actividad abierta que se completa (de la bandeja, el detalle o la agenda). */
  activity: { id: string; code: string; subject: string } | null;
  onClose: () => void;
  /** Tras completar: recibe el detalle actualizado (ya está en caché). */
  onCompleted?: (activity: ActivityDetail) => void;
}

interface CompletionValues {
  completedAt: string;
  completionResultId: string;
  completionResultNotes: string;
  completionComment: string;
}

const RESULT_MESSAGE = 'Indica un resultado de la lista o escribe notas.';

function buildSchema(now: () => Date) {
  return z
    .object({
      completedAt: z.string(),
      completionResultId: z.string(),
      completionResultNotes: z.string().max(ACTIVITY_LIMITS.resultNotes, `Usa como máximo ${ACTIVITY_LIMITS.resultNotes} caracteres.`),
      completionComment: z.string().max(ACTIVITY_LIMITS.completionComment, `Usa como máximo ${ACTIVITY_LIMITS.completionComment} caracteres.`),
    })
    .superRefine((values, ctx) => {
      if (!values.completionResultId.trim() && !values.completionResultNotes.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completionResultId'], message: RESULT_MESSAGE });
      }
      if (isFutureLocalValue(values.completedAt, now())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'No puede ser futura.' });
      }
    });
}

/** Error del backend (campo del DTO) → campo del diálogo. */
const SERVER_FIELD: Record<string, keyof CompletionValues> = {
  completedAt: 'completedAt',
  resultId: 'completionResultId',
  resultNotes: 'completionResultNotes',
  comment: 'completionComment',
};

/**
 * Completar una actividad (04 §E.10, F-33, RN-04.28). Reutilizable desde la
 * bandeja, el detalle y la agenda. El estado destino no se elige (es el de
 * `isCompleted`). Exige resultado (de la lista y/o notas) y una fecha de
 * finalización no futura (por defecto ahora). Los archivos se suben a la
 * actividad **antes** de completar, mientras sigue abierta (E.12): si uno falla,
 * no se completa y se avisa.
 */
export function ActivityCompletionDialog({ open, activity, onClose, onCompleted }: ActivityCompletionDialogProps) {
  const queryClient = useQueryClient();
  const options = useActivityFormOptions(open);
  const completion = useCompleteActivity();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const schema = useMemo(() => buildSchema(() => new Date()), []);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CompletionValues>({
    resolver: zodResolver(schema),
    defaultValues: { completedAt: '', completionResultId: '', completionResultNotes: '', completionComment: '' },
  });

  const { reset: resetCompletion } = completion;
  useEffect(() => {
    if (open) {
      reset({ completedAt: nowDateTimeLocalValue(), completionResultId: '', completionResultNotes: '', completionComment: '' });
      setFiles([]);
      setUploadError(null);
      resetCompletion();
    }
  }, [open, reset, resetCompletion]);

  useEffect(() => {
    for (const [apiField, message] of Object.entries(commercialFieldErrors(completion.error))) {
      const field = SERVER_FIELD[apiField];
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [completion.error, setError]);

  const pending = uploading || completion.isPending;
  const target = options.data?.statuses
    .filter((status) => status.group === 'COMPLETED')
    .sort((left, right) => left.sortOrder - right.sortOrder)[0];

  const submit = async (values: CompletionValues) => {
    if (!activity) {
      return;
    }
    setUploadError(null);
    if (files.length > 0) {
      const basePath = commercialAttachmentsPath({ type: 'activity', activityId: activity.id });
      setUploading(true);
      const result = await uploadFilesInOrder(basePath, files);
      setUploading(false);
      setFiles((current) => current.filter((file) => !result.uploaded.includes(file)));
      if (result.uploaded.length > 0) {
        void queryClient.invalidateQueries({ queryKey: attachmentKeys.owner(basePath) });
      }
      if (result.failure) {
        setUploadError(`${result.failure.file.name}: ${result.failure.message} La actividad no se completó; quita el archivo o inténtalo de nuevo.`);
        return;
      }
    }
    completion.mutate(
      { activityId: activity.id, input: toCompletionInput(values) },
      {
        onSuccess: (detail) => {
          onCompleted?.(detail);
          onClose();
        },
      },
    );
  };

  const errorView = completion.isError ? describeApiError(completion.error, COMMERCIAL_ERROR_MESSAGES) : null;

  return (
    <EntityDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title="Completar actividad"
      subtitle={activity ? `${activity.code} · ${activity.subject}` : undefined}
      maxWidth="sm"
      requiredNote
      onSubmit={(event) => void handleSubmit(submit)(event)}
      actions={<DialogFooter onCancel={onClose} submitLabel="Completar" pending={pending} submitDisabled={!options.data} />}
    >
      {options.isPending ? (
        <Stack role="status" aria-label="Cargando las opciones" spacing={1.5}>
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(6) }} />
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(6) }} />
        </Stack>
      ) : options.isError ? (
        <Alert severity="error">{withReference(describeApiError(options.error))}</Alert>
      ) : (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {`Pasará al estado «${target?.label ?? 'Completada'}». La operación es definitiva.`}
          </Typography>
          <TextField
            {...register('completedAt')}
            type="datetime-local"
            label="Fecha de finalización"
            required
            disabled={pending}
            error={Boolean(errors.completedAt)}
            helperText={errors.completedAt?.message ?? 'Por defecto, ahora. No puede ser futura.'}
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
                disabled={pending}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? 'Resultado de la lista o notas: al menos uno.'}
              >
                <MenuItem value="">Sin resultado de la lista</MenuItem>
                {options.data.results.map((result) => (
                  <MenuItem key={result.id} value={result.id}>
                    {result.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField
            {...register('completionResultNotes')}
            label="Notas del resultado"
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.completionResultNotes)}
            helperText={errors.completionResultNotes?.message}
            slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.resultNotes } }}
          />
          <TextField
            {...register('completionComment')}
            label="Comentario"
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.completionComment)}
            helperText={errors.completionComment?.message}
            slotProps={{ htmlInput: { maxLength: ACTIVITY_LIMITS.completionComment } }}
          />
          <Box>
            <FilesField
              files={files}
              onChange={setFiles}
              disabled={pending}
              description="Se suben a la actividad antes de completarla."
            />
          </Box>
          {uploading ? (
            <Typography role="status" variant="body2" color="text.secondary">
              Subiendo archivos…
            </Typography>
          ) : null}
          {uploadError ? <Alert severity="error">{uploadError}</Alert> : null}
          {errorView ? <Alert severity="error">{withReference(errorView)}</Alert> : null}
        </Stack>
      )}
    </EntityDialog>
  );
}
