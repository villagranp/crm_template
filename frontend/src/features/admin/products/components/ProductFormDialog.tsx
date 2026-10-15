import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, MenuItem, TextField } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  AdminDialog,
  describeApiError,
  DialogFooter,
  FormSection,
  FullRow,
} from '@/features/admin/common';

import type { Product } from '../products.api';
import { PRODUCT_FORM_ERRORS } from '../products.errors';
import { useFamilyOptions, useSaveProduct, useUnitOptions } from '../products.queries';
import { productFormSchema, type ProductFormValues } from '../products.schemas';

export interface ProductFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  product: Product | null;
  onClose: () => void;
}

function defaults(product: Product | null): ProductFormValues {
  return {
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    familyId: product?.family.id ?? '',
    baseUnitId: product?.baseUnit.id ?? '',
  };
}

/**
 * Alta y edición de un producto (SKU, descripción, familia y unidad base). Las
 * listas ofrecen familias y unidades activas; en la edición se conserva la
 * actual aunque ya no lo esté.
 */
export function ProductFormDialog({ open, product, onClose }: ProductFormDialogProps) {
  const mutation = useSaveProduct();
  const families = useFamilyOptions(open);
  const units = useUnitOptions(open);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaults(product),
  });
  const { reset: resetMutation } = mutation;

  useEffect(() => {
    if (open) {
      reset(defaults(product));
      resetMutation();
    }
  }, [open, product, reset, resetMutation]);

  const familyOptions = [...(families.data?.data ?? [])];
  if (product && !familyOptions.some((family) => family.id === product.family.id)) {
    familyOptions.unshift({ ...product.family, description: null, isActive: false });
  }
  const unitOptions = (units.data?.data ?? []).map((unit) => ({
    id: unit.id,
    label: `${unit.name} (${unit.symbol})`,
  }));
  if (product && !unitOptions.some((unit) => unit.id === product.baseUnit.id)) {
    unitOptions.unshift({
      id: product.baseUnit.id,
      label: `${product.baseUnit.code} (${product.baseUnit.symbol})`,
    });
  }

  const submit = handleSubmit((values) => {
    const common = {
      description: values.description,
      familyId: values.familyId,
      baseUnitId: values.baseUnitId,
    };
    if (product) {
      // El SKU sólo viaja si cambia.
      const body = values.sku === product.sku ? common : { ...common, sku: values.sku };
      mutation.mutate({ id: product.id, body }, { onSuccess: onClose });
    } else {
      mutation.mutate({ id: null, body: { ...common, sku: values.sku } }, { onSuccess: onClose });
    }
  });

  const pending = mutation.isPending;
  const optionsError = families.isError || units.isError;
  const error = mutation.isError
    ? describeApiError(mutation.error, PRODUCT_FORM_ERRORS.product)
    : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={product ? `Editar producto ${product.sku}` : 'Nuevo producto'}
      subtitle="Productos y unidades"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={product ? 'Guardar cambios' : 'Crear producto'}
          pending={pending}
        />
      }
    >
      <FormSection number={1} title="Datos del producto">
        <TextField
          {...register('sku')}
          label="SKU"
          required
          disabled={pending}
          error={Boolean(errors.sku)}
          helperText={errors.sku?.message ?? 'Código de material. Único.'}
        />
        <Controller
          name="familyId"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              label="Familia"
              required
              disabled={pending || families.isPending}
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ?? (families.isPending ? 'Cargando familias…' : undefined)
              }
            >
              {familyOptions.map((family) => (
                <MenuItem key={family.id} value={family.id}>
                  {family.isActive ? family.name : `${family.name} (inactiva)`}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="baseUnitId"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              label="Unidad base"
              required
              disabled={pending || units.isPending}
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ?? (units.isPending ? 'Cargando unidades…' : undefined)
              }
            >
              {unitOptions.map((unit) => (
                <MenuItem key={unit.id} value={unit.id}>
                  {unit.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            required
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
        </FullRow>
      </FormSection>
      {optionsError ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          No se pudieron cargar las familias o las unidades. Cierra y vuelve a intentarlo.
        </Alert>
      ) : null}
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
