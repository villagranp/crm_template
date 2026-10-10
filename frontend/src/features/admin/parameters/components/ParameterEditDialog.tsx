import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  DialogContentText,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { AdminDialog, describeApiError, DialogFooter } from '@/features/admin/common';

import type { SystemParameter } from '../parameters.api';
import { useUpdateParameter } from '../parameters.queries';
import {
  PARAMETER_RANGES,
  parameterFormSchema,
  type ParameterFormValues,
} from '../parameters.schemas';

export interface ParameterEditDialogProps {
  /** Parámetro a editar; `null` cierra el diálogo. */
  parameter: SystemParameter | null;
  onClose: () => void;
}

function helperFor(parameter: SystemParameter): string | undefined {
  const range = PARAMETER_RANGES[parameter.key];
  if (range) {
    return `Entre ${range.min} y ${range.max}.`;
  }
  if (parameter.type === 'JSON') {
    return 'JSON válido.';
  }
  return undefined;
}

/**
 * Edición del valor de un parámetro, con el control adecuado a su tipo.
 * El backend vuelve a validar; su `422` se muestra con el motivo.
 */
export function ParameterEditDialog({ parameter, onClose }: ParameterEditDialogProps) {
  const mutation = useUpdateParameter();
  const schema = useMemo(() => (parameter ? parameterFormSchema(parameter) : null), [parameter]);

  const form = useForm<ParameterFormValues>({
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues: { value: parameter?.value ?? '' },
  });
  const { reset } = form;
  const { reset: resetMutation } = mutation;

  useEffect(() => {
    reset({ value: parameter?.value ?? '' });
    resetMutation();
  }, [parameter, reset, resetMutation]);

  if (!parameter) {
    return null;
  }

  const error = mutation.isError ? describeApiError(mutation.error) : null;
  const handleClose = () => {
    if (!mutation.isPending) {
      onClose();
    }
  };

  const submit = form.handleSubmit((values) => {
    mutation.mutate(
      { key: parameter.key, value: values.value.trim() },
      { onSuccess: () => onClose() },
    );
  });

  return (
    <AdminDialog
      open
      onClose={mutation.isPending ? undefined : handleClose}
      title={`Editar «${parameter.name}»`}
      subtitle="Parámetros"
      maxWidth="sm"
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter onCancel={handleClose} submitLabel="Guardar" pending={mutation.isPending} />
      }
    >
      <Stack spacing={2}>
        {parameter.description ? (
          <DialogContentText variant="body2">{parameter.description}</DialogContentText>
        ) : null}
        <Controller
          name="value"
          control={form.control}
          render={({ field, fieldState }) =>
            parameter.type === 'BOOLEAN' ? (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value === 'true'}
                    onChange={(event) => field.onChange(event.target.checked ? 'true' : 'false')}
                  />
                }
                label={field.value === 'true' ? 'Activado' : 'Desactivado'}
              />
            ) : (
              <TextField
                {...field}
                autoFocus
                fullWidth
                label="Valor"
                type={
                  parameter.type === 'DATE' && /^\d{4}-\d{2}-\d{2}$/.test(parameter.value)
                    ? 'date'
                    : 'text'
                }
                multiline={parameter.type === 'JSON'}
                minRows={parameter.type === 'JSON' ? 4 : undefined}
                slotProps={{
                  htmlInput: parameter.type === 'NUMBER' ? { inputMode: 'decimal' } : undefined,
                  inputLabel: parameter.type === 'DATE' ? { shrink: true } : undefined,
                }}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? helperFor(parameter)}
              />
            )
          }
        />
        {error ? (
          <Alert severity="error">
            {error.message}
            {error.issues.length > 0 ? ` ${error.issues.join(' ')}` : null}
          </Alert>
        ) : null}
      </Stack>
    </AdminDialog>
  );
}
