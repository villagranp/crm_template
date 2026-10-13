import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, Collapse, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useId, useMemo, useState } from 'react';

import { ListToolbar, useTableQueryState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { ROUTE_PATHS } from '@/routes/route-paths';

import { ForecastFilterChips, ForecastFilters, type ForecastFilterValues } from './components/ForecastFilters';
import { ForecastMatrix } from './components/ForecastMatrix';
import { FORECAST_FILTER_KEYS, FORECAST_SORT_FIELDS, type ForecastFilterKey, type ForecastFilters as MatrixFilters, type ForecastMode } from './forecast.api';
import { periodHeader } from './forecast-format';
import { useForecastWindow } from './forecast.queries';

const TITLE = 'Forecast M+6';

/**
 * Forecast comercial M+6 (03 §E.8, F-20). Ruta protegida con `forecast.ver`;
 * opción de menú `proyectos-forecast`.
 *
 * Conmutador "Ventana M+6 / Historial" (el historial es de solo lectura), filtros
 * en la URL con los nombres de la API (`/proyectos/forecast` sin filtros abre la
 * ventana vigente) y la matriz editable (`ForecastMatrix`). La cabecera muestra
 * los meses reales de la ventana que calcula el backend.
 */
export function ForecastPage() {
  const filtersPanelId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const table = useTableQueryState<ForecastFilterKey>({ filterKeys: FORECAST_FILTER_KEYS, sortableFields: FORECAST_SORT_FIELDS });
  const { filters, search } = table.state;
  const forecastWindow = useForecastWindow();
  const windowPeriods = useMemo(() => forecastWindow.data?.periods ?? [], [forecastWindow.data]);
  const mode: ForecastMode = filters.mode === 'HISTORY' ? 'HISTORY' : 'WINDOW';

  const matrixFilters = useMemo<MatrixFilters>(
    () => ({
      mode,
      projectId: filters.projectId,
      productId: filters.productId,
      ownerId: filters.ownerId,
      periods: filters.periods,
      from: filters.from,
      to: filters.to,
      search: search || undefined,
    }),
    [mode, filters.projectId, filters.productId, filters.ownerId, filters.periods, filters.from, filters.to, search],
  );

  const formValues: ForecastFilterValues = filters;
  const activeFilterCount = Object.keys(formValues).filter((key) => key !== 'mode').length;
  const first = windowPeriods[0];
  const last = windowPeriods.at(-1);

  const setMode = (next: ForecastMode) =>
    table.setFilters({ mode: next === 'HISTORY' ? 'HISTORY' : undefined, periods: undefined, from: undefined, to: undefined });

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle={
          first && last
            ? `Ventana vigente: ${periodHeader(first)} – ${periodHeader(last)}. El mes en curso y los pasados son de solo lectura.`
            : undefined
        }
        breadcrumbs={crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: TITLE })}
        actions={
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, value: ForecastMode | null) => value && setMode(value)} aria-label="Modo del forecast">
            <ToggleButton value="WINDOW">Ventana M+6</ToggleButton>
            <ToggleButton value="HISTORY">Historial</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Paper component="section" aria-label="Forecast" sx={{ overflow: 'hidden', boxShadow: 1, mb: 2 }}>
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
            label: 'Buscar por proyecto o SKU',
            placeholder: 'Buscar en el forecast…',
          }}
        >
          <Collapse in={filtersOpen} id={filtersPanelId}>
            <ForecastFilters values={formValues} mode={mode} windowPeriods={windowPeriods} onApply={(values) => table.setFilters(values)} />
          </Collapse>
          <ForecastFilterChips
            values={formValues}
            windowPeriods={windowPeriods}
            onRemove={(key) => table.setFilters({ [key]: undefined })}
            onClear={() => table.setFilters({ projectId: undefined, productId: undefined, ownerId: undefined, periods: undefined, from: undefined, to: undefined })}
          />
        </ListToolbar>
      </Paper>

      {forecastWindow.isError ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
          No se pudo cargar la ventana vigente; los meses se muestran según las filas.
        </Typography>
      ) : null}
      <Box>
        <ForecastMatrix filters={matrixFilters} />
      </Box>
    </>
  );
}
