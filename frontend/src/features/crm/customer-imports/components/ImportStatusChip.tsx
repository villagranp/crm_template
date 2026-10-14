import { Chip } from '@mui/material';

import type { ImportRowStatus, ImportStatus } from '../customer-imports.api';
import {
  IMPORT_ROW_STATUS_LABELS,
  IMPORT_ROW_STATUS_TONES,
  IMPORT_STATUS_LABELS,
  IMPORT_STATUS_TONES,
  type ChipTone,
} from '../customer-imports-format';

function ToneChip({ label, tone }: { label: string; tone: ChipTone }) {
  return <Chip size="small" label={label} color={tone} variant={tone === 'success' || tone === 'error' ? 'filled' : 'outlined'} />;
}

/** Estado de la carga: el texto siempre acompaña al color (DESIGN-SYSTEM §7). */
export function ImportStatusChip({ status }: { status: ImportStatus }) {
  return <ToneChip label={IMPORT_STATUS_LABELS[status] ?? status} tone={IMPORT_STATUS_TONES[status] ?? 'default'} />;
}

/** Estado de una fila de la carga. */
export function ImportRowStatusChip({ status }: { status: ImportRowStatus }) {
  return <ToneChip label={IMPORT_ROW_STATUS_LABELS[status] ?? status} tone={IMPORT_ROW_STATUS_TONES[status] ?? 'default'} />;
}
