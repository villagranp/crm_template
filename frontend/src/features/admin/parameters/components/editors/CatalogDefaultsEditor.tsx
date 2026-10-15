import { Stack, Typography } from '@mui/material';

import { CatalogCodeField } from './CatalogCodeField';
import type { CatalogEditorProps } from './editor-props';
import { DEFAULT_VALUE_FIELDS, parseJsonObject } from './editor-metadata';

/**
 * `crm.valores_por_defecto` (editor `catalog-defaults`): un selector por campo
 * con los valores activos de su catálogo. «Sin valor por defecto» quita la clave.
 * El backend comprueba que cada código exista y esté activo (AC-07.29).
 */
export function CatalogDefaultsEditor({
  value,
  onChange,
  disabled,
  catalogsEnabled,
}: CatalogEditorProps) {
  const parsed = parseJsonObject(value) ?? {};

  const change = (field: string, code: string | undefined) => {
    const next = { ...parsed };
    if (code === undefined) {
      delete next[field];
    } else {
      next[field] = code;
    }
    onChange(JSON.stringify(next));
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Valor con el que se abre cada formulario. Sólo se ofrecen los valores activos del catálogo.
      </Typography>
      {DEFAULT_VALUE_FIELDS.map(({ field, label, catalogKey }) => (
        <CatalogCodeField
          key={field}
          label={label}
          catalogKey={catalogKey}
          value={typeof parsed[field] === 'string' ? parsed[field] : undefined}
          onChange={(code) => change(field, code)}
          allowEmpty
          emptyLabel="Sin valor por defecto"
          catalogsEnabled={catalogsEnabled}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}
