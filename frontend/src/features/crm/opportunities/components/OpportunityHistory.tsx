import { Box, Button, List, ListItem, ListItemText, Skeleton, Stack, Typography } from '@mui/material';

import { EmptyState } from '@/components/data';
import { formatPercent } from '@/features/crm/common/decimal';
import { formatCalendarDate, formatDateTime, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';

import type { OutcomeOption, ResultHistoryItem, StageHistoryItem } from '../opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES } from '../opportunities.errors';
import { useOpportunityHistory } from '../opportunities.queries';
import { outcomeLabel, RESULT_ACTION_LABELS } from '../opportunity-format';

/** Línea de tiempo de etapas (AC-03.47): del más reciente al más antiguo; el alta tiene origen nulo. */
export function StageHistoryList({ items }: { items: readonly StageHistoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Sin cambios de etapa" />;
  }
  return (
    <List dense disablePadding aria-label="Historial de etapas">
      {items.map((item) => (
        <ListItem key={item.id} disableGutters divider alignItems="flex-start">
          <ListItemText
            primary={item.fromStage ? `${item.fromStage.label} → ${item.toStage.label}` : `Alta en ${item.toStage.label}`}
            secondary={
              <>
                <Typography component="span" variant="caption" sx={{ display: 'block' }}>
                  {`${item.changedBy.displayName} · ${formatDateTime(item.changedAt)}`}
                </Typography>
                {item.comment ? (
                  <Typography component="span" variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {item.comment}
                  </Typography>
                ) : null}
              </>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

function resultSummary(item: ResultHistoryItem, outcomes?: readonly OutcomeOption[]): string {
  if (item.action === 'CLEARED' || !item.outcome) {
    return RESULT_ACTION_LABELS[item.action];
  }
  const parts = [`${RESULT_ACTION_LABELS[item.action]}: ${outcomeLabel(item.outcome, outcomes)}`];
  if (item.awardedPercent) parts.push(formatPercent(item.awardedPercent));
  if (item.reason) parts.push(item.reason.label);
  if (item.decisionDate) parts.push(`decisión ${formatCalendarDate(item.decisionDate)}`);
  return parts.join(' · ');
}

/** Historial de resultados (RN-03.53): registrado, modificado o anulado al reabrir. */
export function ResultHistoryList({ items, outcomes }: { items: readonly ResultHistoryItem[]; outcomes?: readonly OutcomeOption[] }) {
  if (items.length === 0) {
    return <EmptyState title="Sin resultados registrados" />;
  }
  return (
    <List dense disablePadding aria-label="Historial de resultados">
      {items.map((item) => (
        <ListItem key={item.id} disableGutters divider alignItems="flex-start">
          <ListItemText
            primary={resultSummary(item, outcomes)}
            secondary={
              <>
                <Typography component="span" variant="caption" sx={{ display: 'block' }}>
                  {`${item.changedBy.displayName} · ${formatDateTime(item.changedAt)}`}
                </Typography>
                {item.comments ? (
                  <Typography component="span" variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {item.comments}
                  </Typography>
                ) : null}
              </>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

export interface OpportunityHistoryPanelProps {
  opportunityId: string;
  /** Qué historial mostrar. */
  show: 'stages' | 'results';
  outcomes?: readonly OutcomeOption[];
}

/** Historial de una oportunidad (`GET /opportunities/{id}/history`) con sus estados de carga y error. */
export function OpportunityHistoryPanel({ opportunityId, show, outcomes }: OpportunityHistoryPanelProps) {
  const history = useOpportunityHistory(opportunityId);
  if (history.isPending) {
    return (
      <Stack role="status" aria-label="Cargando el historial" spacing={1}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </Stack>
    );
  }
  if (history.isError) {
    return (
      <Box role="alert">
        <Typography variant="body2" sx={{ mb: 1 }}>
          {withReference(describeApiError(history.error, OPPORTUNITY_ERROR_MESSAGES))}
        </Typography>
        <Button size="small" variant="outlined" onClick={() => void history.refetch()}>
          Reintentar
        </Button>
      </Box>
    );
  }
  return show === 'stages' ? <StageHistoryList items={history.data.stages} /> : <ResultHistoryList items={history.data.results} outcomes={outcomes} />;
}
