import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  useMediaQuery,
  type Breakpoint,
  type Theme,
} from '@mui/material';
import type { ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { PAGE_SIZE_OPTIONS, type SortDirection, type TableSort } from './use-table-query-state';

/**
 * Tabla paginada en el servidor sobre `Table` de MUI (PLAN-ADMIN D14: sin
 * DataGrid).
 *
 * Es presentacional: no consulta nada. La pantalla le pasa la página actual,
 * el total y los callbacks (normalmente los de `useTableQueryState`) y el
 * resultado de su `useQuery`.
 *
 * Mobile first: por debajo de `cardsBelow` (por defecto `sm`) cada fila se
 * pinta como una tarjeta apilada; desde ahí, como tabla, que scrollea en X
 * dentro de su propio contenedor si no cabe (la página nunca lo hace).
 */

export interface DataTableColumn<TRow> {
  /** Identificador estable; si la columna es ordenable, es el valor que se envía en `sortBy`. */
  id: string;
  header: string;
  render: (row: TRow) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  /** En la vista de tarjetas: título de la tarjeta (sólo una columna). */
  primary?: boolean;
  /** En la vista de tarjetas: no se muestra (datos secundarios). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<TRow> {
  /** Nombre accesible de la tabla (p. ej. "Usuarios"). */
  label: string;
  columns: readonly DataTableColumn<TRow>[];
  /** `undefined` mientras no hay datos. */
  rows: readonly TRow[] | undefined;
  getRowId: (row: TRow) => string;
  /** `pagination.totalItems` de la respuesta. */
  totalItems: number;
  /** Página en base 1, como la API. */
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sort?: TableSort | null;
  onSortChange?: (sort: TableSort) => void;
  /** Primera carga, sin datos que mostrar. */
  isLoading?: boolean;
  /** Recarga con datos previos en pantalla (p. ej. al cambiar de página). */
  isFetching?: boolean;
  /** Mensaje ya traducido (`describeApiError(error).message`); con él se pinta el estado de error. */
  errorMessage?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Acciones de cada fila (botones de icono con `aria-label`, o un menú). */
  rowActions?: (row: TRow) => ReactNode;
  /** Breakpoint desde el que se usa la tabla; por debajo, tarjetas. */
  cardsBelow?: Breakpoint;
}

const SKELETON_ROWS = 5;
const ACTIONS_HEADER = 'Acciones';
const PAGINATION_LABELS = {
  first: 'Primera página',
  last: 'Última página',
  next: 'Página siguiente',
  previous: 'Página anterior',
} as const;

function nextSort(current: TableSort | null | undefined, field: string): TableSort {
  if (current?.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field, direction: 'asc' };
}

function ariaSort(sort: TableSort | null | undefined, field: string): 'ascending' | 'descending' | undefined {
  if (sort?.field !== field) {
    return undefined;
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

const SORT_DIRECTION_LABEL: Record<SortDirection, string> = { asc: 'ascendente', desc: 'descendente' };

export function DataTable<TRow>({
  label,
  columns,
  rows,
  getRowId,
  totalItems,
  page,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  isLoading = false,
  isFetching = false,
  errorMessage,
  onRetry,
  emptyTitle = 'No hay resultados',
  emptyDescription = 'Prueba con otra búsqueda o quita algún filtro.',
  emptyAction,
  rowActions,
  cardsBelow = 'sm',
}: DataTableProps<TRow>) {
  const isTableLayout = useMediaQuery((theme: Theme) => theme.breakpoints.up(cardsBelow), { noSsr: true });
  const items = rows ?? [];
  const hasRows = items.length > 0;
  const showSkeleton = isLoading && !hasRows;

  let body: ReactNode;
  if (errorMessage) {
    body = (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            onRetry ? (
              <Button color="inherit" size="small" variant="text" onClick={onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          {errorMessage}
        </Alert>
      </Box>
    );
  } else if (showSkeleton) {
    body = (
      <Stack role="status" aria-label="Cargando" spacing={1} sx={{ p: 2 }}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} variant="text" />
        ))}
      </Stack>
    );
  } else if (!hasRows) {
    body = <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  } else if (isTableLayout) {
    body = (
      <TableContainer className="scroll-x">
        <Table aria-label={label}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.id} align={column.align} aria-sort={ariaSort(sort, column.id)}>
                  {column.sortable && onSortChange ? (
                    <TableSortLabel
                      active={sort?.field === column.id}
                      direction={sort?.field === column.id ? sort.direction : 'asc'}
                      onClick={() => onSortChange(nextSort(sort, column.id))}
                    >
                      {column.header}
                    </TableSortLabel>
                  ) : (
                    column.header
                  )}
                </TableCell>
              ))}
              {rowActions ? <TableCell align="right">{ACTIONS_HEADER}</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={getRowId(row)} hover>
                {columns.map((column) => (
                  <TableCell key={column.id} align={column.align}>
                    {column.render(row)}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {rowActions(row)}
                    </Stack>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  } else {
    body = (
      <DataCardList
        label={label}
        columns={columns}
        rows={items}
        getRowId={getRowId}
        rowActions={rowActions}
        sort={sort}
        onSortChange={onSortChange}
      />
    );
  }

  return (
    <Card>
      <Box sx={{ visibility: isFetching && hasRows ? 'visible' : 'hidden' }}>
        <LinearProgress aria-hidden />
      </Box>
      {body}
      {!errorMessage && hasRows ? (
        <TablePagination
          component="div"
          count={totalItems}
          page={Math.max(page - 1, 0)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[...pageSizeOptions]}
          onPageChange={(_, zeroBasedPage) => onPageChange(zeroBasedPage + 1)}
          onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          getItemAriaLabel={(type) => PAGINATION_LABELS[type]}
        />
      ) : null}
    </Card>
  );
}

interface DataCardListProps<TRow>
  extends Pick<DataTableProps<TRow>, 'label' | 'columns' | 'getRowId' | 'rowActions' | 'sort' | 'onSortChange'> {
  rows: readonly TRow[];
}

/** Vista móvil: una tarjeta por fila, con selector de orden si hay columnas ordenables. */
function DataCardList<TRow>({ label, columns, rows, getRowId, rowActions, sort, onSortChange }: DataCardListProps<TRow>) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const details = columns.filter((column) => column !== primary && !column.hideOnMobile);
  const sortable = onSortChange ? columns.filter((column) => column.sortable) : [];
  const sortValue = sort ? `${sort.field}:${sort.direction}` : '';

  return (
    <Box sx={{ p: 2 }}>
      {sortable.length > 0 && onSortChange ? (
        <TextField
          select
          fullWidth
          size="small"
          label="Ordenar por"
          value={sortValue}
          onChange={(event) => {
            const [field, direction] = event.target.value.split(':');
            if (field && (direction === 'asc' || direction === 'desc')) {
              onSortChange({ field, direction });
            }
          }}
          sx={{ mb: 2 }}
        >
          {sortable.flatMap((column) =>
            (['asc', 'desc'] as const).map((direction) => (
              <MenuItem key={`${column.id}:${direction}`} value={`${column.id}:${direction}`}>
                {`${column.header} (${SORT_DIRECTION_LABEL[direction]})`}
              </MenuItem>
            )),
          )}
        </TextField>
      ) : null}

      <Stack component="ul" aria-label={label} spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((row) => (
          <Card key={getRowId(row)} component="li" variant="outlined">
            <CardContent>
              {primary ? (
                <Typography variant="subtitle1" component="div" sx={{ mb: 1 }}>
                  {primary.render(row)}
                </Typography>
              ) : null}
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5 }}>
                {details.map((column) => (
                  <Box key={column.id} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="caption" color="text.secondary">
                      {column.header}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {column.render(row)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              {rowActions ? (
                <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                  {rowActions(row)}
                </Stack>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
