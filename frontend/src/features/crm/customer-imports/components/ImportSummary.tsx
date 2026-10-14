import { Box, Paper, Typography } from '@mui/material';

import type { CustomerImport } from '../customer-imports.api';
import { formatCount } from '../customer-imports-format';

interface SummaryItem {
  label: string;
  value: number;
  hint?: string;
  tone?: 'success.main' | 'error.main' | 'warning.main';
}

function items(data: CustomerImport): SummaryItem[] {
  const result: SummaryItem[] = [
    { label: 'Total de filas', value: data.totalRows },
    { label: 'Válidas', value: data.validRows },
    { label: 'Con advertencias', value: data.warningRows, tone: data.warningRows > 0 ? 'warning.main' : undefined },
    {
      label: 'Con errores',
      value: data.invalidRows,
      hint: 'Incluye las duplicadas en el archivo y las de clientes existentes',
      tone: data.invalidRows > 0 ? 'error.main' : undefined,
    },
  ];
  if (data.confirmedAt || data.importedRows > 0 || data.rejectedRows > 0) {
    result.push(
      { label: 'Importadas', value: data.importedRows, tone: data.importedRows > 0 ? 'success.main' : undefined },
      { label: 'Rechazadas al confirmar', value: data.rejectedRows, tone: data.rejectedRows > 0 ? 'warning.main' : undefined },
    );
  }
  return result;
}

/**
 * Tarjetas de resumen de la carga (06 §E.4): contadores del servidor. Una
 * columna en móvil, más desde `sm`. El color acompaña, nunca sustituye, al texto.
 */
export function ImportSummary({ data }: { data: CustomerImport }) {
  return (
    <Box
      component="dl"
      aria-label="Resumen de la carga"
      sx={{
        m: 0,
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
      }}
    >
      {items(data).map((item) => (
        <Paper key={item.label} sx={{ px: 2, py: 1.5, boxShadow: 1, minWidth: 0 }}>
          <Typography
            component="dt"
            sx={(theme) => ({ ...theme.typography.overline, fontFamily: theme.typography.fontFamily, color: theme.palette.text.secondary })}
          >
            {item.label}
          </Typography>
          <Typography component="dd" variant="h4" sx={{ m: 0, color: item.tone ?? 'text.primary' }}>
            {formatCount(item.value)}
          </Typography>
          {item.hint ? (
            <Typography variant="caption" color="text.secondary" component="dd" sx={{ m: 0 }}>
              {item.hint}
            </Typography>
          ) : null}
        </Paper>
      ))}
    </Box>
  );
}
