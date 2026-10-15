import CurrencyExchangeOutlinedIcon from '@mui/icons-material/CurrencyExchangeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Alert, Box, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  AdminListCard,
  DataTable,
  describeApiError,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';

import type { Currency, ExchangeRate } from '../exchange-rates.api';
import {
  BASE_CURRENCY,
  formatDateTime,
  formatEffectiveDate,
  formatRate,
} from '../exchange-rates-format';
import { exchangeRateKeys, useExchangeRates } from '../exchange-rates.queries';
import { dateRangeError } from '../exchange-rates.schemas';
import { ExchangeRateFormDialog } from './ExchangeRateFormDialog';

const FILTER_KEYS = ['currencyCode', 'from', 'to'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
/** Lista blanca de `GET /exchange-rates` (las columnas ordenables usan las dos primeras). */
const SORTABLE = ['effectiveDate', 'currencyCode', 'createdAt', 'updatedAt'] as const;
const DEFAULT_SORT = { field: 'effectiveDate', direction: 'desc' } as const;
const ALL_CURRENCIES = '';
export const RECALCULATION_NOTICE =
  'Corregir una tasa no recalcula las oportunidades ya guardadas.';

const COLUMNS: DataTableColumn<ExchangeRate>[] = [
  {
    id: 'currencyCode',
    header: 'Moneda',
    render: (rate) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {rate.currencyCode}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  {
    id: 'effectiveDate',
    header: 'Fecha de vigencia',
    render: (rate) => formatEffectiveDate(rate.effectiveDate),
    sortable: true,
  },
  {
    id: 'ratePerUsd',
    header: 'Tasa (por 1 USD)',
    render: (rate) => (
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatRate(rate.ratePerUsd)}
      </Box>
    ),
    align: 'right',
  },
  { id: 'source', header: 'Fuente', render: (rate) => rate.source, hideOnMobile: true },
  { id: 'notes', header: 'Notas', render: (rate) => rate.notes ?? '—', hideOnMobile: true },
  {
    id: 'updated',
    header: 'Actualizado',
    render: (rate) => (
      <Stack component="span">
        <span>{rate.updatedBy?.displayName ?? 'Sistema'}</span>
        <Typography component="span" variant="caption" color="text.secondary">
          {formatDateTime(rate.updatedAt)}
        </Typography>
      </Stack>
    ),
    hideOnMobile: true,
  },
];

type FormState = { open: false } | { open: true; rate: ExchangeRate | null };

export interface ExchangeRatesTabProps {
  currencies: UseQueryResult<Currency[]>;
  /** `parametros.configurar`: registrar y corregir (UX; el backend vuelve a exigirlo). */
  canConfigure: boolean;
}

/**
 * Pestaña «Tipos de cambio» (07 E.5, AC-07.40): lista paginada con filtros
 * Moneda y Desde/Hasta (sobre la fecha de vigencia) en la URL, alta y
 * corrección. Sin borrado ni desactivación.
 */
export function ExchangeRatesTab({ currencies, canConfigure }: ExchangeRatesTabProps) {
  const table = useTableQueryState<FilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const rates = useExchangeRates(table.apiQuery);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });

  const { from: appliedFrom = '', to: appliedTo = '' } = table.state.filters;
  const [range, setRange] = useState({ from: appliedFrom, to: appliedTo });
  useEffect(() => setRange({ from: appliedFrom, to: appliedTo }), [appliedFrom, appliedTo]);
  const rangeError = dateRangeError(range.from, range.to);

  const changeRange = (next: { from: string; to: string }) => {
    setRange(next);
    if (!dateRangeError(next.from, next.to)) {
      table.setFilters({ from: next.from || undefined, to: next.to || undefined });
    }
  };

  const filterCurrencies = (currencies.data ?? []).filter(
    (currency) => currency.code !== BASE_CURRENCY,
  );
  const hasFilters = Boolean(table.state.filters.currencyCode || appliedFrom || appliedTo);

  return (
    <>
      <AdminListCard
        icon={<CurrencyExchangeOutlinedIcon />}
        title="Tipos de cambio"
        subtitle={recordsSubtitle(
          rates.data?.pagination.totalItems,
          'Unidades de cada moneda por 1 USD, por fecha de vigencia.',
        )}
        tools={
          <RefreshTool
            busy={rates.isFetching}
            onRefresh={() =>
              void queryClient.invalidateQueries({ queryKey: exchangeRateKeys.lists() })
            }
          />
        }
        toolbar={
          <ListToolbar
            filters={
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
                <TextField
                  select
                  size="small"
                  label="Moneda"
                  value={table.state.filters.currencyCode ?? ALL_CURRENCIES}
                  onChange={(event) =>
                    table.setFilter('currencyCode', event.target.value || undefined)
                  }
                  sx={{ minWidth: (theme) => theme.spacing(20) }}
                >
                  <MenuItem value={ALL_CURRENCIES}>Todas</MenuItem>
                  {filterCurrencies.map((currency) => (
                    <MenuItem key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  type="date"
                  size="small"
                  label="Desde"
                  value={range.from}
                  onChange={(event) => changeRange({ ...range, from: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={Boolean(rangeError)}
                />
                <TextField
                  type="date"
                  size="small"
                  label="Hasta"
                  value={range.to}
                  onChange={(event) => changeRange({ ...range, to: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={Boolean(rangeError)}
                  helperText={rangeError ?? undefined}
                />
              </Stack>
            }
            primaryAction={
              canConfigure
                ? {
                    label: 'Nuevo tipo de cambio',
                    onClick: () => setForm({ open: true, rate: null }),
                  }
                : undefined
            }
          >
            <Alert severity="info">{RECALCULATION_NOTICE}</Alert>
          </ListToolbar>
        }
      >
        <DataTable
          label="Tipos de cambio"
          columns={COLUMNS}
          rows={rates.data?.data}
          getRowId={(rate) => rate.id}
          totalItems={rates.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={rates.isPending}
          isFetching={rates.isFetching}
          errorMessage={rates.isError ? describeApiError(rates.error).message : null}
          onRetry={() => void rates.refetch()}
          emptyTitle="No hay tipos de cambio"
          emptyDescription={hasFilters ? 'Prueba con otra moneda u otras fechas.' : undefined}
          rowActions={
            canConfigure
              ? (rate) => (
                  <IconButton
                    aria-label={`Corregir ${rate.currencyCode} del ${formatEffectiveDate(rate.effectiveDate)}`}
                    onClick={() => setForm({ open: true, rate })}
                  >
                    <EditOutlinedIcon />
                  </IconButton>
                )
              : undefined
          }
        />
      </AdminListCard>
      <ExchangeRateFormDialog
        open={form.open}
        rate={form.open ? form.rate : null}
        currencies={currencies.data ?? []}
        onClose={() => setForm({ open: false })}
      />
    </>
  );
}
