import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { buildMetadata, toMetadataDraft, type MetadataDraft } from '../catalog-metadata';
import type { CatalogItem, CatalogMetadataField } from '../catalogs.api';
import { formatMetadata, itemFormSchema, parseMetadata, type ItemFormValues } from '../catalogs.schemas';

import { MetadataFields } from './MetadataFields';

export interface CatalogItemFormSubmit {
  code: string;
  label: string;
  metadata: Record<string, unknown> | null;
}

export interface CatalogItemFormProps {
  /** `null` = alta. En edición, el código es de sólo lectura (inmutable). */
  item: CatalogItem | null;
  /**
   * Esquema de `metadata` del catálogo (07 F.4). Con esquema se pinta un
   * formulario; `null` conserva el editor JSON (catálogos sin semántica).
   */
  metadataSchema?: CatalogMetadataField[] | null;
  /** Conjunto cerrado: el `metadata` no cambia (07 RN-07.25); sólo etiqueta (y orden). */
  metadataLocked?: boolean;
  isPending: boolean;
  /** Debe rechazar si el guardado falla: así el formulario conserva lo escrito. El error lo pinta el padre. */
  onSubmit: (values: CatalogItemFormSubmit) => Promise<unknown>;
  onCancel?: () => void;
}

/**
 * Formulario en línea de un elemento: código (sólo en el alta), etiqueta y
 * datos de semántica. Con `metadataSchema`, un control por clave; sin él,
 * `metadata` en JSON.
 */
export function CatalogItemForm({
  item,
  metadataSchema = null,
  metadataLocked = false,
  isPending,
  onSubmit,
  onCancel,
}: CatalogItemFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      code: item?.code ?? '',
      label: item?.label ?? '',
      metadata: metadataSchema ? '' : formatMetadata(item?.metadata ?? null),
    },
  });
  const [draft, setDraft] = useState<MetadataDraft>(() =>
    metadataSchema ? toMetadataDraft(metadataSchema, item?.metadata ?? null) : {},
  );
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});

  const submit = handleSubmit(async (values) => {
    let metadata: Record<string, unknown> | null;
    if (metadataSchema) {
      const built = buildMetadata(metadataSchema, draft);
      setMetadataErrors(built.errors);
      if (Object.keys(built.errors).length > 0) {
        return;
      }
      metadata = built.metadata;
    } else {
      metadata = parseMetadata(values.metadata) ?? null;
    }
    try {
      await onSubmit({ code: values.code, label: values.label, metadata });
      if (!item) {
        reset({ code: '', label: '', metadata: '' });
        setDraft(metadataSchema ? toMetadataDraft(metadataSchema, null) : {});
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
      spacing={1.5}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'flex-start' } }}>
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
        {metadataSchema === null ? (
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
        ) : null}
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
      {metadataSchema && metadataSchema.length > 0 ? (
        <Box>
          <MetadataFields
            schema={metadataSchema}
            value={draft}
            errors={metadataErrors}
            disabled={isPending || metadataLocked}
            idPrefix={prefix}
            lockedNote={
              metadataLocked
                ? 'Conjunto cerrado: estos datos no se pueden cambiar.'
                : undefined
            }
            onChange={(key, next) => {
              setDraft((current) => ({ ...current, [key]: next }));
              setMetadataErrors((current) => {
                if (!(key in current)) {
                  return current;
                }
                const rest = { ...current };
                delete rest[key];
                return rest;
              });
            }}
          />
        </Box>
      ) : null}
    </Stack>
  );
}
