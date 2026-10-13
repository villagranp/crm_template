import { Box, Typography } from '@mui/material';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn, type UseTableQueryStateResult } from '@/components/data';
import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { describeApiError } from '@/lib/api-error-view';

import type { ActivityTypeOption } from '../../activities/activities.api';
import { AttachmentCount } from '../../common/AttachmentCount';
import type { AgendaItem } from '../../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import { useCommercialTimeZones } from '../../common/use-commercial-time-zones';
import { ZonedDateTime } from '../../common/ZonedDateTime';
import { StatusChip } from '../../common/StatusChip';
import { agendaIconName } from '../agenda-format';
import { toAgendaListQuery, type AgendaFilterKey, type AgendaFilterValues } from '../agenda.api';
import { useAgendaList } from '../agenda.queries';

import type { AgendaEmptyContent } from './AgendaCalendar';

export interface AgendaListProps {
  table: UseTableQueryStateResult<AgendaFilterKey>;
  filters: AgendaFilterValues;
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  empty: AgendaEmptyContent;
}

function buildColumns(types: readonly ActivityTypeOption[] | undefined): DataTableColumn<AgendaItem>[] {
  return [
    { id: 'date', header: 'Fecha y hora', sortable: true, render: (item) => <ZonedDateTime value={item.date} /> },
    {
      id: 'kind',
      header: 'Tipo',
      sortable: true,
      render: (item) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main' }}>
            <MaterialSymbol name={agendaIconName(item, types)} />
          </Box>
          {item.typeLabel}
        </Box>
      ),
    },
    {
      id: 'subject',
      header: 'Asunto',
      primary: true,
      render: (item) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'fontWeightMedium',
            overflowWrap: 'anywhere',
            textDecoration: item.status.group === 'CANCELLED' ? 'line-through' : undefined,
          }}
        >
          {item.subject}
        </Typography>
      ),
    },
    { id: 'customerName', header: 'Cliente', sortable: true, render: (item) => item.customer.legalName },
    { id: 'project', header: 'Proyecto', hideOnMobile: true, render: (item) => item.project?.name ?? '—' },
    { id: 'ownerName', header: 'Responsable', sortable: true, hideOnMobile: true, render: (item) => item.owner.displayName },
    {
      id: 'status',
      header: 'Estado',
      sortable: true,
      render: (item) => (
        <StatusChip label={item.status.label} group={item.status.group} isRescheduled={item.isRescheduled} isUnregistered={item.isUnregistered} />
      ),
    },
    { id: 'attachments', header: 'Adjuntos', align: 'right', hideOnMobile: true, render: (item) => <AttachmentCount count={item.attachmentCount} /> },
  ];
}

/**
 * Vista listado de la agenda (04 §E.2, AC-04.2): `GET /agenda` paginado y
 * ordenado en el servidor (fecha, tipo, cliente, responsable, estado), con el
 * rango "Desde"/"Hasta" de los filtros. Tabla desde `md`, tarjetas por debajo
 * (`DataTable`). Cada fila abre el panel de resumen.
 */
export function AgendaList({ table, filters, types, onOpen, empty }: AgendaListProps) {
  const { timeZone } = useCommercialTimeZones();
  const query = useMemo(() => toAgendaListQuery(table.apiQuery, filters, timeZone), [table.apiQuery, filters, timeZone]);
  const agenda = useAgendaList(query);
  const columns = useMemo(() => buildColumns(types), [types]);

  return (
    <DataTable
      label="Agenda"
      columns={columns}
      rows={agenda.data?.data}
      getRowId={(item) => `${item.kind}-${item.id}`}
      totalItems={agenda.data?.pagination.totalItems ?? 0}
      page={table.state.page}
      pageSize={table.state.pageSize}
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      sort={table.state.sort}
      onSortChange={table.setSort}
      isLoading={agenda.isPending}
      isFetching={agenda.isFetching}
      errorMessage={agenda.isError ? withReference(describeApiError(agenda.error, COMMERCIAL_ERROR_MESSAGES)) : null}
      onRetry={() => void agenda.refetch()}
      emptyTitle={empty.title}
      emptyDescription={empty.description}
      emptyIcon={empty.icon}
      emptyAction={empty.action}
      onRowClick={onOpen}
      getRowLabel={(item) => `Abrir el resumen de ${item.code}: ${item.subject}`}
    />
  );
}
