import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { Box, Chip } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';

import {
  AdminListCard,
  DataTable,
  describeApiError,
  recordsSubtitle,
  RefreshTool,
  type DataTableColumn,
} from '@/features/admin/common';

import type { Currency } from '../exchange-rates.api';
import { BASE_CURRENCY } from '../exchange-rates-format';

const COLUMNS: DataTableColumn<Currency>[] = [
  {
    id: 'code',
    header: 'Código',
    render: (currency) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {currency.code}
        {currency.code === BASE_CURRENCY ? ' (base)' : ''}
      </Box>
    ),
    primary: true,
  },
  { id: 'name', header: 'Nombre', render: (currency) => currency.name },
  { id: 'symbol', header: 'Símbolo', render: (currency) => currency.symbol },
  {
    id: 'decimals',
    header: 'Decimales',
    render: (currency) => currency.decimals,
    align: 'right',
    hideOnMobile: true,
  },
  {
    id: 'isActive',
    header: 'Estado',
    render: (currency) => (
      <Chip
        size="small"
        color={currency.isActive ? 'success' : 'default'}
        label={currency.isActive ? 'Activa' : 'Inactiva'}
      />
    ),
  },
];

/** Las cinco monedas sembradas caben en una página. */
const SINGLE_PAGE = 1;

export interface CurrenciesTabProps {
  currencies: UseQueryResult<Currency[]>;
}

/**
 * Pestaña «Monedas» (07 E.5): las monedas sembradas, en **sólo lectura**. No
 * hay alta, edición ni desactivación desde la interfaz (RN-07.44).
 */
export function CurrenciesTab({ currencies }: CurrenciesTabProps) {
  const rows = currencies.data ?? [];
  return (
    <AdminListCard
      icon={<PaymentsOutlinedIcon />}
      title="Monedas"
      subtitle={recordsSubtitle(
        currencies.data?.length,
        'Sembradas con el sistema; sólo lectura.',
        ['moneda', 'monedas'],
      )}
      tools={
        <RefreshTool busy={currencies.isFetching} onRefresh={() => void currencies.refetch()} />
      }
    >
      <DataTable
        label="Monedas"
        columns={COLUMNS}
        rows={currencies.data}
        getRowId={(currency) => currency.code}
        totalItems={rows.length}
        page={SINGLE_PAGE}
        pageSize={Math.max(rows.length, 1)}
        pageSizeOptions={[Math.max(rows.length, 1)]}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        isLoading={currencies.isPending}
        isFetching={currencies.isFetching}
        errorMessage={currencies.isError ? describeApiError(currencies.error).message : null}
        onRetry={() => void currencies.refetch()}
        emptyTitle="No hay monedas"
      />
    </AdminListCard>
  );
}
