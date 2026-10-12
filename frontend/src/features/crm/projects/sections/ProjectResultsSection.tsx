import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { Alert, Box, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo, useState } from 'react';

import { DataTable, DEFAULT_PAGE_SIZE, DetailList, EmptyState, EntityDialog, type DataTableColumn } from '@/components/data';
import { formatPercent } from '@/features/crm/common/decimal';
import {
  OPPORTUNITY_ERROR_MESSAGES,
  OpportunityHistoryPanel,
  OutcomeChip,
  ResultEditDialog,
  StageChip,
  useOpportunity,
  useOpportunityFormOptions,
  useProjectOpportunities,
  type OpportunityListItem,
  type OutcomeOption,
} from '@/features/crm/opportunities';
import { describeApiError } from '@/lib/api-error-view';

import { formatCalendarDate, formatDateTime, orDash } from '../project-format';
import type { ProjectDetail } from '../projects.api';
import { withReference } from '../projects.errors';

import { SectionCard } from './SectionCard';

const CLOSED_QUERY = { status: 'CLOSED' } as const;
const DEFAULT_SORT = { field: 'updatedAt', direction: 'desc' } as const;

function columnsFor(outcomes: readonly OutcomeOption[] | undefined): DataTableColumn<OpportunityListItem>[] {
  return [
    { id: 'code', header: 'Oportunidad', sortable: true, primary: true, render: (item) => item.code },
    { id: 'stageOrder', header: 'Etapa', sortable: true, hideOnMobile: true, render: (item) => <StageChip stage={item.stage} /> },
    { id: 'result', header: 'Resultado', render: (item) => (item.result ? <OutcomeChip result={item.result} options={outcomes} /> : 'Sin resultado') },
    { id: 'awardedPercent', header: '% adjudicado', align: 'right', render: (item) => (item.result?.awardedPercent ? formatPercent(item.result.awardedPercent) : '—') },
    { id: 'decisionDate', header: 'Fecha de decisión', render: (item) => formatCalendarDate(item.result?.decisionDate) },
  ];
}

/** Detalle del resultado vigente (motivo, comentarios) y su historial (RN-03.53). */
function ResultHistoryDialog({ opportunityId, outcomes, onClose }: { opportunityId: string; outcomes?: readonly OutcomeOption[]; onClose: () => void }) {
  const detail = useOpportunity(opportunityId);
  const result = detail.data?.result;
  return (
    <EntityDialog open onClose={onClose} title="Resultado e historial" subtitle={detail.data ? `${detail.data.code} · ${detail.data.project.name}` : undefined} maxWidth="sm">
      <Stack spacing={2}>
        {detail.isPending ? (
          <Stack role="status" aria-label="Cargando el resultado" spacing={1}>
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </Stack>
        ) : detail.isError ? (
          <Alert severity="error">{withReference(describeApiError(detail.error, OPPORTUNITY_ERROR_MESSAGES))}</Alert>
        ) : result ? (
          <DetailList
            items={[
              { label: 'Resultado', value: <OutcomeChip result={result} options={outcomes} /> },
              { label: 'Fecha de decisión', value: formatCalendarDate(result.decisionDate) },
              { label: 'Motivo', value: result.reason?.label ?? '—' },
              { label: '% adjudicado', value: result.awardedPercent ? formatPercent(result.awardedPercent) : '—' },
              { label: 'Comentarios', value: orDash(result.comments), wide: true },
              { label: 'Registrado por', value: `${result.recordedBy.displayName} · ${formatDateTime(result.recordedAt)}`, wide: true },
            ]}
          />
        ) : (
          <Typography variant="body2">Sin resultado vigente.</Typography>
        )}
        <Typography variant="subtitle2" component="h3">
          Historial del resultado
        </Typography>
        <OpportunityHistoryPanel opportunityId={opportunityId} show="results" outcomes={outcomes} />
      </Stack>
    </EntityDialog>
  );
}

/**
 * Sección 5 · Resultados (03 §E.4, F-18). Resumen por resultado de la ficha
 * (DM-15: los parciales cuentan como ganados y se desglosan) y tabla de las
 * oportunidades cerradas (`?status=CLOSED`): resultado, % adjudicado, fecha de
 * decisión; historial desplegable y "Modificar resultado" con
 * `capabilities.canClose` (RN-03.52).
 */
export function ProjectResultsSection({ project }: { project: ProjectDetail }) {
  const { summary } = project;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>(DEFAULT_SORT);
  const closed = useProjectOpportunities(project.id, { ...CLOSED_QUERY, page, pageSize, sortBy: sort.field, sortOrder: sort.direction });
  const options = useOpportunityFormOptions();
  const outcomes = options.data?.outcomes;
  const columns = useMemo(() => columnsFor(outcomes), [outcomes]);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const figures = [
    { label: 'Ganadas', value: summary.wonOpportunities },
    { label: 'Parciales', value: summary.partialOpportunities },
    { label: 'Perdidas', value: summary.lostOpportunities },
  ];
  const data = closed.data;

  return (
    <SectionCard title="Resultados">
      <Stack spacing={2}>
        <Box component="dl" aria-label="Resumen de resultados" sx={{ m: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {figures.map((figure) => (
            <Box key={figure.label}>
              <Typography component="dt" variant="caption" color="text.secondary">
                {figure.label}
              </Typography>
              <Typography component="dd" variant="h6" sx={{ m: 0 }}>
                {figure.value}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Las parciales cuentan como ganadas y se muestran aparte.
        </Typography>
        {notice ? (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {data && data.pagination.totalItems === 0 ? (
          <EmptyState icon={<EmojiEventsOutlinedIcon />} title="Ninguna oportunidad tiene resultado" description="El resultado se registra al cerrar una oportunidad (Ganado, Parcial o Perdido)." />
        ) : (
          <Box sx={{ mx: { xs: -2, sm: -2.5 } }}>
            <DataTable
              label="Oportunidades cerradas"
              columns={columns}
              rows={data?.data}
              getRowId={(item) => item.id}
              totalItems={data?.pagination.totalItems ?? 0}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                setPage(1);
              }}
              isLoading={closed.isPending}
              isFetching={closed.isFetching}
              errorMessage={closed.isError ? withReference(describeApiError(closed.error, OPPORTUNITY_ERROR_MESSAGES)) : null}
              onRetry={() => void closed.refetch()}
              emptyTitle="Ninguna oportunidad tiene resultado"
              rowActions={(item) => (
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Resultado e historial">
                    <IconButton aria-label={`Resultado e historial de ${item.code}`} onClick={() => setHistoryId(item.id)}>
                      <HistoryOutlinedIcon />
                    </IconButton>
                  </Tooltip>
                  {item.capabilities.canClose && item.result ? (
                    <Tooltip title="Modificar resultado">
                      <IconButton
                        aria-label={`Modificar resultado de ${item.code}`}
                        onClick={() => {
                          setNotice(null);
                          setEditingId(item.id);
                        }}
                      >
                        <FactCheckOutlinedIcon />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </Stack>
              )}
            />
          </Box>
        )}
      </Stack>

      {historyId ? <ResultHistoryDialog opportunityId={historyId} outcomes={outcomes} onClose={() => setHistoryId(null)} /> : null}
      <ResultEditDialog
        open={editingId !== null}
        opportunityId={editingId ?? ''}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          setNotice('Resultado actualizado.');
        }}
      />
    </SectionCard>
  );
}
