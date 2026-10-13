import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import { Alert, Button, Link, Stack } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { DetailList, EntityDrawer } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import type { ActivityDetail } from '../../activities/activities.api';
import { useActivity } from '../../activities/activities.queries';
import { ActivityCompletionDialog } from '../../activities/components/ActivityCompletionDialog';
import { AttachmentCount } from '../../common/AttachmentCount';
import { projectDetailPath, type AgendaItem } from '../../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import { COMMERCIAL_RELATED_PERMISSIONS } from '../../common/commercial-activity.permissions';
import { formatDateTime } from '../../common/date-time';
import { StatusChip } from '../../common/StatusChip';
import { isOpenAgendaActivity } from '../agenda-format';

export interface AgendaEventDrawerProps {
  /** Evento abierto; `null` = cerrado. */
  item: AgendaItem | null;
  onClose: () => void;
  /** Tras completar la actividad desde el panel. */
  onCompleted: (activity: ActivityDetail) => void;
}

function dateText(item: AgendaItem): string {
  return item.endDate ? `${formatDateTime(item.date)} – ${formatDateTime(item.endDate)}` : formatDateTime(item.date);
}

function SummaryContent({ item, onCompleted }: { item: AgendaItem; onCompleted: (activity: ActivityDetail) => void }) {
  const canSeeCustomers = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewCustomers);
  const openActivity = isOpenAgendaActivity(item);
  // Las operaciones permitidas solo las conoce el detalle (`allowedActions`, AC-04.57).
  const detail = useActivity(openActivity ? item.id : undefined);
  const [completing, setCompleting] = useState(false);
  const canComplete = openActivity && detail.data?.allowedActions.includes('COMPLETE') === true;

  const items = [
    { label: 'Fecha y hora', value: dateText(item), wide: true },
    { label: 'Tipo', value: item.typeLabel },
    { label: 'Responsable', value: item.owner.displayName },
    {
      label: 'Cliente',
      value: canSeeCustomers ? (
        <Link component={RouterLink} to={customerDetailPath(item.customer.id)}>
          {item.customer.legalName}
        </Link>
      ) : (
        item.customer.legalName
      ),
    },
    {
      label: 'Proyecto',
      value: item.project ? (
        <Link component={RouterLink} to={projectDetailPath(item.project.id)}>
          {item.project.name}
        </Link>
      ) : (
        '—'
      ),
    },
    {
      label: 'Estado',
      value: <StatusChip label={item.status.label} group={item.status.group} isRescheduled={item.isRescheduled} isUnregistered={item.isUnregistered} />,
    },
    { label: 'Adjuntos', value: <AttachmentCount count={item.attachmentCount} /> },
    { label: 'Asunto', value: item.subject, wide: true },
    ...(item.hasReminder ? [{ label: 'Recordatorio', value: 'Con recordatorio (se muestra en la agenda; no se envían notificaciones).', wide: true }] : []),
  ];

  return (
    <>
      <DetailList items={items} />
      {openActivity && detail.isError ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {`No se pudo comprobar si puedes completar esta actividad. ${withReference(describeApiError(detail.error, COMMERCIAL_ERROR_MESSAGES))}`}
        </Alert>
      ) : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ mt: 3 }}>
        <Button component={RouterLink} to={item.detailPath} endIcon={<ArrowForwardOutlinedIcon />}>
          Ver detalle
        </Button>
        {canComplete ? (
          <Button variant="outlined" startIcon={<TaskAltOutlinedIcon />} onClick={() => setCompleting(true)}>
            Completar
          </Button>
        ) : null}
      </Stack>
      <ActivityCompletionDialog
        open={completing}
        activity={completing ? { id: item.id, code: item.code, subject: item.subject } : null}
        onClose={() => setCompleting(false)}
        onCompleted={(saved) => {
          setCompleting(false);
          onCompleted(saved);
        }}
      />
    </>
  );
}

/**
 * Panel de resumen de un evento de la agenda (04 §E.2, AC-04.4): fecha y hora,
 * tipo, responsable, cliente, proyecto, estado, asunto, adjuntos y recordatorio,
 * con "Ver detalle" (`detailPath`). En una actividad abierta ofrece
 * "Completar" solo si el backend lo permite (`allowedActions`), con el mismo
 * diálogo que la bandeja; la agenda se refresca sola (invalidación global).
 */
export function AgendaEventDrawer({ item, onClose, onCompleted }: AgendaEventDrawerProps) {
  // Se conserva el último evento mientras el panel se cierra, para que no se vacíe durante la salida.
  const [shown, setShown] = useState<AgendaItem | null>(item);
  if (item && item !== shown) {
    setShown(item);
  }

  return (
    <EntityDrawer open={item !== null} onClose={onClose} title={shown?.subject ?? ''} subtitle={shown ? `${shown.typeLabel} · ${shown.code}` : undefined}>
      {shown ? <SummaryContent key={`${shown.kind}-${shown.id}`} item={shown} onCompleted={onCompleted} /> : null}
    </EntityDrawer>
  );
}
