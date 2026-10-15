import { MenuItem, TextField } from '@mui/material';

import { useCatalogOptions } from '../../parameters.queries';

const EMPTY = '';

export interface CatalogCodeFieldProps {
  label: string;
  catalogKey: string;
  /** Código elegido; `undefined` = sin valor. */
  value: string | undefined;
  onChange: (code: string | undefined) => void;
  /** Ofrece «Sin valor» para quitar la clave. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  catalogsEnabled: boolean;
  disabled?: boolean;
}

/**
 * Código de un catálogo: selector con los elementos activos si se pueden
 * consultar (`catalogos.ver`) y, si no, campo de texto con el código. Un código
 * guardado que ya no está activo se conserva en la lista, marcado.
 */
export function CatalogCodeField({
  label,
  catalogKey,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Sin valor',
  catalogsEnabled,
  disabled,
}: CatalogCodeFieldProps) {
  const options = useCatalogOptions(catalogKey, catalogsEnabled);

  if (!catalogsEnabled || options.isError || options.data === null) {
    return (
      <TextField
        label={label}
        value={value ?? EMPTY}
        onChange={(event) => {
          const code = event.target.value.trim();
          onChange(code ? code : undefined);
        }}
        disabled={disabled}
        helperText={`Código de ${catalogKey}.`}
        fullWidth
      />
    );
  }

  if (options.isPending) {
    return (
      <TextField
        label={label}
        value={value ?? EMPTY}
        disabled
        helperText="Cargando valores…"
        fullWidth
      />
    );
  }

  const items = options.data;
  const missing = value !== undefined && !items.some((item) => item.code === value);

  return (
    <TextField
      select
      label={label}
      value={value ?? EMPTY}
      onChange={(event) => onChange(event.target.value ? event.target.value : undefined)}
      disabled={disabled}
      fullWidth
    >
      {allowEmpty ? <MenuItem value={EMPTY}>{emptyLabel}</MenuItem> : null}
      {missing ? <MenuItem value={value}>{value} (inactivo o inexistente)</MenuItem> : null}
      {items.map((item) => (
        <MenuItem key={item.code} value={item.code}>
          {item.label} ({item.code})
        </MenuItem>
      ))}
    </TextField>
  );
}
