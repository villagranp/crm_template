import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { EmptyState, FilterChips } from '@/components/data';

import { formatDateTime, HISTORY_KIND_LABELS, historyFieldLabel, historyValueText } from '../project-format';
import type { ProjectHistoryEntry, ProjectHistoryKind } from '../projects.api';
import { useProjectHistory } from '../projects.queries';

import { SectionCard, SectionError, SectionLoading } from './SectionCard';

const PAGE_SIZE = 20;

/** Filtros por tipo de la línea de tiempo (03 §E.4 #10). "Datos" agrupa los datos generales y la clasificación. */
const HISTORY_FILTERS: readonly { value: string; label: string; kinds: readonly ProjectHistoryKind[] }[] = [
  { value: '', label: 'Todo', kinds: [] },
  { value: 'PHASE', label: 'Fase', kinds: ['PHASE'] },
  { value: 'STAGE', label: 'Etapa', kinds: ['STAGE'] },
  { value: 'RESULT', label: 'Resultado', kinds: ['RESULT'] },
  { value: 'DATA', label: 'Datos', kinds: ['PROJECT_DATA', 'CLASSIFICATION', 'OPPORTUNITY_DATA'] },
  { value: 'PRODUCT', label: 'Productos', kinds: ['PRODUCT'] },
  { value: 'FORECAST', label: 'Forecast', kinds: ['FORECAST'] },
  { value: 'ATTACHMENT', label: 'Adjuntos', kinds: ['ATTACHMENT'] },
];

function HistoryItem({ entry }: { entry: ProjectHistoryEntry }) {
  return (
    <Box component="li" sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <Chip size="small" variant="outlined" label={HISTORY_KIND_LABELS[entry.kind]} />
        {entry.subject ? (
          <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {entry.subject.label}
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {`${entry.actor?.displayName ?? 'Sistema'} · ${formatDateTime(entry.occurredAt)}`}
        </Typography>
      </Stack>
      {entry.changes.length > 0 ? (
        <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
          {entry.changes.map((change, index) => (
            <Typography component="li" variant="body2" key={`${change.field}-${index}`} sx={{ overflowWrap: 'anywhere' }}>
              {`${historyFieldLabel(change.field)}: ${historyValueText(change.before)} → ${historyValueText(change.after)}`}
            </Typography>
          ))}
        </Box>
      ) : null}
      {entry.comment ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
          {`Comentario: ${entry.comment}`}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Sección 10 · Historial de cambios (03 §E.4, AC-03.13): línea de tiempo
 * paginada en el servidor (más reciente primero) que une fase, etapas,
 * resultados y la auditoría del proyecto y sus hijos, con filtro por tipo
 * (`kind`, repetible por comas).
 */
export function ProjectHistorySection({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const kinds = HISTORY_FILTERS.find((option) => option.value === filter)?.kinds ?? [];
  const history = useProjectHistory(projectId, { page, pageSize: PAGE_SIZE, kind: kinds.length > 0 ? kinds.join(',') : undefined });

  let content;
  if (history.isPending) {
    content = <SectionLoading label="Cargando el historial" rows={4} />;
  } else if (history.isError) {
    content = <SectionError title="No se pudo cargar el historial" error={history.error} onRetry={() => void history.refetch()} />;
  } else if (history.data.data.length === 0) {
    content = (
      <EmptyState
        icon={<HistoryOutlinedIcon />}
        title="Sin cambios registrados"
        description={filter ? 'No hay cambios de este tipo.' : 'Los cambios del proyecto aparecerán aquí.'}
      />
    );
  } else {
    const { totalPages } = history.data.pagination;
    content = (
      <>
        <Box component="ol" aria-label="Línea de tiempo" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {history.data.data.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </Box>
        {totalPages > 1 ? (
          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center" sx={{ mt: 1 }}>
            <Button size="small" variant="text" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Más recientes
            </Button>
            <Typography variant="caption" color="text.secondary">{`Página ${page} de ${totalPages}`}</Typography>
            <Button size="small" variant="text" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Anteriores
            </Button>
          </Stack>
        ) : null}
      </>
    );
  }

  return (
    <SectionCard title="Historial de cambios">
      <Stack spacing={2}>
        <Box className="scroll-x" sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'nowrap', md: 'wrap' }, minWidth: 0 }}>
          <FilterChips
            label="Filtrar el historial por tipo"
            options={HISTORY_FILTERS}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
        </Box>
        {content}
      </Stack>
    </SectionCard>
  );
}
