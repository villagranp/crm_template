import { Alert, Box, Button, ButtonBase, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { formatCount, type ReportTone } from './report-format';

/**
 * Tarjetas de resumen de un reporte (05 E.1): un conteo o total por tarjeta encima de la
 * tabla. Una tarjeta con `filterValue` es un **botón** que aplica ese filtro de estado a la
 * tabla (`aria-pressed` si está aplicado; pulsarlo de nuevo lo quita); sin él es informativa.
 * Carga, error con "Reintentar" y referencia, y cifras con `es-GT`.
 */

export interface SummaryCardItem {
  /** Identificador estable (también sirve de selector en pruebas: `data-summary`). */
  key: string;
  label: string;
  /** Conteo (se formatea) o texto ya formateado (p. ej. un importe en USD). */
  value: number | string;
  /** Texto secundario (p. ej. "de las cuales parciales: 2"). */
  detail?: ReactNode;
  /** Tono del borde (siempre con texto: el color nunca es el único indicador). */
  tone?: ReportTone;
  /** Valor del filtro que aplica; sin él, la tarjeta no es pulsable. */
  filterValue?: string;
}

export interface SummaryCardsProps {
  /** Nombre accesible del grupo (p. ej. "Resumen de visitas"). */
  label: string;
  items: readonly SummaryCardItem[];
  /** Filtro de estado aplicado (para `aria-pressed`). */
  activeValue?: string;
  /** Aplica (`value`) o quita (`undefined`) el filtro de una tarjeta. */
  onSelect?: (value: string | undefined) => void;
  isLoading?: boolean;
  /** Mensaje ya traducido y con referencia; con él se pinta el error. */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Línea informativa bajo las tarjetas (p. ej. "Reprogramadas: 3 visitas (5 reprogramaciones)"). */
  footer?: ReactNode;
  /** Columnas desde `md` (por defecto, tantas como tarjetas hasta 5). */
  columns?: number;
}

const SKELETON_CARDS = 4;
const MAX_COLUMNS = 5;

function toneBorder(tone: ReportTone | undefined): string {
  switch (tone) {
    case 'info':
      return 'info.main';
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
    case 'error':
      return 'error.main';
    default:
      return 'divider';
  }
}

export function SummaryCards({ label, items, activeValue, onSelect, isLoading = false, errorMessage, onRetry, footer, columns }: SummaryCardsProps) {
  const columnCount = columns ?? Math.min(Math.max(items.length, 1), MAX_COLUMNS);

  if (errorMessage) {
    return (
      <Alert
        severity="error"
        role="alert"
        aria-label={label}
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Reintentar
            </Button>
          ) : undefined
        }
      >
        {`No se pudo cargar el resumen. ${errorMessage}`}
      </Alert>
    );
  }

  return (
    <Box component="section" aria-label={label}>
      <Box
        aria-busy={isLoading}
        sx={{
          display: 'grid',
          gap: { xs: 1.5, md: 2 },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: `repeat(${columnCount}, minmax(0, 1fr))` },
        }}
      >
        {isLoading
          ? Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <Paper key={index} sx={{ p: 2, boxShadow: 1 }}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" sx={{ typography: 'h4' }} width="40%" />
              </Paper>
            ))
          : items.map((item) => <SummaryCard key={item.key} item={item} active={item.filterValue !== undefined && item.filterValue === activeValue} onSelect={onSelect} />)}
      </Box>
      {footer && !isLoading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {footer}
        </Typography>
      ) : null}
    </Box>
  );
}

function SummaryCard({ item, active, onSelect }: { item: SummaryCardItem; active: boolean; onSelect?: (value: string | undefined) => void }) {
  const content = (
    <Stack spacing={0.5} sx={{ p: 2, width: '100%', textAlign: 'left', minWidth: 0 }}>
      <Typography variant="overline" component="span" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {item.label}
      </Typography>
      <Typography variant="h4" component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {typeof item.value === 'number' ? formatCount(item.value) : item.value}
      </Typography>
      {item.detail ? (
        <Typography variant="caption" component="span" color="text.secondary">
          {item.detail}
        </Typography>
      ) : null}
    </Stack>
  );

  const surface = {
    boxShadow: 1,
    borderLeft: 4,
    borderColor: active ? 'primary.main' : toneBorder(item.tone),
    bgcolor: active ? 'action.selected' : 'background.paper',
    overflow: 'hidden',
  } as const;

  if (item.filterValue === undefined || !onSelect) {
    return (
      <Paper data-summary={item.key} sx={surface}>
        {content}
      </Paper>
    );
  }
  return (
    <Paper data-summary={item.key} sx={surface}>
      <ButtonBase
        aria-pressed={active}
        aria-label={`${item.label}: ${typeof item.value === 'number' ? formatCount(item.value) : item.value}. ${active ? 'Quitar el filtro' : 'Filtrar la tabla'}`}
        onClick={() => onSelect(active ? undefined : item.filterValue)}
        sx={{ width: '100%', height: '100%', alignItems: 'stretch', minHeight: (theme) => theme.spacing(5.5) }}
      >
        {content}
      </ButtonBase>
    </Paper>
  );
}
