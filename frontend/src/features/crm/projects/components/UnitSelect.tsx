import { MenuItem, TextField, type TextFieldProps } from '@mui/material';

import type { UnitRef } from '../projects.api';

export type UnitSelectProps = Omit<TextFieldProps, 'select' | 'value' | 'onChange' | 'children'> & {
  value: string;
  onChange: (unitId: string) => void;
  /** Unidades activas (`form-options.units` o `/units-of-measure`). */
  units: readonly (UnitRef & { name?: string })[];
  /** Unidad actual del registro, aunque ya no esté activa (se muestra marcada). */
  current?: UnitRef | null;
  /** Ofrece "Sin unidad". */
  allowEmpty?: boolean;
};

function unitText(unit: UnitRef & { name?: string }): string {
  return unit.name ? `${unit.name} (${unit.symbol})` : `${unit.code} (${unit.symbol})`;
}

/** Selector de unidad de medida (03 §E.9). Las unidades salen de la API, nunca de una lista fija. */
export function UnitSelect({ value, onChange, units, current, allowEmpty = false, ...props }: UnitSelectProps) {
  const withCurrent = current && !units.some((unit) => unit.id === current.id) ? [...units, { ...current, inactive: true }] : units;
  return (
    <TextField {...props} select value={value} onChange={(event) => onChange(event.target.value)}>
      {allowEmpty || !value ? <MenuItem value="">{allowEmpty ? 'Sin unidad' : 'Elige una unidad'}</MenuItem> : null}
      {withCurrent.map((unit) => (
        <MenuItem key={unit.id} value={unit.id}>
          {'inactive' in unit ? `${unitText(unit)} (inactiva)` : unitText(unit)}
        </MenuItem>
      ))}
    </TextField>
  );
}
