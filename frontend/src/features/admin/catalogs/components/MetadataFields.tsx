import {
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import {
  metadataFieldLabel,
  metadataValueLabel,
  type MetadataDraft,
  type MetadataDraftValue,
} from '../catalog-metadata';
import type { CatalogMetadataField } from '../catalogs.api';

export interface MetadataFieldsProps {
  schema: readonly CatalogMetadataField[];
  value: MetadataDraft;
  errors: Record<string, string>;
  disabled: boolean;
  /** Prefijo de los nombres accesibles ("Nuevo elemento: ", "Elemento X: "). */
  idPrefix: string;
  lockedNote?: string;
  onChange: (key: string, value: MetadataDraftValue) => void;
}

function rangeHint(field: CatalogMetadataField): string | undefined {
  if (field.min !== undefined && field.max !== undefined) {
    return `Entre ${field.min} y ${field.max}.`;
  }
  return undefined;
}

/**
 * Un control por clave de `metadataSchema` (07 E.3): casilla para booleanos,
 * número para `order`/`rank`/`weight`/`defaultProgress`, selector para `enum`
 * (`outcome`), casillas para `enum[]` (`appliesTo`) y lista libre para
 * `string[]` (`fields`).
 */
export function MetadataFields({
  schema,
  value,
  errors,
  disabled,
  idPrefix,
  lockedNote,
  onChange,
}: MetadataFieldsProps) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="caption" color="text.secondary" sx={{ mb: 1 }}>
        {lockedNote ?? 'Datos que usa el CRM para este valor.'}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        {schema.map((field) => {
          const label = metadataFieldLabel(field.key);
          const accessible = `${idPrefix}${label}`;
          const error = errors[field.key];
          const current = value[field.key];

          if (field.type === 'boolean') {
            return (
              <FormControl key={field.key} error={Boolean(error)}>
                <FormControlLabel
                  label={label}
                  disabled={disabled}
                  control={
                    <Checkbox
                      checked={current === true}
                      onChange={(event) => onChange(field.key, event.target.checked)}
                      inputProps={{ 'aria-label': accessible }}
                    />
                  }
                />
                {error ? <FormHelperText>{error}</FormHelperText> : null}
              </FormControl>
            );
          }

          if (field.type === 'enum') {
            return (
              <TextField
                key={field.key}
                select
                size="small"
                label={label}
                required={field.required}
                value={typeof current === 'string' ? current : ''}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={disabled}
                error={Boolean(error)}
                helperText={error}
              >
                {field.required ? null : <MenuItem value="">Sin valor</MenuItem>}
                {(field.values ?? []).map((option) => (
                  <MenuItem key={option} value={option}>
                    {metadataValueLabel(option)}
                  </MenuItem>
                ))}
              </TextField>
            );
          }

          if (field.type === 'enum[]') {
            const selected = Array.isArray(current) ? current : [];
            return (
              <FormControl key={field.key} component="fieldset" error={Boolean(error)} disabled={disabled}>
                <FormLabel component="legend" required={field.required}>
                  {label}
                </FormLabel>
                <FormGroup row aria-label={accessible}>
                  {(field.values ?? []).map((option) => (
                    <FormControlLabel
                      key={option}
                      label={metadataValueLabel(option)}
                      control={
                        <Checkbox
                          checked={selected.includes(option)}
                          onChange={(event) =>
                            onChange(
                              field.key,
                              event.target.checked
                                ? [...selected, option]
                                : selected.filter((item) => item !== option),
                            )
                          }
                        />
                      }
                    />
                  ))}
                </FormGroup>
                {error ? <FormHelperText>{error}</FormHelperText> : null}
              </FormControl>
            );
          }

          if (field.type === 'string[]') {
            const selected = Array.isArray(current) ? current : [];
            return (
              <Autocomplete
                key={field.key}
                multiple
                freeSolo
                size="small"
                options={[]}
                value={selected}
                disabled={disabled}
                onChange={(_, next) =>
                  onChange(
                    field.key,
                    [...new Set(next.map((item) => item.trim()).filter(Boolean))],
                  )
                }
                renderTags={(tags, getTagProps) =>
                  tags.map((tag, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return <Chip key={key} size="small" label={tag} {...tagProps} />;
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={label}
                    error={Boolean(error)}
                    helperText={error ?? 'Escribe el nombre del campo y pulsa Intro.'}
                    inputProps={{ ...params.inputProps, 'aria-label': accessible }}
                  />
                )}
              />
            );
          }

          return (
            <TextField
              key={field.key}
              size="small"
              label={label}
              type={field.type === 'number' ? 'number' : 'text'}
              required={field.required}
              value={typeof current === 'string' ? current : ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              disabled={disabled}
              error={Boolean(error)}
              helperText={error ?? rangeHint(field)}
              slotProps={{
                htmlInput: {
                  'aria-label': accessible,
                  min: field.min,
                  max: field.max,
                  step: field.integer ? 1 : 'any',
                },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
