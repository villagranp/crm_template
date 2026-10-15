import { Chip } from '@mui/material';

/** Estado activo/inactivo: color más texto (el color nunca es el único indicador). */
export function ActiveChip({ isActive }: { isActive: boolean }) {
  return (
    <Chip
      size="small"
      color={isActive ? 'success' : 'default'}
      label={isActive ? 'Activo' : 'Inactivo'}
    />
  );
}
