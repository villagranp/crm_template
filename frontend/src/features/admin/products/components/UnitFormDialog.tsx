import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, MenuItem, TextField } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { AdminDialog, describeApiError, DialogFooter, FormSection } from '@/features/admin/common';

import { UNIT_DIMENSIONS, type UnitOfMeasure } from '../products.api';
import { DIMENSION_LABELS } from '../products-format';
import { PRODUCT_FORM_ERRORS } from '../products.errors';
import { useSaveUnit } from '../products.queries';
import { toSortOrder, unitFormSchema, type UnitFormValues } from '../products.schemas';

export interface UnitFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  unit: UnitOfMeasure | null;
  onClose: () => void;
}

function defaults(unit: UnitOfMeasure | null): UnitFormValues {
  return {
    code: unit?.code ?? '',
    name: unit?.name ?? '',
    symbol: unit?.symbol ?? '',
    dimension: unit?.dimension ?? 'MASS',
    sortOrder: unit?.sortOrder === undefined ? '' : String(unit.sortOrder),
  };
}

/**
 * Alta y edición de una unidad de medida. El código es inmutable (RN-07.37); la
 * dimensión sólo cambia mientras ningún producto, regla o línea la use: si ya
 * se usa, el servidor responde `409 UNIT_DIMENSION_LOCKED` y se explica.
 */
export function UnitFormDialog({ open, unit, onClose }: UnitFormDialogProps) {
  const mutation = useSaveUnit();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: defaults(unit),
  });
  const { reset: resetMutation } = mutation;

  useEffect(() => {
    if (open) {
      reset(defaults(unit));
      resetMutation();
    }
  }, [open, unit, reset, resetMutation]);

  const submit = handleSubmit((values) => {
    const common = {
      name: values.name,
      symbol: values.symbol,
      sortOrder: toSortOrder(values.sortOrder),
    };
    if (unit) {
      // La dimensión sólo viaja si cambia: así un cambio de nombre no choca con el bloqueo de dimensión.
      const body =
        values.dimension === unit.dimension ? common : { ...common, dimension: values.dimension };
      mutation.mutate({ id: unit.id, body }, { onSuccess: onClose });
    } else {
      mutation.mutate(
        { id: null, body: { ...common, code: values.code, dimension: values.dimension } },
        { onSuccess: onClose },
      );
    }
  });

  const pending = mutation.isPending;
  const error = mutation.isError
    ? describeApiError(mutation.error, PRODUCT_FORM_ERRORS.unit)
    : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={unit ? `Editar unidad ${unit.name}` : 'Nueva unidad'}
      subtitle="Productos y unidades"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={unit ? 'Guardar cambios' : 'Crear unidad'}
          pending={pending}
        />
      }
    >
      <FormSection number={1} title="Datos de la unidad">
        <TextField
          {...register('code')}
          label="Código"
          required
          disabled={Boolean(unit) || pending}
          error={Boolean(errors.code)}
          helperText={
            errors.code?.message ??
            (unit ? 'El código no se puede cambiar.' : 'Único, p. ej. TON o M2.')
          }
        />
        <TextField
          {...register('name')}
          label="Nombre"
          required
          disabled={pending}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
        />
        <TextField
          {...register('symbol')}
          label="Símbolo"
          required
          disabled={pending}
          error={Boolean(errors.symbol)}
          helperText={errors.symbol?.message}
        />
        <Controller
          name="dimension"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              label="Dimensión"
              required
              disabled={pending}
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ??
                (unit ? 'Sólo se puede cambiar si la unidad aún no se usa.' : undefined)
              }
            >
              {UNIT_DIMENSIONS.map((dimension) => (
                <MenuItem key={dimension} value={dimension}>
                  {DIMENSION_LABELS[dimension]}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <TextField
          {...register('sortOrder')}
          label="Orden"
          disabled={pending}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          error={Boolean(errors.sortOrder)}
          helperText={errors.sortOrder?.message ?? 'Posición en las listas (opcional).'}
        />
      </FormSection>
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
          {error.code === 'VALIDATION_FAILED' && error.issues.length > 0
            ? ` ${error.issues.join(' ')}`
            : null}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
