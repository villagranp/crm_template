import type { ChipProps } from '@mui/material';

import type { ApprovalStatus } from './approvals.api';

/** Etiqueta y color semántico de cada estado (sólo estado, nunca marca: ADR-017). */
export const APPROVAL_STATUS_VIEW: Readonly<Record<ApprovalStatus, { label: string; color: ChipProps['color'] }>> = {
  PENDING: { label: 'Pendiente', color: 'warning' },
  APPROVED: { label: 'Aprobada', color: 'success' },
  REJECTED: { label: 'Rechazada', color: 'error' },
  CANCELLED: { label: 'Cancelada', color: 'default' },
};

const DATE_TIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}
