import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Tabla equivalente de una gráfica (05 E.7 "Ver como tabla", AC-05.33): encabezados reales, la
 * primera columna como encabezado de fila y los **mismos** valores que la gráfica, ya
 * formateados. Desplazamiento horizontal sólo dentro de su contenedor (`scroll-x`).
 */
export interface ChartDataTableColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

export interface ChartDataTableRow {
  key: string;
  /** Una celda por columna, en el mismo orden. */
  cells: readonly ReactNode[];
}

export interface ChartDataTableProps {
  /** Nombre accesible (p. ej. "Oportunidades por etapa"); selector estable de las pruebas. */
  label: string;
  columns: readonly ChartDataTableColumn[];
  rows: readonly ChartDataTableRow[];
}

export function ChartDataTable({ label, columns, rows }: ChartDataTableProps) {
  return (
    <TableContainer className="scroll-x">
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align}>
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => {
                const column = columns[index];
                return index === 0 ? (
                  <TableCell key={column?.key ?? index} component="th" scope="row" align={column?.align}>
                    {cell}
                  </TableCell>
                ) : (
                  <TableCell key={column?.key ?? index} align={column?.align}>
                    {cell}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
