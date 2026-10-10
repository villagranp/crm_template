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

import type { Catalog } from '../catalogs.api';
import { useCreateCatalog, useUpdateCatalog } from '../catalogs.queries';
import { catalogFormSchema, type CatalogFormValues } from '../catalogs.schemas';
import { CATALOG_FORM_ERRORS } from '../catalogs.errors';

export interface CatalogFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  catalog: Catalog | null;
  onClose: () => void;
}

function defaults(catalog: Catalog | null): CatalogFormValues {
  return {
    key: catalog?.key ?? '',
    name: catalog?.name ?? '',
    description: catalog?.description ?? '',
  };
}

/** Alta y edición de un catálogo. En los de sistema la clave es de sólo lectura. */
export function CatalogFormDialog({ open, catalog, onClose }: CatalogFormDialogProps) {
  const createMutation = useCreateCatalog();
  const updateMutation = useUpdateCatalog();
  const mutation = catalog ? updateMutation : createMutation;
  const keyLocked = Boolean(catalog?.isSystem);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CatalogFormValues>({
    resolver: zodResolver(catalogFormSchema),
    defaultValues: defaults(catalog),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(catalog));
      createMutation.reset();
      updateMutation.reset();
    }
    // Las mutaciones se reinician sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalog, reset]);

  const submit = handleSubmit((values) => {
    const body = { name: values.name, description: values.description || null };
    if (catalog) {
      updateMutation.mutate(
        { catalogId: catalog.id, body: keyLocked ? body : { ...body, key: values.key } },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate({ ...body, key: values.key }, { onSuccess: onClose });
    }
  });

  const error = mutation.isError ? describeApiError(mutation.error, CATALOG_FORM_ERRORS) : null;
  const isPending = mutation.isPending;

  return (
    <AdminDialog
      open={open}
      onClose={isPending ? undefined : onClose}
      title={catalog ? `Editar catálogo ${catalog.name}` : 'Nuevo catálogo'}
      subtitle="Catálogos"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={catalog ? 'Guardar cambios' : 'Crear catálogo'}
          pending={isPending}
        />
      }
    >
      <FormSection number={1} title="Datos generales">
        <TextField
          {...register('key')}
          label="Clave"
          required
          disabled={keyLocked || isPending}
          error={Boolean(errors.key)}
          helperText={
            errors.key?.message ??
            (keyLocked
              ? 'Catálogo del sistema: la clave no se puede cambiar.'
              : 'Única. La usa el código para encontrarlo.')
          }
        />
        <TextField
          {...register('name')}
          label="Nombre"
          required
          disabled={isPending}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
        />
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
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
