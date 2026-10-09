import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';

import { describeApiError } from '@/features/admin/common';

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
  return { key: catalog?.key ?? '', name: catalog?.name ?? '', description: catalog?.description ?? '' };
}

/** Alta y edición de un catálogo. En los de sistema la clave es de sólo lectura. */
export function CatalogFormDialog({ open, catalog, onClose }: CatalogFormDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const createMutation = useCreateCatalog();
  const updateMutation = useUpdateCatalog();
  const mutation = catalog ? updateMutation : createMutation;
  const keyLocked = Boolean(catalog?.isSystem);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CatalogFormValues>({ resolver: zodResolver(catalogFormSchema), defaultValues: defaults(catalog) });

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
    <Dialog
      open={open}
      onClose={isPending ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      PaperProps={{
        component: 'form',
        noValidate: true,
        onSubmit: (event: FormEvent<HTMLFormElement>) => {
          void submit(event);
        },
      }}
    >
      <DialogTitle id={titleId}>{catalog ? `Editar catálogo ${catalog.name}` : 'Nuevo catálogo'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            {...register('key')}
            label="Clave"
            required
            disabled={keyLocked || isPending}
            error={Boolean(errors.key)}
            helperText={
              errors.key?.message ??
              (keyLocked ? 'Catálogo del sistema: la clave no se puede cambiar.' : 'Única. La usa el código para encontrarlo.')
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
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
          {error ? <Alert severity="error">{error.message}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {catalog ? 'Guardar cambios' : 'Crear catálogo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
