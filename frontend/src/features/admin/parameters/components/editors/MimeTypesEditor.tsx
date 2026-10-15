import { Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel } from '@mui/material';

import type { StructuredEditorProps } from './editor-props';
import { MIME_TYPE_LABELS, parseStringArray } from './editor-metadata';

export interface MimeTypesEditorProps extends StructuredEditorProps {
  /** Tipos admitidos (`allowedValues` del parámetro). */
  allowedValues: readonly string[];
}

/** `crm.adjuntos.tipos_permitidos` (editor `mime-types`): casillas sobre los tipos admitidos. */
export function MimeTypesEditor({
  value,
  onChange,
  disabled,
  allowedValues,
}: MimeTypesEditorProps) {
  const selected = new Set(parseStringArray(value) ?? []);

  const toggle = (type: string, checked: boolean) => {
    if (checked) {
      selected.add(type);
    } else {
      selected.delete(type);
    }
    onChange(JSON.stringify(allowedValues.filter((candidate) => selected.has(candidate))));
  };

  return (
    <FormControl component="fieldset" disabled={disabled}>
      <FormLabel component="legend">Tipos de archivo permitidos</FormLabel>
      <FormGroup>
        {allowedValues.map((type) => (
          <FormControlLabel
            key={type}
            control={
              <Checkbox
                checked={selected.has(type)}
                onChange={(event) => toggle(type, event.target.checked)}
              />
            }
            label={MIME_TYPE_LABELS[type] ?? type}
          />
        ))}
      </FormGroup>
    </FormControl>
  );
}
