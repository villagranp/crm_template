import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Alert, Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, DEFAULT_PAGE_SIZE, EmptyState, type DataTableColumn } from '@/components/data';
import {
  EstimateText,
  lacksNextAction,
  OPPORTUNITY_ERROR_MESSAGES,
  OpportunityFormDialog,
  OutcomeChip,
  StageChangeDialog,
  StageChip,
  staleRateMessage,
  useOpportunity,
  useOpportunityFormOptions,
  useProjectOpportunities,
  type OpportunityListItem,
  type OpportunityMutationResponse,
  type OutcomeOption,
} from '@/features/crm/opportunities';
import { describeApiError } from '@/lib/api-error-view';

import { formatCalendarDate } from '../project-format';
import { opportunityDetailPath } from '../project-paths';
import type { ProjectDetail } from '../projects.api';
import { withReference } from '../projects.errors';

import { SectionCard } from './SectionCard';

const DEFAULT_SORT = { field: 'opportunityDate', direction: 'desc' } as const;

interface Notice {
  severity: 'success' | 'warning';
  message: string;
}

function columnsFor(outcomes: readonly OutcomeOption[] | undefined): DataTableColumn<OpportunityListItem>[] {
  return [
    { id: 'code', header: 'Código', sortable: true, primary: true, render: (item) => item.code },
    { id: 'stageOrder', header: 'Etapa', sortable: true, render: (item) => <StageChip stage={item.stage} /> },
    { id: 'opportunityDate', header: 'Fecha', sortable: true, hideOnMobile: true, render: (item) => formatCalendarDate(item.opportunityDate) },
    { id: 'owner', header: 'Asesor', hideOnMobile: true, render: (item) => item.owner.displayName },
    { id: 'estimatedAmountUsd', header: 'Estimación', sortable: true, align: 'right', render: (item) => <EstimateText opportunity={item} withTonnage /> },
    {
      id: 'nextActionDate',
      header: 'Siguiente acción',
      sortable: true,
      render: (item) =>
        lacksNextAction(item) ? (
          <Typography variant="caption" color="warning.main" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAmberOutlinedIcon fontSize="inherit" aria-hidden />
            Abierta sin siguiente acción
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
    { id: 'result', header: 'Resultado', hideOnMobile: true, render: (item) => (item.result ? <OutcomeChip result={item.result} options={outcomes} /> : '—') },
  ];
}

/** Abre la edición con el detalle de la oportunidad (la lista no trae descripción ni foto completa). */
function EditOpportunity({ opportunityId, project, onClose, onSaved }: { opportunityId: string; project: ProjectDetail; onClose: () => void; onSaved: (saved: OpportunityMutationResponse) => void }) {
  const detail = useOpportunity(opportunityId);
  return (
    <OpportunityFormDialog
      open={Boolean(detail.data)}
      projectId={project.id}
      projectLabel={`${project.code} · ${project.name}`}
      opportunity={detail.data}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/**
 * Sección 4 · Oportunidades (03 §E.4, F-17, AC-03.48, AC-03.94). Lista de
 * `GET /projects/{id}/opportunities` con etapa, estimación (monto original y
 * equivalente en USD) y siguiente acción (aviso si una abierta no la tiene).
 * Acciones según `capabilities`: nueva oportunidad (del proyecto), editar,
 * cambiar etapa y ver detalle.
 */
export function ProjectOpportunitiesSection({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>(DEFAULT_SORT);
  const opportunities = useProjectOpportunities(project.id, { page, pageSize, sortBy: sort.field, sortOrder: sort.direction });
  const options = useOpportunityFormOptions();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const canCreate = project.capabilities.canCreateOpportunity;
  const columns = useMemo(() => columnsFor(options.data?.outcomes), [options.data]);

  const onSaved = (saved: OpportunityMutationResponse, verb: string) => {
    setCreating(false);
    setEditingId(null);
    const stale = staleRateMessage(saved.warnings);
    setNotice(stale ? { severity: 'warning', message: `Oportunidad ${saved.code} ${verb}. ${stale}` } : { severity: 'success', message: `Oportunidad ${saved.code} ${verb}.` });
  };

  const openCreate = () => {
    setNotice(null);
    setCreating(true);
  };
  const action = canCreate ? (
    <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
      Nueva oportunidad
    </Button>
  ) : null;
  const data = opportunities.data;
  const isEmpty = data && data.pagination.totalItems === 0;

  return (
    <SectionCard title="Oportunidades" actions={action}>
      <Stack spacing={2}>
        {notice ? (
          <Alert severity={notice.severity} role="status" onClose={() => setNotice(null)}>
            {notice.message}
          </Alert>
        ) : null}
        {isEmpty ? (
          <EmptyState
            icon={<HandshakeOutlinedIcon />}
            title="Sin oportunidades"
            description="Registra las oportunidades comerciales del proyecto para seguir su etapa y su estimación."
            action={canCreate ? <Button onClick={openCreate}>Nueva oportunidad</Button> : undefined}
          />
        ) : (
          <Box sx={{ mx: { xs: -2, sm: -2.5 } }}>
            <DataTable
              label="Oportunidades del proyecto"
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
              isLoading={opportunities.isPending}
              isFetching={opportunities.isFetching}
              errorMessage={opportunities.isError ? withReference(describeApiError(opportunities.error, OPPORTUNITY_ERROR_MESSAGES)) : null}
              onRetry={() => void opportunities.refetch()}
              emptyTitle="Sin oportunidades"
              rowActions={(item) => (
                <Stack direction="row" spacing={0.5}>
                  {item.capabilities.canEdit ? (
                    <Tooltip title="Editar">
                      <IconButton
                        aria-label={`Editar ${item.code}`}
                        onClick={() => {
                          setNotice(null);
                          setEditingId(item.id);
                        }}
                      >
                        <EditOutlinedIcon />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {item.capabilities.canEdit ? (
                    <Tooltip title="Cambiar etapa">
                      <IconButton
                        aria-label={`Cambiar etapa de ${item.code}`}
                        onClick={() => {
                          setNotice(null);
                          setChangingId(item.id);
                        }}
                      >
                        <SwapHorizOutlinedIcon />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  <Tooltip title="Ver detalle">
                    <IconButton aria-label={`Ver detalle de ${item.code}`} onClick={() => navigate(opportunityDetailPath(item.id))}>
                      <OpenInNewOutlinedIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
            />
          </Box>
        )}
      </Stack>

      {canCreate ? (
        <OpportunityFormDialog
          open={creating}
          projectId={project.id}
          projectLabel={`${project.code} · ${project.name}`}
          onClose={() => setCreating(false)}
          onSaved={(saved) => onSaved(saved, 'creada')}
        />
      ) : null}
      {editingId ? (
        <EditOpportunity opportunityId={editingId} project={project} onClose={() => setEditingId(null)} onSaved={(saved) => onSaved(saved, 'actualizada')} />
      ) : null}
      <StageChangeDialog
        open={changingId !== null}
        opportunityId={changingId ?? ''}
        onClose={() => setChangingId(null)}
        onChanged={(updated) => {
          setChangingId(null);
          setNotice({ severity: 'success', message: `Oportunidad ${updated.code} en ${updated.stage.label}.` });
        }}
      />
    </SectionCard>
  );
}
