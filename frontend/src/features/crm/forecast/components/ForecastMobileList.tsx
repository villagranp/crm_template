import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { formatDateTime, productLabel } from '@/features/crm/projects';

import type { ForecastCell, ForecastRow } from '../forecast.api';
import { periodHeader, rowTotalText } from '../forecast-format';

export interface ForecastMobileListProps {
  rows: readonly ForecastRow[];
  /** Muestra el proyecto en cada tarjeta (no en la sección de la ficha). */
  showProject: boolean;
  renderCell: (row: ForecastRow, cell: ForecastCell, rowIndex: number, columnIndex: number) => ReactNode;
  renderUnit: (row: ForecastRow) => ReactNode;
}

/**
 * Matriz en móvil (< md, 03 §E.8): cada fila pasa a una tarjeta con el
 * proyecto, el producto y la unidad, y la lista de los meses como campos. Las
 * celdas son las mismas que en la tabla (`renderCell`), así que el borrador, la
 * validación y los errores se comparten.
 */
export function ForecastMobileList({ rows, showProject, renderCell, renderUnit }: ForecastMobileListProps) {
  return (
    <Stack spacing={1.5} component="ul" aria-label="Filas del forecast" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((row, rowIndex) => (
        <Card key={`${row.project.id}|${row.product.id}`} variant="outlined" component="li">
          <CardContent>
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              {showProject ? (
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {`${row.project.code} · ${row.project.name}`}
                </Typography>
              ) : null}
              <Typography variant="subtitle2" component="h3" sx={{ overflowWrap: 'anywhere' }}>
                {productLabel(row.product)}
              </Typography>
              <Box>{renderUnit(row)}</Box>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', columnGap: 1.5, rowGap: 1, alignItems: 'start' }}>
              {row.cells.map((cell, columnIndex) => (
                <Box key={`${cell.year}-${cell.month}`} sx={{ display: 'contents' }}>
                  <Typography variant="body2" sx={{ pt: 1 }}>
                    {periodHeader(cell)}
                  </Typography>
                  {renderCell(row, cell, rowIndex, columnIndex)}
                </Box>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
              {`Total fila: ${rowTotalText(row)}${row.lastUpdatedAt ? ` · Actualizado: ${formatDateTime(row.lastUpdatedAt)}` : ''}`}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
