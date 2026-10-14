import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import UpdateDisabledOutlinedIcon from '@mui/icons-material/UpdateDisabledOutlined';
import { Box, Chip, Stack, type ChipProps } from '@mui/material';
import type { ReactElement } from 'react';

import type { StatusGroup } from './commercial-activity.api';

export interface StatusChipProps {
  /** Etiqueta del estado del catálogo (`crm.estado_visita` / `crm.estado_actividad`). */
  label: string;
  /** Grupo derivado de la semántica (RN-04.35). Decide color e icono; el texto siempre acompaña. */
  group: StatusGroup;
  /** Visita "Reprogramada" (D-04.3): etiqueta adicional. */
  isRescheduled?: boolean;
  /** Visita pendiente cuya hora ya pasó (RN-04.22): etiqueta derivada "Sin registrar", no es un estado. */
  isUnregistered?: boolean;
}

const GROUP_STYLE: Record<StatusGroup, { color: ChipProps['color']; icon: ReactElement }> = {
  PENDING: { color: 'info', icon: <ScheduleOutlinedIcon /> },
  OVERDUE: { color: 'error', icon: <ReportProblemOutlinedIcon /> },
  DONE: { color: 'success', icon: <TaskAltOutlinedIcon /> },
  CONFIRMED: { color: 'success', icon: <CheckCircleOutlineIcon /> },
  CANCELLED: { color: 'default', icon: <DoNotDisturbAltOutlinedIcon /> },
};

/**
 * Estado de una visita o actividad (04 §E.2, RN-04.35). El color nunca es el
 * único indicador (DESIGN-SYSTEM §7): cada grupo lleva icono y texto; un
 * cancelado va tachado y "Vencida" se añade al texto de una actividad abierta
 * vencida. Reutilizable en listados, detalle, agenda y seguimiento.
 */
export function StatusChip({ label, group, isRescheduled = false, isUnregistered = false }: StatusChipProps) {
  const style = GROUP_STYLE[group];
  const text = group === 'OVERDUE' ? `${label} · Vencida` : label;

  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" component="span">
      <Chip
        size="small"
        color={style.color}
        icon={style.icon}
        label={
          group === 'CANCELLED' ? (
            <Box component="span" sx={{ textDecoration: 'line-through' }}>
              {text}
            </Box>
          ) : (
            text
          )
        }
      />
      {isRescheduled ? <Chip size="small" variant="outlined" color="info" icon={<EventRepeatOutlinedIcon />} label="Reprogramada" /> : null}
      {isUnregistered ? (
        <Chip size="small" variant="outlined" color="warning" icon={<UpdateDisabledOutlinedIcon />} label="Sin registrar" />
      ) : null}
    </Stack>
  );
}
