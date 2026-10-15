import { Stack, Typography } from '@mui/material';

import { CatalogCodeField } from './CatalogCodeField';
import type { CatalogEditorProps } from './editor-props';
import { ALERT_TYPES, parseJsonObject, PRIORITY_CATALOG } from './editor-metadata';

/**
 * `crm.alertas.prioridades` (editor `priority-map`): la prioridad de cada tipo
 * de alerta, elegida entre los códigos activos de `crm.prioridad`. Todos los
 * tipos son obligatorios.
 */
export function PriorityMapEditor({
  value,
  onChange,
  disabled,
  catalogsEnabled,
}: CatalogEditorProps) {
  const parsed = parseJsonObject(value) ?? {};

  const change = (alert: string, code: string | undefined) => {
    const next = { ...parsed };
    if (code === undefined) {
      delete next[alert];
    } else {
      next[alert] = code;
    }
    onChange(JSON.stringify(next));
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Prioridad con la que se muestra cada tipo de alerta.
      </Typography>
      {ALERT_TYPES.map(({ code, label }) => (
        <CatalogCodeField
          key={code}
          label={label}
          catalogKey={PRIORITY_CATALOG}
          value={typeof parsed[code] === 'string' ? parsed[code] : undefined}
          onChange={(priority) => change(code, priority)}
          catalogsEnabled={catalogsEnabled}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}
