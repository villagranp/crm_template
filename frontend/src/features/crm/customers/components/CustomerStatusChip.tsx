import { Chip } from '@mui/material';

export interface CustomerStatusChipProps {
  label: string;
  /** `false` = el estado desactiva al cliente (RN-02.21): chip atenuado, con su texto. */
  isActive: boolean;
}

/** Chip de estado del cliente: el texto siempre acompaña al color (DESIGN-SYSTEM §7). */
export function CustomerStatusChip({ label, isActive }: CustomerStatusChipProps) {
  return <Chip size="small" label={label} color={isActive ? 'primary' : 'default'} variant={isActive ? 'filled' : 'outlined'} />;
}
