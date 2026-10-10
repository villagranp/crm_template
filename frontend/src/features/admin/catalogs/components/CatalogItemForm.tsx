import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import { useForm } from 'react-hook-form';

import type { CatalogItem } from '../catalogs.api';
import { formatMetadata, itemFormSchema, parseMetadata, type ItemFormValues } from '../catalogs.schemas';

export interface CatalogItemFormSubmit {
  code: string;
  label: string;
  metadata: Record<string, unknown> | null;
}

export interface CatalogItemFormProps {
  /** `null` = alta. En edición, el código es de sólo lectura (inmutable). */
  item: CatalogItem | null;
  isPending: boolean;
  /** Debe rechazar si el guardado falla: así el formulario conserva lo escrito. El error lo pinta el padre. */
  onSubmit: (values: CatalogItemFormSubmit) => Promise<unknown>;
  onCancel?: () => void;
}

/** Formulario en línea de un elemento: código (sólo en el alta), etiqueta y datos extra en JSON. */
export function CatalogItemForm({ item, isPending, onSubmit, onCancel }: CatalogItemFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { code: item?.code ?? '', label: item?.label ?? '', metadata: formatMetadata(item?.metadata ?? null) },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({ code: values.code, label: values.label, metadata: parseMetadata(values.metadata) ?? null });
      if (!item) {
        reset({ code: '', label: '', metadata: '' });
      }
    } catch {
      // El padre muestra el error de la mutación; se conserva lo escrito.
    }
  });

  const prefix = item ? `Elemento ${item.code}: ` : 'Nuevo elemento: ';

  return (
    <Stack
      component="form"
      noValidate
      aria-label={item ? `Editar elemento ${item.code}` : 'Añadir elemento'}
      onSubmit={(event) => {
        event.stopPropagation();
        void submit(event);
      }}
      direction={{ xs: 'column', md: 'row' }}
      spacing={1}
      sx={{ alignItems: { md: 'flex-start' } }}
    >
      <TextField
        {...register('code')}
        size="small"
        label="Código"
        inputProps={{ 'aria-label': `${prefix}código` }}
        disabled={Boolean(item) || isPending}
        error={Boolean(errors.code)}
        helperText={errors.code?.message}
      />
      <TextField
        {...register('label')}
        size="small"
        label="Etiqueta"
        inputProps={{ 'aria-label': `${prefix}etiqueta` }}
        disabled={isPending}
        error={Boolean(errors.label)}
        helperText={errors.label?.message}
        sx={{ flex: 1 }}
      />
      <TextField
        {...register('metadata')}
        size="small"
        label="Datos extra (JSON)"
        inputProps={{ 'aria-label': `${prefix}datos extra` }}
        disabled={isPending}
        error={Boolean(errors.metadata)}
        helperText={errors.metadata?.message ?? 'Opcional.'}
        sx={{ flex: 1 }}
      />
      <Stack direction="row" spacing={1}>
        <Button type="submit" size="small" disabled={isPending}>
          {item ? 'Guardar' : 'Añadir'}
        </Button>
        {onCancel ? (
          <Button size="small" variant="text" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
