import { MenuItem, Stack, TextField, Typography } from '@mui/material';

import type { StructuredEditorProps } from './editor-props';
import { DUPLICATE_ACTION_LABELS, DUPLICATE_RULE_FIELDS, parseJsonObject } from './editor-metadata';

const NO_RULE = '';

export interface DuplicateRulesEditorProps extends StructuredEditorProps {
  /** Clave del parámetro: fija los campos y las acciones admitidas. */
  parameterKey: string;
}

/**
 * Reglas de duplicidad de clientes y contactos (editor `duplicate-rules`): una
 * acción por campo. El NIT sólo admite «Avisar» o «No comprobar» (DM-4) y el
 * correo de un contacto siempre bloquea.
 */
export function DuplicateRulesEditor({
  value,
  onChange,
  disabled,
  parameterKey,
}: DuplicateRulesEditorProps) {
  const parsed = parseJsonObject(value) ?? {};
  const fields = DUPLICATE_RULE_FIELDS[parameterKey] ?? [];

  const change = (field: string, action: string) => {
    const next = { ...parsed };
    if (action === NO_RULE) {
      delete next[field];
    } else {
      next[field] = action;
    }
    onChange(JSON.stringify(next));
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Qué hacer cuando un registro nuevo coincide con otro en cada campo.
      </Typography>
      {fields.map(({ key, label, actions }) => {
        const current = typeof parsed[key] === 'string' ? parsed[key] : NO_RULE;
        return (
          <TextField
            key={key}
            select
            label={label}
            value={current}
            onChange={(event) => change(key, event.target.value)}
            disabled={disabled}
            fullWidth
          >
            <MenuItem value={NO_RULE}>Sin regla</MenuItem>
            {current !== NO_RULE && !actions.includes(current) ? (
              <MenuItem value={current}>{current} (no admitido)</MenuItem>
            ) : null}
            {actions.map((action) => (
              <MenuItem key={action} value={action}>
                {DUPLICATE_ACTION_LABELS[action] ?? action}
              </MenuItem>
            ))}
          </TextField>
        );
      })}
    </Stack>
  );
}
