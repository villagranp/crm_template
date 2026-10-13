import { MenuItem, TextField } from '@mui/material';

import { usePermission } from '@/hooks/use-permission';

import { COMMERCIAL_RELATED_PERMISSIONS } from './commercial-activity.permissions';
import { useCountryOptions } from './commercial-activity.queries';

export interface CountrySelectProps {
  /** Id del país elegido; `''` = todos. */
  value: string;
  onChange: (countryId: string) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Filtro "país del cliente" (04 §E.2, §E.4, §E.6). Los países salen de
 * `GET /customers/form-options` (02 F2, 04 §F.7), que exige `clientes.ver`: sin
 * ese permiso el filtro no se ofrece (no se inventa la lista). Si la carga
 * falla, el campo queda deshabilitado con su explicación y el resto de filtros
 * sigue funcionando.
 */
export function CountrySelect({ value, onChange, label = 'País', disabled = false }: CountrySelectProps) {
  const canListCountries = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const countries = useCountryOptions(canListCountries);

  if (!canListCountries) {
    return null;
  }

  const items = countries.data ?? [];
  // Un país de la URL que aún no llegó (o ya no está activo) se conserva como opción.
  const known = value === '' || items.some((country) => country.id === value);

  return (
    <TextField
      select
      size="small"
      label={label}
      value={countries.isSuccess || value === '' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || !countries.isSuccess}
      error={countries.isError}
      helperText={countries.isError ? 'No se pudieron cargar los países.' : undefined}
    >
      <MenuItem value="">Todos</MenuItem>
      {known ? null : <MenuItem value={value}>País seleccionado</MenuItem>}
      {items.map((country) => (
        <MenuItem key={country.id} value={country.id}>
          {country.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
