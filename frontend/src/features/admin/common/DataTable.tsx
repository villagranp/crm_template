import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import {
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  useMediaQuery,
  type Breakpoint,
  type Theme,
} from '@mui/material';
import type { ReactNode } from 'react';

import { subtleSurface } from './admin-surfaces';
import { EmptyState } from './EmptyState';
import { PAGE_SIZE_OPTIONS, type SortDirection, type TableSort } from './use-table-query-state';

/**
 * Tabla paginada en el servidor sobre `Table` de MUI (PLAN-ADMIN D14: sin
 * DataGrid), con el acabado del CRUD del prototipo (`table-crud`).
 *
 * Es presentacional: no consulta nada. La pantalla le pasa la página actual,
 * el total y los callbacks (normalmente los de `useTableQueryState`) y el
 * resultado de su `useQuery`. Va a sangre dentro de una `AdminListCard`: no
 * pinta su propia tarjeta.
 *
 * Mobile first: por debajo de `cardsBelow` (por defecto `md`, como el
 * prototipo) cada fila se pinta como una tarjeta con pares etiqueta/valor;
 * desde ahí, como tabla, que scrollea en X dentro de su propio contenedor si
 * no cabe (la página nunca lo hace).
 */

export interface DataTableColumn<TRow> {
  /** Identificador estable; si la columna es ordenable, es el valor que se envía en `sortBy`. */
  id: string;
  header: string;
  render: (row: TRow) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  /** En la vista de tarjetas: primera fila, en negrita (sólo una columna). */
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
  emptyIcon?: ReactNode;
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

function ariaSort(
  sort: TableSort | null | undefined,
  field: string,
): 'ascending' | 'descending' | undefined {
  if (sort?.field !== field) {
    return undefined;
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

const SORT_DIRECTION_LABEL: Record<SortDirection, string> = {
  asc: 'ascendente',
  desc: 'descendente',
};

/** Etiqueta de columna del prototipo: mayúsculas pequeñas, espaciadas y en gris. */
const columnLabelSx = (theme: Theme) => ({
  ...theme.typography.overline,
  fontFamily: theme.typography.fontFamily,
  fontWeight: 700,
  lineHeight: 1.35,
  color: theme.palette.text.secondary,
});

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
  emptyIcon,
  emptyAction,
  rowActions,
  cardsBelow = 'md',
}: DataTableProps<TRow>) {
  const isTableLayout = useMediaQuery((theme: Theme) => theme.breakpoints.up(cardsBelow), {
    noSsr: true,
  });
  const items = rows ?? [];
  const hasRows = items.length > 0;
  const showSkeleton = isLoading && !hasRows;

  let body: ReactNode;
  if (errorMessage) {
    body = (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar la lista"
        description={errorMessage}
        action={
          onRetry ? (
            <Button variant="outlined" onClick={onRetry}>
              Reintentar
            </Button>
          ) : undefined
        }
      />
    );
  } else if (showSkeleton) {
    body = (
      <Stack
        role="status"
        aria-label="Cargando"
        spacing={1.5}
        sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}
      >
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Stack key={index} direction="row" spacing={1.5} alignItems="center">
            <Skeleton
              variant="circular"
              sx={{ width: (theme) => theme.spacing(4.5), height: (theme) => theme.spacing(4.5) }}
            />
            <Skeleton variant="text" sx={{ flex: 1 }} />
          </Stack>
        ))}
      </Stack>
    );
  } else if (!hasRows) {
    body = (
      <EmptyState
        icon={emptyIcon ?? <SearchOffOutlinedIcon />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  } else if (isTableLayout) {
    body = (
      <TableContainer className="scroll-x">
        <Table aria-label={label}>
          <TableHead>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.field === column.id;
                return (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    aria-sort={ariaSort(sort, column.id)}
                    sx={(theme) => ({
                      ...columnLabelSx(theme),
                      bgcolor: subtleSurface(theme),
                      whiteSpace: 'nowrap',
                    })}
                  >
                    {column.sortable && onSortChange ? (
                      <TableSortLabel
                        active={active}
                        direction={active ? sort.direction : 'asc'}
                        onClick={() => onSortChange(nextSort(sort, column.id))}
                        IconComponent={active ? undefined : UnfoldMoreIcon}
                        sx={{
                          '&, &:hover, &.Mui-active': { color: 'inherit' },
                          '&:hover': { color: 'text.primary' },
                          '& .MuiTableSortLabel-icon': {
                            opacity: active ? 1 : 0.4,
                            fontSize: '1rem',
                          },
                        }}
                      >
                        {column.header}
                      </TableSortLabel>
                    ) : (
                      column.header
                    )}
                  </TableCell>
                );
              })}
              {rowActions ? (
                <TableCell
                  align="right"
                  sx={(theme) => ({
                    ...columnLabelSx(theme),
                    bgcolor: subtleSurface(theme),
                    whiteSpace: 'nowrap',
                  })}
                >
                  {ACTIONS_HEADER}
                </TableCell>
              ) : null}
            </TableRow>
          </TableHead>
          <TableBody
            sx={{
              '& .MuiTableCell-root': { py: 1.5, typography: 'body2' },
              '& .MuiTableRow-root:last-of-type .MuiTableCell-root': { borderBottom: 0 },
              '& .MuiTableRow-root:hover': { bgcolor: subtleSurface },
            }}
          >
            {items.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((column) => (
                  <TableCell key={column.id} align={column.align}>
                    {column.render(row)}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Stack
                      direction="row"
                      spacing={0.25}
                      justifyContent="flex-end"
                      sx={{ color: 'text.secondary' }}
                    >
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
    <Box>
      <Box sx={{ visibility: isFetching && hasRows ? 'visible' : 'hidden' }}>
        <LinearProgress aria-hidden />
      </Box>
      {body}
      {!errorMessage && hasRows ? (
        <TablePager
          totalItems={totalItems}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
    </Box>
  );
}

interface TablePagerProps {
  totalItems: number;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Pie de la tabla (`pager-x`): "Mostrando X–Y de Z" y páginas en píldora, con tamaño de página. */
function TablePager({
  totalItems,
  page,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: TablePagerProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1}
      alignItems="center"
      justifyContent="space-between"
      sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {`Mostrando ${from.toLocaleString('es-MX')}–${to.toLocaleString('es-MX')} de ${totalItems.toLocaleString('es-MX')}`}
        </Typography>
        <Select
          size="small"
          variant="standard"
          disableUnderline
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          inputProps={{ 'aria-label': 'Filas por página' }}
          sx={{
            typography: 'caption',
            color: 'text.secondary',
            '& .MuiSelect-select': { py: 0.5 },
          }}
        >
          {pageSizeOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </Stack>
      <Pagination
        count={totalPages}
        page={Math.min(page, totalPages)}
        onChange={(_, next) => onPageChange(next)}
        color="primary"
        shape="rounded"
        siblingCount={1}
        getItemAriaLabel={(type, itemPage, selected) => {
          if (type === 'page') {
            return selected ? `Página ${itemPage}, actual` : `Ir a la página ${itemPage}`;
          }
          return type in PAGINATION_LABELS
            ? PAGINATION_LABELS[type as keyof typeof PAGINATION_LABELS]
            : '';
        }}
        sx={{
          '& .MuiPaginationItem-root': {
            minWidth: (theme) => theme.spacing(5),
            height: (theme) => theme.spacing(5),
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            fontWeight: 600,
            color: 'text.secondary',
          },
          '& .MuiPaginationItem-root.Mui-selected': { color: 'primary.contrastText' },
        }}
      />
    </Stack>
  );
}

interface DataCardListProps<TRow> extends Pick<
  DataTableProps<TRow>,
  'label' | 'columns' | 'getRowId' | 'rowActions' | 'sort' | 'onSortChange'
> {
  rows: readonly TRow[];
}

/**
 * Vista móvil (`table-x` por debajo de 768 px en el prototipo): una tarjeta por
 * fila con pares etiqueta/valor; la etiqueta en mayúsculas a la izquierda y el
 * valor a la derecha. Con columnas ordenables, un selector de orden encima.
 */
function DataCardList<TRow>({
  label,
  columns,
  rows,
  getRowId,
  rowActions,
  sort,
  onSortChange,
}: DataCardListProps<TRow>) {
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const visible = [
    primary,
    ...columns.filter((column) => column !== primary && !column.hideOnMobile),
  ].filter((column): column is DataTableColumn<TRow> => column !== undefined);
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
          <Paper
            key={getRowId(row)}
            component="li"
            sx={{ px: 0.5, py: 0.75, boxShadow: 1, borderRadius: 1 }}
          >
            <Box component="dl" sx={{ m: 0 }}>
              {visible.map((column) => (
                <CardRow key={column.id} label={column.header} strong={column === primary}>
                  {column.render(row)}
                </CardRow>
              ))}
              {rowActions ? (
                <CardRow label={ACTIONS_HEADER}>
                  <Stack
                    direction="row"
                    spacing={0.25}
                    justifyContent="flex-end"
                    sx={{ color: 'text.secondary' }}
                  >
                    {rowActions(row)}
                  </Stack>
                </CardRow>
              ) : null}
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

function CardRow({
  label,
  strong = false,
  children,
}: {
  label: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      justifyContent="space-between"
      sx={{ px: 1.5, py: 0.75 }}
    >
      <Typography component="dt" sx={(theme) => ({ ...columnLabelSx(theme), flexShrink: 0 })}>
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="body2"
        sx={{
          m: 0,
          minWidth: 0,
          textAlign: 'right',
          overflowWrap: 'anywhere',
          fontWeight: strong ? 600 : undefined,
        }}
      >
        {children}
      </Typography>
    </Stack>
  );
}
