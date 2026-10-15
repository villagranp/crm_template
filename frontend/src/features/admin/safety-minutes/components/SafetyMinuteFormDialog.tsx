import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, TextField } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { AdminDialog, DialogFooter, FormSection, FullRow } from '@/features/admin/common';

import type { SafetyMinute } from '../safety-minutes.api';
import { describeSafetyMinuteError, isDuplicateDate } from '../safety-minutes.errors';
import { formatDisplayDate } from '../safety-minutes-format';
import { useCreateSafetyMinute, useUpdateSafetyMinute } from '../safety-minutes.queries';
import {
  createSafetyMinuteFormSchema,
  MESSAGE_MAX,
  todayIso,
  type SafetyMinuteFormValues,
} from '../safety-minutes.schemas';

export interface SafetyMinuteFormDialogProps {
  open: boolean;
  /** `null` = alta; con valor = edición. */
  minute: SafetyMinute | null;
  onClose: () => void;
}

function defaults(minute: SafetyMinute | null): SafetyMinuteFormValues {
  return { message: minute?.message ?? '', displayDate: minute?.displayDate.slice(0, 10) ?? '' };
}

/**
 * Alta («Nuevo mensaje») y edición del minuto de seguridad (AJ1 HU-AJ1-2).
 * El mensaje es texto plano multilínea (1–1000, recortado) y la fecha usa el
 * `<input type="date">` nativo. Al editar sólo viajan los campos que cambian.
 * La fecha duplicada, pasada o bloqueada la decide el backend; aquí se muestran.
 */
export function SafetyMinuteFormDialog({ open, minute, onClose }: SafetyMinuteFormDialogProps) {
  const createMutation = useCreateSafetyMinute();
  const updateMutation = useUpdateSafetyMinute();
  const mutation = minute ? updateMutation : createMutation;
  const originalDate = minute?.displayDate.slice(0, 10);
  // Hoy se fija al abrir el diálogo (no en cada render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schema = useMemo(() => createSafetyMinuteFormSchema(todayIso(), originalDate), [open, originalDate]);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SafetyMinuteFormValues>({ resolver: zodResolver(schema), defaultValues: defaults(minute) });
  const { reset: resetCreate } = createMutation;
  const { reset: resetUpdate } = updateMutation;
  const message = useWatch({ control, name: 'message' });

  useEffect(() => {
    if (open) {
      reset(defaults(minute));
      resetCreate();
      resetUpdate();
    }
  }, [open, minute, reset, resetCreate, resetUpdate]);

  const handleError = (error: unknown) => {
    if (isDuplicateDate(error)) {
      setError('displayDate', { message: describeSafetyMinuteError(error).message });
    }
  };

  const submit = handleSubmit((values) => {
    if (minute) {
      const body = {
        ...(values.message !== minute.message ? { message: values.message } : {}),
        ...(values.displayDate !== originalDate ? { displayDate: values.displayDate } : {}),
      };
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      updateMutation.mutate({ id: minute.id, body }, { onSuccess: onClose, onError: handleError });
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError: handleError });
    }
  });

  const pending = mutation.isPending;
  const error = mutation.isError && !isDuplicateDate(mutation.error) ? describeSafetyMinuteError(mutation.error) : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={minute ? `Editar mensaje del ${formatDisplayDate(minute.displayDate)}` : 'Nuevo mensaje'}
      subtitle="Minuto de seguridad"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter onCancel={onClose} submitLabel={minute ? 'Guardar cambios' : 'Registrar'} pending={pending} />
      }
    >
      <FormSection number={1} title="Mensaje">
        <TextField
          {...register('displayDate')}
          label="Fecha de visualización"
          type="date"
          required
          disabled={pending}
          slotProps={{ inputLabel: { shrink: true } }}
          error={Boolean(errors.displayDate)}
          helperText={errors.displayDate?.message ?? 'Día en que todos lo ven en Inicio. Un mensaje por fecha.'}
        />
        <FullRow>
          <TextField
            {...register('message')}
            label="Mensaje"
            required
            multiline
            minRows={4}
            disabled={pending}
            error={Boolean(errors.message)}
            helperText={errors.message?.message ?? `${message.trim().length}/${MESSAGE_MAX} caracteres. Texto plano.`}
          />
        </FullRow>
      </FormSection>
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
