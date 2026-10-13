import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Box, ButtonBase, Stack, Typography, type Theme } from '@mui/material';
import type { ReactElement } from 'react';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { layout, softTintsFor } from '@/theme/tokens';

import type { ActivityTypeOption } from '../../activities/activities.api';
import { AttachmentCount } from '../../common/AttachmentCount';
import type { AgendaItem, StatusGroup } from '../../common/commercial-activity.api';
import { formatTime } from '../../common/date-time';
import { StatusChip } from '../../common/StatusChip';
import { agendaEventLabel, agendaIconName, agendaTimeRange, STATUS_GROUP_TONE } from '../agenda-format';

export interface AgendaEventButtonProps {
  item: AgendaItem;
  /** Tipos de actividad (para el icono por tipo). */
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  /**
   * `compact`: celdas de Mes y columnas de Semana (hora, icono, asunto, cliente,
   * icono de estado y adjuntos). `full`: vista Día y listas del día, con el
   * `StatusChip` completo, responsable y proyecto.
   */
  variant?: 'compact' | 'full';
}

/** Iconos de estado de la variante compacta: los mismos que `StatusChip`, para que el estado no dependa del color. */
const STATUS_ICON: Record<StatusGroup, { icon: ReactElement; color: string }> = {
  PENDING: { icon: <ScheduleOutlinedIcon fontSize="inherit" aria-hidden />, color: 'info.main' },
  OVERDUE: { icon: <ReportProblemOutlinedIcon fontSize="inherit" aria-hidden />, color: 'error.main' },
  DONE: { icon: <TaskAltOutlinedIcon fontSize="inherit" aria-hidden />, color: 'success.main' },
  CONFIRMED: { icon: <CheckCircleOutlineIcon fontSize="inherit" aria-hidden />, color: 'success.main' },
  CANCELLED: { icon: <DoNotDisturbAltOutlinedIcon fontSize="inherit" aria-hidden />, color: 'text.secondary' },
};

const tint = (group: StatusGroup) => (theme: Theme) => softTintsFor(theme.palette.mode)[STATUS_GROUP_TONE[group]];

/**
 * Un evento de la agenda (visita o actividad) como botón: clic, `Enter` o
 * `Space` abren el panel de resumen. El nombre accesible lleva hora, tipo,
 * asunto, cliente y estado (`agendaEventLabel`); lo visible es su resumen.
 */
export function AgendaEventButton({ item, types, onOpen, variant = 'full' }: AgendaEventButtonProps) {
  const cancelled = item.status.group === 'CANCELLED';
  const subjectSx = { overflowWrap: 'anywhere', textDecoration: cancelled ? 'line-through' : undefined } as const;
  const common = {
    onClick: () => onOpen(item),
    'aria-label': agendaEventLabel(item),
    sx: {
      width: '100%',
      minWidth: 0,
      justifyContent: 'flex-start',
      textAlign: 'left',
      borderRadius: `${layout.radiusSm}px`,
      bgcolor: tint(item.status.group),
      color: 'text.primary',
    },
  } as const;

  if (variant === 'compact') {
    const status = STATUS_ICON[item.status.group];
    return (
      <ButtonBase {...common} sx={{ ...common.sx, alignItems: 'flex-start', gap: 0.5, px: 0.75, py: 0.5 }}>
        <Box component="span" sx={{ display: 'inline-flex', color: status.color, typography: 'body2', pt: 0.25 }}>
          {status.icon}
        </Box>
        <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
          <Typography component="span" variant="caption" noWrap sx={{ display: 'block', fontWeight: 'fontWeightMedium', ...subjectSx }}>
            {formatTime(item.date)} · {item.subject}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {item.customer.legalName}
          </Typography>
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: 'text.secondary', flexShrink: 0 }}>
          <MaterialSymbol name={agendaIconName(item, types)} />
          {item.isRescheduled ? <EventRepeatOutlinedIcon fontSize="inherit" aria-hidden /> : null}
          {item.attachmentCount > 0 ? <AttachFileOutlinedIcon fontSize="inherit" aria-hidden /> : null}
        </Box>
      </ButtonBase>
    );
  }

  return (
    <ButtonBase {...common} sx={{ ...common.sx, alignItems: 'flex-start', gap: 1.5, p: 1.5 }}>
      <Box component="span" sx={{ display: 'inline-flex', color: 'primary.main', pt: 0.25 }}>
        <MaterialSymbol name={agendaIconName(item, types)} />
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 'fontWeightMedium' }}>
          {agendaTimeRange(item)} · {item.typeLabel}
        </Typography>
        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 'fontWeightMedium', ...subjectSx }}>
          {item.subject}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
          {item.customer.legalName}
          {item.project ? ` · ${item.project.name}` : ''}
        </Typography>
        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
          {item.owner.displayName}
        </Typography>
        <Stack component="span" direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }}>
          <StatusChip label={item.status.label} group={item.status.group} isRescheduled={item.isRescheduled} isUnregistered={item.isUnregistered} />
          {item.attachmentCount > 0 ? (
            <Typography component="span" variant="caption" color="text.secondary">
              <AttachmentCount count={item.attachmentCount} />
            </Typography>
          ) : null}
          {item.hasReminder ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, typography: 'caption', color: 'text.secondary' }}>
              <NotificationsNoneOutlinedIcon fontSize="inherit" aria-hidden />
              Recordatorio
            </Box>
          ) : null}
        </Stack>
      </Box>
    </ButtonBase>
  );
}
