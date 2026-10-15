import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Stack,
  Typography,
} from '@mui/material';

import type { StructuredEditorProps } from './editor-props';
import { fieldLabel, parseJsonObject, REQUIRED_FIELDS_ENTITIES } from './editor-metadata';

/** Entidades que el backend incluye siempre en el valor guardado. */
const ALWAYS_PRESENT = new Set(['customer', 'project', 'visit', 'activity']);

function selectedOf(value: Record<string, unknown>, entity: string): Set<string> {
  const current = value[entity];
  return new Set(
    Array.isArray(current)
      ? current.filter((item): item is string => typeof item === 'string')
      : [],
  );
}

/**
 * `crm.campos_obligatorios` (editor `required-fields`, RN-07.31): una casilla por
 * campo admitido de cada entidad. Los obligatorios de base aparecen marcados y
 * bloqueados: el backend los añade siempre, aunque el valor no los incluya.
 */
export function RequiredFieldsEditor({ value, onChange, disabled }: StructuredEditorProps) {
  const parsed = parseJsonObject(value) ?? {};

  const toggle = (entity: string, field: string, checked: boolean) => {
    const { base, allowed } = REQUIRED_FIELDS_ENTITIES[entity]!;
    const selected = selectedOf(parsed, entity);
    if (checked) {
      selected.add(field);
    } else {
      selected.delete(field);
    }
    base.forEach((baseField) => selected.add(baseField));
    onChange(
      JSON.stringify({
        ...parsed,
        [entity]: allowed.filter((candidate) => selected.has(candidate)),
      }),
    );
  };

  return (
    <Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary">
        Marca los campos que serán obligatorios además de los de base. Los de base no se pueden
        quitar.
      </Typography>
      {Object.entries(REQUIRED_FIELDS_ENTITIES)
        .filter(([entity]) => ALWAYS_PRESENT.has(entity) || entity in parsed)
        .map(([entity, { label, base, allowed }]) => {
          const selected = selectedOf(parsed, entity);
          return (
            <FormControl key={entity} component="fieldset" disabled={disabled}>
              <FormLabel component="legend">{label}</FormLabel>
              <FormGroup>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                    columnGap: 2,
                  }}
                >
                  {allowed.map((field) => {
                    const isBase = base.includes(field);
                    return (
                      <FormControlLabel
                        key={field}
                        control={
                          <Checkbox
                            checked={isBase || selected.has(field)}
                            disabled={isBase || disabled}
                            onChange={(event) => toggle(entity, field, event.target.checked)}
                          />
                        }
                        label={isBase ? `${fieldLabel(field)} (base)` : fieldLabel(field)}
                      />
                    );
                  })}
                </Box>
              </FormGroup>
            </FormControl>
          );
        })}
    </Stack>
  );
}
