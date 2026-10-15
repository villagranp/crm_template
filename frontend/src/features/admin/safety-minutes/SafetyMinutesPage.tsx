import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, IconButton, Stack, TextField, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  DataTable,
  describeApiError,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { SafetyMinuteDeleteDialog } from './components/SafetyMinuteDeleteDialog';
import { SafetyMinuteDetailDialog } from './components/SafetyMinuteDetailDialog';
import { SafetyMinuteFormDialog } from './components/SafetyMinuteFormDialog';
import type { SafetyMinute } from './safety-minutes.api';
import { SAFETY_MINUTE_PERMISSIONS } from './safety-minutes.permissions';
import { safetyMinuteKeys, useSafetyMinutes } from './safety-minutes.queries';
import { dateRangeError } from './safety-minutes.schemas';
import { formatDateTime, formatDisplayDate } from './safety-minutes-format';

const TITLE = 'Minuto de seguridad';
const DESCRIPTION = 'Mensaje institucional que todos ven en Inicio el día programado.';
const FILTER_KEYS = ['from', 'to'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
/** Lista blanca de `GET /safety-minutes`. */
const SORTABLE = ['displayDate', 'createdAt', 'updatedAt'] as const;
const DEFAULT_SORT = { field: 'displayDate', direction: 'desc' } as const;
const PREVIEW_LINES = 2;

const COLUMNS: DataTableColumn<SafetyMinute>[] = [
  {
    id: 'displayDate',
    header: 'Fecha',
    render: (minute) => (
      <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatDisplayDate(minute.displayDate)}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  {
    id: 'message',
    header: 'Mensaje',
    // Vista previa truncada; el texto completo está en el detalle. Siempre texto, nunca HTML.
    render: (minute) => (
      <Typography
        component="span"
        variant="body2"
        sx={{
          display: '-webkit-box',
          WebkitLineClamp: PREVIEW_LINES,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-line',
          maxWidth: (theme) => theme.spacing(70),
        }}
      >
        {minute.message}
      </Typography>
    ),
  },
  {
    id: 'updated',
    header: 'Actualizado',
    render: (minute) => (
      <Stack component="span">
        <span>{minute.updatedBy?.displayName ?? 'Sistema'}</span>
        <Typography component="span" variant="caption" color="text.secondary">
          {formatDateTime(minute.updatedAt)}
        </Typography>
      </Stack>
    ),
    sortable: true,
    hideOnMobile: true,
  },
];

type FormState = { open: false } | { open: true; minute: SafetyMinute | null };

/**
 * Pantalla «Minuto de seguridad» (AJ1 HU-AJ1-2, §8.3). La ruta exige
 * `minuto_seguridad.ver` (`admin-routes.ts`); crear, editar y eliminar, su
 * permiso propio. Las acciones de cada fila siguen `editable`/`deletable`, que
 * calcula el servidor. Los filtros Desde/Hasta viven en la URL.
 */
export function SafetyMinutesPage() {
  const can = useCan();
  const canCreate = can(SAFETY_MINUTE_PERMISSIONS.create);
  const canEdit = can(SAFETY_MINUTE_PERMISSIONS.edit);
  const canRemove = can(SAFETY_MINUTE_PERMISSIONS.remove);
  const table = useTableQueryState<FilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    defaultSort: DEFAULT_SORT,
  });
  const minutes = useSafetyMinutes(table.apiQuery);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });
  const [detail, setDetail] = useState<SafetyMinute | null>(null);
  const [toDelete, setToDelete] = useState<SafetyMinute | null>(null);

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

  const hasFilters = Boolean(appliedFrom || appliedTo);

  const rowActions = (minute: SafetyMinute) => {
    const date = formatDisplayDate(minute.displayDate);
    return (
      <>
        <IconButton aria-label={`Ver mensaje del ${date}`} onClick={() => setDetail(minute)}>
          <VisibilityOutlinedIcon />
        </IconButton>
        {canEdit && minute.editable ? (
          <IconButton aria-label={`Editar mensaje del ${date}`} onClick={() => setForm({ open: true, minute })}>
            <EditOutlinedIcon />
          </IconButton>
        ) : null}
        {canRemove && minute.deletable ? (
          <IconButton aria-label={`Eliminar mensaje del ${date}`} onClick={() => setToDelete(minute)}>
            <DeleteOutlineIcon />
          </IconButton>
        ) : null}
      </>
    );
  };

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />
      <AdminListCard
        icon={<HealthAndSafetyOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(minutes.data?.pagination.totalItems, DESCRIPTION, ['mensaje', 'mensajes'])}
        tools={
          <RefreshTool
            busy={minutes.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: safetyMinuteKeys.lists() })}
          />
        }
        toolbar={
          <ListToolbar
            filters={
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
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
              canCreate ? { label: 'Nuevo mensaje', onClick: () => setForm({ open: true, minute: null }) } : undefined
            }
          />
        }
      >
        <DataTable
          label={TITLE}
          columns={COLUMNS}
          rows={minutes.data?.data}
          getRowId={(minute) => minute.id}
          totalItems={minutes.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={minutes.isPending}
          isFetching={minutes.isFetching}
          errorMessage={minutes.isError ? describeApiError(minutes.error).message : null}
          onRetry={() => void minutes.refetch()}
          emptyTitle="No hay mensajes"
          emptyDescription={
            hasFilters ? 'Prueba con otras fechas.' : canCreate ? 'Programa el primero con «Nuevo mensaje».' : undefined
          }
          cardsBelow="sm"
          rowActions={rowActions}
        />
      </AdminListCard>
      <SafetyMinuteFormDialog
        open={form.open}
        minute={form.open ? form.minute : null}
        onClose={() => setForm({ open: false })}
      />
      <SafetyMinuteDetailDialog minute={detail} onClose={() => setDetail(null)} />
      <SafetyMinuteDeleteDialog minute={toDelete} onClose={() => setToDelete(null)} />
    </>
  );
}
