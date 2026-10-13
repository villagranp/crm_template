import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { Button, type ButtonProps } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { usePermission } from '@/hooks/use-permission';

import { planVisitPath } from '../common/commercial-paths';
import { VISIT_PERMISSIONS } from '../common/commercial-activity.permissions';

export interface PlanVisitButtonProps {
  customerId: string;
  projectId?: string;
  variant?: ButtonProps['variant'];
}

/**
 * "Planificar visita" desde una ficha (04 §E.11): abre
 * `/actividad/visitas/nueva?customerId=&projectId=`. Oculto sin `visitas.crear`.
 */
export function PlanVisitButton({ customerId, projectId, variant = 'outlined' }: PlanVisitButtonProps) {
  const navigate = useNavigate();
  const canCreate = usePermission(VISIT_PERMISSIONS.create);

  if (!canCreate) {
    return null;
  }

  return (
    <Button variant={variant} startIcon={<EventAvailableOutlinedIcon />} onClick={() => navigate(planVisitPath({ customerId, projectId }))}>
      Planificar visita
    </Button>
  );
}
