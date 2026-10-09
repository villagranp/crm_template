import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, DialogContentText, TextField } from '@mui/material';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AdminDialog, DialogFooter } from './AdminDialog';

/** Longitud mínima de la razón de una asignación directa (ADR-018 §4, PLAN-ADMIN D5). */
export const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

export interface ConfirmDialogReasonOptions {
  /** Etiqueta del campo; por defecto "Razón". */
  label?: string;
  /** Mínimo de caracteres (sin contar espacios de los extremos); por defecto `REASON_MIN_LENGTH`. */
  minLength?: number;
  maxLength?: number;
  helperText?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva o de alto impacto: el botón de confirmar va en color de error. */
  destructive?: boolean;
  /** Si se indica, pide una razón obligatoria y se la pasa a `onConfirm`. */
  reason?: ConfirmDialogReasonOptions;
  /** La mutación está en curso: bloquea los botones y el cierre. */
  isPending?: boolean;
  /** Error de la mutación ya traducido (`describeApiError(error).message`). */
  errorMessage?: string | null;
  /** Recibe la razón ya recortada (o `undefined` si no se pidió). El diálogo no se cierra solo. */
  onConfirm: (reason: string | undefined) => void;
  onClose: () => void;
}

interface ReasonForm {
  reason: string;
}

/**
 * Confirmación de una acción, con razón obligatoria opcional.
 *
 * El diálogo no ejecuta nada: llama a `onConfirm` y la pantalla lanza su
 * mutación, pasa `isPending`/`errorMessage` y lo cierra al terminar con éxito.
 * La validación de la razón es de experiencia de usuario; el backend la
 * vuelve a exigir.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  reason,
  isPending = false,
  errorMessage,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const descriptionId = useId();
  const requiresReason = reason !== undefined;
  const minLength = reason?.minLength ?? REASON_MIN_LENGTH;
  const maxLength = reason?.maxLength ?? REASON_MAX_LENGTH;

  const schema = useMemo(
    () =>
      z.object({
        reason: requiresReason
          ? z
              .string()
              .trim()
              .min(minLength, `Escribe al menos ${minLength} caracteres.`)
              .max(maxLength, `Usa como máximo ${maxLength} caracteres.`)
          : z.string(),
      }),
    [requiresReason, minLength, maxLength],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReasonForm>({ resolver: zodResolver(schema), defaultValues: { reason: '' } });

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
    }
  }, [open, reset]);

  const submit = handleSubmit((values) => onConfirm(requiresReason ? values.reason : undefined));

  return (
    <AdminDialog
      open={open}
      onClose={isPending ? undefined : onClose}
      title={title}
      describedBy={description ? descriptionId : undefined}
      maxWidth="sm"
      fullScreenBelow="xs"
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          cancelLabel={cancelLabel}
          submitLabel={confirmLabel}
          pending={isPending}
          destructive={destructive}
        />
      }
    >
      {description ? (
        <DialogContentText id={descriptionId} sx={{ mb: requiresReason ? 2 : 0 }}>
          {description}
        </DialogContentText>
      ) : null}

      {requiresReason ? (
        <TextField
          {...register('reason')}
          label={reason.label ?? 'Razón'}
          required
          fullWidth
          multiline
          minRows={2}
          autoFocus
          disabled={isPending}
          error={Boolean(errors.reason)}
          helperText={
            errors.reason?.message ?? reason.helperText ?? `Mínimo ${minLength} caracteres.`
          }
        />
      ) : null}

      {errorMessage ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errorMessage}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
