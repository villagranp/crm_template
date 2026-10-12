import FilterListIcon from '@mui/icons-material/FilterList';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import {
  Alert,
  Box,
  Button,
  Collapse,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useId, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { DataTable, EmptyState, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { formatCalendarDate, opportunityDetailPath, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';
import { ROUTE_PATHS } from '@/routes/route-paths';

import { EstimateText } from './components/EstimateText';
import { OpportunityBoard } from './components/OpportunityBoard';
import { OpportunityFilterChips, OpportunityFilters, type OpportunityFilterValues } from './components/OpportunityFilters';
import { splitList } from './components/opportunity-filter-options';
import { OutcomeChip } from './components/OutcomeChip';
import { StageChangeDialog } from './components/StageChangeDialog';
import { StageChip } from './components/StageChip';
import {
  OPPORTUNITY_FILTER_KEYS,
  OPPORTUNITY_SORT_FIELDS,
  type OpportunityFilterKey,
  type OpportunityFormOptions,
  type OpportunityListItem,
} from './opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES } from './opportunities.errors';
import { useOpportunities, useOpportunityFormOptions, useStageSummary } from './opportunities.queries';
import { lacksNextAction } from './opportunity-format';

const TITLE = 'Oportunidades';
const DEFAULT_SORT = { field: 'updatedAt', direction: 'desc' } as const;
/** Parámetro de la URL con la vista (`?vista=tablero`); no se envía a la API. */
export const VIEW_PARAM = 'vista';
const BOARD_VIEW = 'tablero';

function columnsFor(options: OpportunityFormOptions | undefined): DataTableColumn<OpportunityListItem>[] {
  return [
    { id: 'code', header: 'Código', sortable: true, primary: true, render: (item) => item.code },
    {
      id: 'project',
      header: 'Proyecto',
      render: (item) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {item.project.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.project.code}
          </Typography>
        </Box>
      ),
    },
    { id: 'customer', header: 'Cliente', hideOnMobile: true, render: (item) => <Box sx={{ overflowWrap: 'anywhere' }}>{item.customer.legalName}</Box> },
    { id: 'stageOrder', header: 'Etapa', sortable: true, render: (item) => <StageChip stage={item.stage} /> },
    { id: 'opportunityDate', header: 'Fecha', sortable: true, hideOnMobile: true, render: (item) => formatCalendarDate(item.opportunityDate) },
    { id: 'owner', header: 'Asesor', hideOnMobile: true, render: (item) => item.owner.displayName },
    { id: 'estimatedAmountUsd', header: 'Estimación', sortable: true, align: 'right', render: (item) => <EstimateText opportunity={item} /> },
    {
      id: 'nextActionDate',
      header: 'Siguiente acción',
      sortable: true,
      hideOnMobile: true,
      render: (item) =>
        lacksNextAction(item) ? (
          <Typography variant="caption" color="warning.main" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAmberOutlinedIcon fontSize="inherit" aria-hidden />
            Sin siguiente acción
          </Typography>
        ) : (
          <Box sx={{ overflowWrap: 'anywhere' }}>
            {item.nextAction ?? '—'}
            {item.nextActionDate ? (
              <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block' }}>
                {formatCalendarDate(item.nextActionDate)}
              </Typography>
            ) : null}
          </Box>
        ),
    },
    { id: 'result', header: 'Resultado', render: (item) => (item.result ? <OutcomeChip result={item.result} options={options?.outcomes} /> : '—') },
  ];
}

/** Columnas del tablero: etapas de `stage-summary` (activas por orden), limitadas a las del filtro de etapa. */
function boardColumns(summary: ReturnType<typeof useStageSummary>['data'], stageFilter: string | undefined) {
  const chosen = splitList(stageFilter);
  return [...(summary?.stages ?? [])]
    .sort((a, b) => a.stage.order - b.stage.order)
    .filter((column) => chosen.length === 0 || chosen.includes(column.stage.id));
}

/**
 * Pipeline de oportunidades (03 §E.7, F-17, F-18). Ruta protegida con
 * `oportunidades.ver`; opción de menú `proyectos-oportunidades`.
 *
 * Vista lista (por defecto) y tablero (`?vista=tablero`). Filtros, búsqueda,
 * orden y página viven en la URL con los nombres de la API, así que los enlaces
 * de Inicio (`?status=OPEN`, `?outcome=WON,PARTIAL&decisionFrom=…`) se aplican
 * tal cual (AC-03.86). El orden por estimación usa el equivalente en USD.
 */
export function OpportunitiesPage() {
  const navigate = useNavigate();
  const filtersPanelId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const isBoard = searchParams.get(VIEW_PARAM) === BOARD_VIEW;

  const table = useTableQueryState<OpportunityFilterKey>({
    filterKeys: OPPORTUNITY_FILTER_KEYS,
    sortableFields: OPPORTUNITY_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
  });
  const { filters, search } = table.state;
  const options = useOpportunityFormOptions();
  const opportunities = useOpportunities(table.apiQuery, !isBoard);

  // Tablero: mismos filtros sin paginación ni orden; cada columna añade su etapa.
  const boardFilters = useMemo<ListQuery>(() => {
    const omitted = new Set(['page', 'pageSize', 'sortBy', 'sortOrder', 'stageId']);
    return Object.fromEntries(Object.entries(table.apiQuery).filter(([key]) => !omitted.has(key)));
  }, [table.apiQuery]);
  const summaryQuery = useMemo<ListQuery>(() => ({ ...boardFilters, stageId: filters.stageId }), [boardFilters, filters.stageId]);
  const summary = useStageSummary(summaryQuery, isBoard);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [changing, setChanging] = useState<OpportunityListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formFilters: OpportunityFilterValues = filters;
  const activeFilterCount = Object.keys(formFilters).filter((key) => key !== 'dateField').length;
  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const columns = useMemo(() => columnsFor(options.data), [options.data]);

  const setView = (board: boolean) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (board) next.set(VIEW_PARAM, BOARD_VIEW);
        else next.delete(VIEW_PARAM);
        return next;
      },
      { replace: true },
    );

  const removeFilter = (key: OpportunityFilterKey) => {
    const remaining = { ...filters, [key]: undefined };
    table.setFilters({ [key]: undefined, ...(remaining.dateFrom || remaining.dateTo ? {} : { dateField: undefined }) });
  };

  const viewToggle = (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={isBoard ? 'board' : 'list'}
      onChange={(_, value: 'board' | 'list' | null) => value && setView(value === 'board')}
      aria-label="Vista del pipeline"
    >
      <ToggleButton value="list" aria-label="Lista">
        <ViewListOutlinedIcon fontSize="small" />
        <Box component="span" sx={{ ml: 0.75, display: { xs: 'none', sm: 'inline' } }}>
          Lista
        </Box>
      </ToggleButton>
      <ToggleButton value="board" aria-label="Tablero">
        <ViewKanbanOutlinedIcon fontSize="small" />
        <Box component="span" sx={{ ml: 0.75, display: { xs: 'none', sm: 'inline' } }}>
          Tablero
        </Box>
      </ToggleButton>
    </ToggleButtonGroup>
  );

  let board = null;
  if (isBoard) {
    if (summary.isPending) {
      board = (
        <Stack role="status" aria-label="Cargando el tablero" direction="row" spacing={1.5} sx={{ p: 2, overflow: 'hidden' }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} variant="rounded" sx={{ flex: '0 0 auto', width: (theme) => theme.spacing(36), height: (theme) => theme.spacing(30) }} />
          ))}
        </Stack>
      );
    } else if (summary.isError) {
      board = (
        <EmptyState
          role="alert"
          title="No se pudo cargar el tablero"
          description={withReference(describeApiError(summary.error, OPPORTUNITY_ERROR_MESSAGES))}
          action={
            <Button variant="outlined" onClick={() => void summary.refetch()}>
              Reintentar
            </Button>
          }
        />
      );
    } else {
      const boardCols = boardColumns(summary.data, filters.stageId);
      board =
        boardCols.length === 0 ? (
          <EmptyState icon={<HandshakeOutlinedIcon />} title="No hay etapas que mostrar" description="Quita el filtro de etapa para ver el tablero completo." />
        ) : (
          <Box sx={{ p: 2 }}>
            <OpportunityBoard columns={boardCols} filters={boardFilters} onChangeStage={setChanging} />
          </Box>
        );
    }
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        breadcrumbs={crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: TITLE })}
        actions={viewToggle}
      />

      {notice ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      <Paper component="section" aria-label="Pipeline de oportunidades" sx={{ overflow: 'hidden', boxShadow: 1 }}>
        <ListToolbar
          filters={
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<FilterListIcon />}
              aria-expanded={filtersOpen}
              aria-controls={filtersPanelId}
              onClick={() => setFiltersOpen((open) => !open)}
              sx={{ flex: '0 0 auto', borderColor: 'divider' }}
            >
              {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
            </Button>
          }
          search={{
            value: table.searchInput,
            onChange: table.setSearchInput,
            label: 'Buscar por código o proyecto',
            placeholder: 'Buscar oportunidades…',
          }}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <OpportunityFilters values={formFilters} options={options.data} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <OpportunityFilterChips
            values={formFilters}
            options={options.data}
            onRemove={removeFilter}
            onClear={() => table.setFilters(Object.fromEntries(OPPORTUNITY_FILTER_KEYS.map((key) => [key, undefined])) as OpportunityFilterValues)}
          />
        </ListToolbar>

        {isBoard ? (
          board
        ) : (
          <DataTable
            label="Oportunidades"
            columns={columns}
            rows={opportunities.data?.data}
            getRowId={(item) => item.id}
            totalItems={opportunities.data?.pagination.totalItems ?? 0}
            page={table.state.page}
            pageSize={table.state.pageSize}
            onPageChange={table.setPage}
            onPageSizeChange={table.setPageSize}
            sort={table.state.sort}
            onSortChange={table.setSort}
            isLoading={opportunities.isPending}
            isFetching={opportunities.isFetching}
            errorMessage={opportunities.isError ? withReference(describeApiError(opportunities.error, OPPORTUNITY_ERROR_MESSAGES)) : null}
            onRetry={() => void opportunities.refetch()}
            emptyTitle={hasFilters ? 'No hay oportunidades que coincidan con los filtros' : 'Aún no hay oportunidades'}
            emptyDescription={
              hasFilters ? 'Prueba con otra búsqueda o quita algún filtro.' : 'Las oportunidades se crean desde la ficha de cada proyecto.'
            }
            emptyIcon={hasFilters ? undefined : <HandshakeOutlinedIcon />}
            emptyAction={
              hasFilters ? (
                <Button variant="outlined" onClick={() => table.clearFilters()}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
            onRowClick={(item) => navigate(opportunityDetailPath(item.id))}
            getRowLabel={(item) => `Abrir la oportunidad ${item.code} (${item.project.name})`}
            rowActions={(item) =>
              item.capabilities.canEdit ? (
                <Tooltip title="Cambiar etapa">
                  <IconButton aria-label={`Cambiar etapa de ${item.code}`} onClick={() => setChanging(item)}>
                    <SwapHorizOutlinedIcon />
                  </IconButton>
                </Tooltip>
              ) : null
            }
          />
        )}
      </Paper>

      <StageChangeDialog
        open={changing !== null}
        opportunityId={changing?.id ?? ''}
        onClose={() => setChanging(null)}
        onChanged={(updated) => {
          setChanging(null);
          setNotice(`Oportunidad ${updated.code} en ${updated.stage.label}.`);
        }}
      />
    </>
  );
}
