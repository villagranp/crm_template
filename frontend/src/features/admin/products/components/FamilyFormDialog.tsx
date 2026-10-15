import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, TextField } from '@mui/material';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  AdminDialog,
  describeApiError,
  DialogFooter,
  FormSection,
  FullRow,
} from '@/features/admin/common';

import type { ProductFamily } from '../products.api';
import { PRODUCT_FORM_ERRORS } from '../products.errors';
import { useSaveProductFamily } from '../products.queries';
import { familyFormSchema, toSortOrder, type FamilyFormValues } from '../products.schemas';

export interface FamilyFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  family: ProductFamily | null;
  onClose: () => void;
}

function defaults(family: ProductFamily | null): FamilyFormValues {
  return {
    code: family?.code ?? '',
    name: family?.name ?? '',
    description: family?.description ?? '',
    sortOrder: family?.sortOrder === undefined ? '' : String(family.sortOrder),
  };
}

/** Alta y edición de una familia de productos. El código no se cambia una vez creada. */
export function FamilyFormDialog({ open, family, onClose }: FamilyFormDialogProps) {
  const mutation = useSaveProductFamily();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FamilyFormValues>({
    resolver: zodResolver(familyFormSchema),
    defaultValues: defaults(family),
  });
  const { reset: resetMutation } = mutation;

  useEffect(() => {
    if (open) {
      reset(defaults(family));
      resetMutation();
    }
  }, [open, family, reset, resetMutation]);

  const submit = handleSubmit((values) => {
    const common = {
      name: values.name,
      description: values.description || null,
      sortOrder: toSortOrder(values.sortOrder),
    };
    if (family) {
      mutation.mutate({ id: family.id, body: common }, { onSuccess: onClose });
    } else {
      mutation.mutate({ id: null, body: { ...common, code: values.code } }, { onSuccess: onClose });
    }
  });

  const pending = mutation.isPending;
  const error = mutation.isError
    ? describeApiError(mutation.error, PRODUCT_FORM_ERRORS.family)
    : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={family ? `Editar familia ${family.name}` : 'Nueva familia'}
      subtitle="Productos y unidades"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={family ? 'Guardar cambios' : 'Crear familia'}
          pending={pending}
        />
      }
    >
      <FormSection number={1} title="Datos de la familia">
        <TextField
          {...register('code')}
          label="Código"
          required
          disabled={Boolean(family) || pending}
          error={Boolean(errors.code)}
          helperText={
            errors.code?.message ?? (family ? 'El código no se puede cambiar.' : 'Único.')
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
          {...register('sortOrder')}
          label="Orden"
          disabled={pending}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          error={Boolean(errors.sortOrder)}
          helperText={errors.sortOrder?.message ?? 'Posición en las listas (opcional).'}
        />
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={pending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
        </FullRow>
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
