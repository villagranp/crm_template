import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Box, Button, Card, CardActions, CardContent, Link, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { formatCalendarDate, opportunityDetailPath, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';
import type { ListQuery } from '@/lib/query-keys';

import type { OpportunityListItem, OpportunityStage } from '../opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES } from '../opportunities.errors';
import { useBoardColumn } from '../opportunities.queries';
import { lacksNextAction } from '../opportunity-format';

import { EstimateText } from './EstimateText';

export interface OpportunityBoardProps {
  /** Columnas (etapas de `stage-summary`, ya en orden `metadata.order`) con su conteo. */
  columns: readonly { stage: OpportunityStage; count: number }[];
  /** Filtros de la lista (sin `stageId`, paginación ni orden): cada columna añade su etapa. */
  filters: ListQuery;
  onChangeStage: (opportunity: OpportunityListItem) => void;
}

function OpportunityCard({ opportunity, onChangeStage }: { opportunity: OpportunityListItem; onChangeStage: () => void }) {
  const missingAction = lacksNextAction(opportunity);
  return (
    <Card variant="outlined" component="article" aria-label={`Oportunidad ${opportunity.code}`}>
      <CardContent sx={{ pb: 1 }}>
        <Stack spacing={0.5}>
          <Link component={RouterLink} to={opportunityDetailPath(opportunity.id)} variant="subtitle2" underline="hover">
            {opportunity.code}
          </Link>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {opportunity.project.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {opportunity.customer.legalName}
          </Typography>
          <EstimateText opportunity={opportunity} />
          <Typography variant="caption" color="text.secondary">
            {`Asesor: ${opportunity.owner.displayName}`}
          </Typography>
          {missingAction ? (
            <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WarningAmberOutlinedIcon fontSize="inherit" aria-hidden />
              Sin siguiente acción
            </Typography>
          ) : opportunity.nextAction ? (
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
              {opportunity.nextActionDate
                ? `Siguiente: ${opportunity.nextAction} (${formatCalendarDate(opportunity.nextActionDate)})`
                : `Siguiente: ${opportunity.nextAction}`}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
      {opportunity.capabilities.canEdit ? (
        <CardActions sx={{ pt: 0 }}>
          <Button size="small" variant="text" startIcon={<SwapHorizOutlinedIcon />} onClick={onChangeStage} aria-label={`Cambiar etapa de ${opportunity.code}`}>
            Cambiar etapa
          </Button>
        </CardActions>
      ) : null}
    </Card>
  );
}

function BoardColumn({ stage, count, filters, onChangeStage }: { stage: OpportunityStage; count: number; filters: ListQuery; onChangeStage: OpportunityBoardProps['onChangeStage'] }) {
  const titleId = useId();
  const column = useBoardColumn({ ...filters, stageId: stage.id });
  const items = column.data?.pages.flatMap((page) => page.data) ?? [];

  let content;
  if (column.isPending) {
    content = (
      <Stack role="status" aria-label={`Cargando ${stage.label}`} spacing={1}>
        <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(14) }} />
        <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(14) }} />
      </Stack>
    );
  } else if (column.isError) {
    content = (
      <Stack role="alert" spacing={1}>
        <Typography variant="body2">{withReference(describeApiError(column.error, OPPORTUNITY_ERROR_MESSAGES))}</Typography>
        <Button size="small" variant="outlined" onClick={() => void column.refetch()}>
          Reintentar
        </Button>
      </Stack>
    );
  } else if (items.length === 0) {
    content = (
      <Typography variant="body2" color="text.secondary" role="status">
        Sin oportunidades en esta etapa.
      </Typography>
    );
  } else {
    content = (
      <Stack spacing={1}>
        {items.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} onChangeStage={() => onChangeStage(opportunity)} />
        ))}
        {column.hasNextPage ? (
          <Button size="small" variant="outlined" disabled={column.isFetchingNextPage} onClick={() => void column.fetchNextPage()}>
            {column.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
          </Button>
        ) : null}
      </Stack>
    );
  }

  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      variant="outlined"
      sx={{ flex: '0 0 auto', width: (theme) => theme.spacing(36), maxWidth: '85vw', p: 1.5, bgcolor: 'background.subtle' }}
    >
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
        <Typography id={titleId} variant="subtitle1" component="h2">
          {stage.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" aria-label={`${count} oportunidades`}>
          {count}
        </Typography>
      </Stack>
      {content}
    </Paper>
  );
}

/**
 * Tablero del pipeline (03 §E.7, AC-03.46): una columna por etapa activa en
 * orden `metadata.order`, con el conteo de `stage-summary` y las tarjetas de su
 * etapa paginadas ("Ver más"). El cambio de etapa se hace con la acción de la
 * tarjeta (sin arrastrar: exigiría una librería nueva y un ADR).
 */
export function OpportunityBoard({ columns, filters, onChangeStage }: OpportunityBoardProps) {
  return (
    <Box role="region" aria-label="Tablero de oportunidades" sx={{ overflowX: 'auto', pb: 1 }}>
      <Stack direction="row" spacing={1.5} sx={{ minWidth: 'min-content' }}>
        {columns.map(({ stage, count }) => (
          <BoardColumn key={stage.id} stage={stage} count={count} filters={filters} onChangeStage={onChangeStage} />
        ))}
      </Stack>
    </Box>
  );
}
