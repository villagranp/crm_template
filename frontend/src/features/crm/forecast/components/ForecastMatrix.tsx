import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Location } from 'react-router-dom';

import { EmptyState } from '@/components/data';
import { formatQuantity, formatTonnage, sumDecimals } from '@/features/crm/common/decimal';
import { UnsavedChangesGuard } from '@/features/crm/common/UnsavedChangesGuard';
import { formatDateTime, productLabel, PROJECT_PERMISSIONS, UnitSelect, withReference } from '@/features/crm/projects';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import { forecastQuery, MAX_BATCH_LINES, type ForecastCell, type ForecastFilters, type ForecastRow, type YearMonth } from '../forecast.api';
import {
  buildSavePayload,
  cellKey,
  changeCount,
  discardCells,
  draftIssues,
  draftUnit,
  draftValue,
  editCell,
  EMPTY_DRAFT,
  isDirty,
  lineErrorsByCell,
  previewTonnage,
  refOf,
  revertCell,
  setRowUnit,
  staleKeys,
  type ForecastDraft,
} from '../forecast-draft';
import { FORECAST_ERROR_MESSAGES } from '../forecast.errors';
import { periodHeader, periodKey } from '../forecast-format';
import { forecastKeys, useForecastRows, useForecastTotals, useForecastUnits, useSaveForecastLines } from '../forecast.queries';

import { ForecastCellEditor } from './ForecastCellEditor';
import { ForecastMobileList } from './ForecastMobileList';
import { ForecastTotalsFooter, ForecastTotalsPanel } from './ForecastTotalsFooter';

export interface ForecastMatrixProps {
  /** Filtros de filas y totales (modo, proyecto, producto, asesor, meses, búsqueda). */
  filters: ForecastFilters;
  /** Sección de la ficha: el proyecto ya es el de la ficha (sin cabeceras de grupo). */
  hideProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Qué navegaciones avisan con cambios sin guardar (por defecto, los cambios de ruta). */
  shouldBlockNavigation?: (current: Location, next: Location) => boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [MIN_PAGE_SIZE, DEFAULT_PAGE_SIZE, 100];
/** Producto y unidad antes de los meses; fecha de actualización después del total de fila. */
const LEADING_COLUMNS = 2;
const TRAILING_COLUMNS = 1;

type Period = YearMonth & { offset: number };

function rowTotalText(row: ForecastRow): string {
  const quantities = row.rowTotals.quantitiesByUnit.map((item) => formatQuantity(item.quantity, item.unit.symbol));
  return [...quantities, formatTonnage(row.rowTotals.tonnage)].join(' · ');
}

function MatrixSkeleton() {
  return (
    <Stack role="status" aria-label="Cargando el forecast" spacing={1} sx={{ p: 2 }}>
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(6) }} />
      ))}
    </Stack>
  );
}

/**
 * Matriz editable del Forecast M+6 (03 §E.8, F-20). La usan la pantalla
 * `/proyectos/forecast` y la sección Forecast de la ficha (filtrada por el
 * proyecto, AC-03.81), con las mismas reglas y totales.
 *
 * - Filas = pares (proyecto, producto); celdas editables según `cell.editable`
 *   (lo decide el backend: permiso, ventana y modo). Modo historial y meses
 *   fuera de la ventana, de solo lectura.
 * - Edición en borrador (`forecast-draft.ts`): se marcan las celdas cambiadas y
 *   "Guardar cambios (n)" envía solo esas con su `expectedUpdatedAt`. Los
 *   errores `lines[i]` se pintan en su celda; un `409 FORECAST_LINE_STALE` avisa
 *   y permite recargar conservando el resto del borrador.
 * - Teclado: Tab/Mayús+Tab recorren las celdas, Enter baja a la fila
 *   siguiente y Escape revierte la celda.
 * - Pie con los totales del backend (solo toneladas; cantidades por unidad;
 *   líneas sin conversión). En móvil, tarjetas y panel de totales.
 */
export function ForecastMatrix({
  filters,
  hideProject = false,
  emptyTitle = 'No hay productos asociados para proyectar con estos filtros',
  emptyDescription = 'Las filas son los productos asociados a los proyectos que puedes ver.',
  shouldBlockNavigation,
}: ForecastMatrixProps) {
  const can = useCan();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const containerRef = useRef<HTMLDivElement>(null);

  const baseQuery = useMemo(() => forecastQuery(filters), [filters]);
  const filtersKey = JSON.stringify(baseQuery);
  const [paging, setPaging] = useState({ key: filtersKey, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const page = paging.key === filtersKey ? paging.page : 1;
  const rowsQuery = useMemo(() => ({ ...baseQuery, page, pageSize: paging.pageSize }), [baseQuery, page, paging.pageSize]);
  const rows = useForecastRows(rowsQuery);
  const totals = useForecastTotals(baseQuery);

  const [draft, setDraft] = useState<ForecastDraft>(EMPTY_DRAFT);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useSaveForecastLines();

  const rowItems = useMemo(() => rows.data?.data ?? [], [rows.data]);
  const periods: Period[] = useMemo(() => {
    const cells = rowItems[0]?.cells;
    if (cells) return cells.map(({ year, month, offset }) => ({ year, month, offset }));
    return (totals.data?.periods ?? []).map(({ year, month, offset }) => ({ year, month, offset }));
  }, [rowItems, totals.data]);
  const anyEditable = rowItems.some((row) => row.cells.some((cell) => cell.editable));
  const canChooseUnit = anyEditable && can(PROJECT_PERMISSIONS.view);
  const units = useForecastUnits(canChooseUnit);

  const issues = useMemo(() => draftIssues(draft), [draft]);
  const pending = changeCount(draft);
  const dirty = isDirty(draft);

  // Un aviso de guardado deja de valer en cuanto se vuelve a editar.
  useEffect(() => {
    if (dirty) setNotice(null);
  }, [dirty]);

  const clearCellError = (key: string) => {
    setCellErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const onEdit = (row: ForecastRow, cell: ForecastCell, value: string) => {
    setDraft((current) => editCell(current, row, cell, value));
    clearCellError(cellKey(refOf(row, cell)));
    setLocalError(null);
  };

  const onRevert = (key: string) => {
    setDraft((current) => revertCell(current, key));
    clearCellError(key);
  };

  // Enter: misma columna, siguiente fila con celda editable.
  const focusBelow = (input: HTMLInputElement) => {
    const row = Number(input.dataset.row);
    const column = input.dataset.column;
    const candidates = containerRef.current?.querySelectorAll<HTMLInputElement>(`input[data-column="${column}"]`) ?? [];
    const next = Array.from(candidates).find((candidate) => Number(candidate.dataset.row) > row);
    if (next) {
      next.focus();
      next.select();
    }
  };

  const onSave = () => {
    if (Object.keys(issues).length > 0) {
      setLocalError('Corrige las celdas marcadas antes de guardar.');
      return;
    }
    const payload = buildSavePayload(draft);
    if (payload.lines.length === 0) {
      return;
    }
    if (payload.lines.length > MAX_BATCH_LINES) {
      setLocalError(`Se pueden guardar como máximo ${MAX_BATCH_LINES} celdas a la vez.`);
      return;
    }
    setLocalError(null);
    setCellErrors({});
    setConflicts([]);
    save.mutate(payload.lines, {
      onSuccess: (result) => {
        setDraft(EMPTY_DRAFT);
        setNotice(
          `Cambios guardados: ${result.created} ${result.created === 1 ? 'nueva' : 'nuevas'}, ${result.updated} ${result.updated === 1 ? 'actualizada' : 'actualizadas'}` +
            (result.unchanged > 0 ? `, ${result.unchanged} sin cambios.` : '.'),
        );
      },
      onError: (error) => {
        setCellErrors(lineErrorsByCell(error, payload.keys));
        setConflicts(staleKeys(error, payload.keys));
      },
    });
  };

  const onDiscard = () => {
    setDraft(EMPTY_DRAFT);
    setCellErrors({});
    setConflicts([]);
    setLocalError(null);
    save.reset();
  };

  const reloadKeepingDraft = () => {
    setDraft((current) => discardCells(current, conflicts));
    setConflicts([]);
    save.reset();
    void queryClient.invalidateQueries({ queryKey: forecastKeys.all });
  };

  const isStale = save.error !== null && conflicts.length > 0;
  const generalError =
    save.isError && !isStale ? withReference(describeApiError(save.error, FORECAST_ERROR_MESSAGES)) : null;

  const errorOf = (key: string): string | undefined =>
    issues[key] ?? cellErrors[key] ?? (conflicts.includes(key) ? 'Otro usuario modificó esta celda.' : undefined);

  const renderCell = (row: ForecastRow, cell: ForecastCell, rowIndex: number, columnIndex: number): ReactNode => {
    const key = cellKey(refOf(row, cell));
    const value = draftValue(draft, key);
    const unitId = draftUnit(draft, row.project.id, row.product.id);
    const unit = (unitId && units.data?.data.find((item) => item.id === unitId)) || cell.unit || row.unit;
    return (
      <ForecastCellEditor
        cell={cell}
        label={`Cantidad de ${row.product.sku}${hideProject ? '' : ` (${row.project.code})`} en ${periodHeader(cell)}`}
        draftValue={value}
        error={errorOf(key)}
        preview={value !== undefined ? previewTonnage(value, row, cell, draft) : null}
        rowHasConversion={Boolean(row.conversion) && !unitId}
        unitSymbol={unit.symbol}
        onChange={(next) => onEdit(row, cell, next)}
        onRevert={() => onRevert(key)}
        onEnter={focusBelow}
        position={{ row: rowIndex, column: columnIndex }}
        fullWidth={isMobile}
      />
    );
  };

  const renderUnit = (row: ForecastRow): ReactNode => {
    const editable = row.cells.some((cell) => cell.editable);
    const selected = draftUnit(draft, row.project.id, row.product.id) ?? row.unit.id;
    if (!editable || !units.data) {
      return (
        <Typography variant="body2" component="span">
          {`${row.unit.code} (${row.unit.symbol})`}
        </Typography>
      );
    }
    return (
      <UnitSelect
        size="small"
        value={selected}
        onChange={(unitId) => setDraft((current) => setRowUnit(current, row, unitId))}
        units={units.data.data}
        current={row.unit}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': `Unidad de ${row.product.sku}` } as Record<string, string> } }}
        sx={{ minWidth: (theme: Theme) => theme.spacing(16) }}
      />
    );
  };

  // ---- Estados -------------------------------------------------------------

  if (rows.isPending) {
    return <MatrixSkeleton />;
  }
  if (rows.isError) {
    return (
      <EmptyState
        role="alert"
        title="No se pudo cargar el forecast"
        description={withReference(describeApiError(rows.error, FORECAST_ERROR_MESSAGES))}
        action={
          <Button variant="outlined" onClick={() => void rows.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }
  if (rows.data.pagination.totalItems === 0 && !dirty) {
    return <EmptyState icon={<TableChartOutlinedIcon />} title={emptyTitle} description={emptyDescription} />;
  }

  // ---- Tabla (escritorio) ---------------------------------------------------

  const groupRows: ReactNode[] = [];
  let previousProject: string | null = null;
  rowItems.forEach((row, rowIndex) => {
    if (!hideProject && row.project.id !== previousProject) {
      previousProject = row.project.id;
      const projectRows = rowItems.filter((item) => item.project.id === row.project.id);
      const subtotal = sumDecimals(projectRows.map((item) => item.rowTotals.tonnage));
      groupRows.push(
        <TableRow key={`group-${row.project.id}`} sx={{ bgcolor: 'background.subtle' }}>
          <TableCell colSpan={LEADING_COLUMNS + periods.length + 1 + TRAILING_COLUMNS} component="th" scope="rowgroup">
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="baseline">
              <Typography variant="subtitle2" component="span" sx={{ overflowWrap: 'anywhere' }}>
                {`${row.project.code} · ${row.project.name}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {`Asesor: ${row.project.owner.displayName} · Subtotal: ${formatTonnage(subtotal)}`}
              </Typography>
            </Stack>
          </TableCell>
        </TableRow>,
      );
    }
    groupRows.push(
      <TableRow key={`${row.project.id}|${row.product.id}`} hover>
        <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', minWidth: (theme) => theme.spacing(24) }}>
          <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {productLabel(row.product)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.product.family.name}
          </Typography>
        </TableCell>
        <TableCell>{renderUnit(row)}</TableCell>
        {row.cells.map((cell, columnIndex) => (
          <TableCell key={periodKey(cell)} sx={{ minWidth: (theme) => theme.spacing(15), verticalAlign: 'top' }}>
            {renderCell(row, cell, rowIndex, columnIndex)}
          </TableCell>
        ))}
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
          {rowTotalText(row)}
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.lastUpdatedAt ? formatDateTime(row.lastUpdatedAt) : '—'}</TableCell>
      </TableRow>,
    );
  });

  const pagination = rows.data.pagination;

  return (
    <Box ref={containerRef}>
      <UnsavedChangesGuard when={dirty} shouldBlock={shouldBlockNavigation} description="Tienes cambios del forecast sin guardar. Si sales ahora, se perderán." />
      <Stack spacing={2}>
        {filters.mode === 'HISTORY' ? (
          <Alert severity="info">Modo historial: meses pasados, de solo lectura.</Alert>
        ) : null}
        {notice ? (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {isStale ? (
          <Alert
            severity="warning"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={reloadKeepingDraft}>
                Recargar
              </Button>
            }
          >
            {`Otro usuario modificó ${conflicts.length === 1 ? 'una de estas celdas' : `${conflicts.length} de estas celdas`}. Recarga para ver sus valores; el resto de tu borrador se conserva.`}
          </Alert>
        ) : null}
        {generalError ? <Alert severity="error">{generalError}</Alert> : null}
        {localError ? <Alert severity="error">{localError}</Alert> : null}

        {isMobile ? (
          <>
            <ForecastMobileList rows={rowItems} showProject={!hideProject} renderCell={renderCell} renderUnit={renderUnit} />
            {totals.data ? <ForecastTotalsPanel totals={totals.data} periods={periods} /> : null}
          </>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Matriz del forecast">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.subtle' }}>Producto (SKU · descripción)</TableCell>
                  <TableCell sx={{ bgcolor: 'background.subtle' }}>Unidad</TableCell>
                  {periods.map((period) => (
                    <TableCell key={periodKey(period)} align="right" sx={{ bgcolor: 'background.subtle', whiteSpace: 'nowrap' }}>
                      {periodHeader(period)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ bgcolor: 'background.subtle' }}>
                    Total fila
                  </TableCell>
                  <TableCell sx={{ bgcolor: 'background.subtle' }}>Actualizado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>{groupRows}</TableBody>
              {totals.data ? (
                <ForecastTotalsFooter totals={totals.data} periods={periods} leadingColumns={LEADING_COLUMNS} trailingColumns={TRAILING_COLUMNS} />
              ) : null}
            </Table>
          </TableContainer>
        )}
        {totals.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void totals.refetch()}>
                Reintentar
              </Button>
            }
          >
            {withReference(describeApiError(totals.error, FORECAST_ERROR_MESSAGES))}
          </Alert>
        ) : null}

        {pagination.totalItems > MIN_PAGE_SIZE ? (
          <TablePagination
            component="div"
            count={pagination.totalItems}
            page={page - 1}
            onPageChange={(_, next) => setPaging({ key: filtersKey, page: next + 1, pageSize: paging.pageSize })}
            rowsPerPage={paging.pageSize}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
            onRowsPerPageChange={(event) => setPaging({ key: filtersKey, page: 1, pageSize: Number.parseInt(event.target.value, 10) })}
            labelRowsPerPage="Filas por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        ) : null}
      </Stack>

      {dirty ? (
        <Paper
          elevation={3}
          role="region"
          aria-label="Cambios sin guardar"
          sx={{ position: 'sticky', bottom: 0, zIndex: (theme) => theme.zIndex.appBar, mt: 2, px: 2, py: 1.5 }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Typography variant="body2">
              {pending === 1 ? '1 celda cambiada sin guardar.' : `${pending} celdas cambiadas sin guardar.`}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="inherit" onClick={onDiscard} disabled={save.isPending}>
                Descartar
              </Button>
              <Button onClick={onSave} disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : `Guardar cambios (${pending})`}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}

