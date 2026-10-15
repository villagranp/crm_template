import { InputAdornment, Stack, TextField, Typography } from '@mui/material';

import { useCatalogOptions } from '../../parameters.queries';
import type { CatalogEditorProps } from './editor-props';
import { parseJsonObject, PHASE_CATALOG } from './editor-metadata';

/** Hasta 3 dígitos: el porcentaje va de 0 a 100 (el esquema lo valida). */
const PERCENT_INPUT = /^\d{0,3}$/;

function minimumOf(rule: unknown): number | undefined {
  if (rule !== null && typeof rule === 'object' && 'progresoMinimo' in rule) {
    const { progresoMinimo } = rule as { progresoMinimo: unknown };
    return typeof progresoMinimo === 'number' ? progresoMinimo : undefined;
  }
  return undefined;
}

/**
 * `crm.proyectos.reglas_avance` (editor `progress-rules`): avance mínimo (0–100 %)
 * por fase de `crm.fase_cliente`. Vacío = la fase no tiene regla.
 */
export function ProgressRulesEditor({
  value,
  onChange,
  disabled,
  catalogsEnabled,
}: CatalogEditorProps) {
  const parsed = parseJsonObject(value) ?? {};
  const options = useCatalogOptions(PHASE_CATALOG, catalogsEnabled);
  const labels = new Map((options.data ?? []).map((option) => [option.code, option.label]));
  const phases = [
    ...new Set([...(options.data ?? []).map((option) => option.code), ...Object.keys(parsed)]),
  ];

  const change = (phase: string, raw: string) => {
    if (!PERCENT_INPUT.test(raw)) {
      return;
    }
    const next = { ...parsed };
    if (raw === '') {
      delete next[phase];
    } else {
      next[phase] = { progresoMinimo: Number(raw) };
    }
    onChange(JSON.stringify(next));
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Avance mínimo que debe tener un proyecto para entrar en cada fase. Déjalo vacío si la fase
        no tiene regla.
      </Typography>
      {phases.map((phase) => {
        const minimum = minimumOf(parsed[phase]);
        const outOfRange = minimum !== undefined && (minimum < 0 || minimum > 100);
        return (
          <TextField
            key={phase}
            label={labels.has(phase) ? `${labels.get(phase)} (${phase})` : phase}
            value={minimum === undefined ? '' : String(minimum)}
            onChange={(event) => change(phase, event.target.value.trim())}
            disabled={disabled}
            error={outOfRange}
            helperText={outOfRange ? 'Debe estar entre 0 y 100.' : undefined}
            slotProps={{
              htmlInput: { inputMode: 'numeric' },
              input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
            }}
            fullWidth
          />
        );
      })}
    </Stack>
  );
}
