import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import { Button, type ButtonProps } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { usePermission } from '@/hooks/use-permission';

import { newActivityPath } from '../activities/activity-format';
import { ACTIVITY_PERMISSIONS } from '../common/commercial-activity.permissions';

export interface NewActivityButtonProps {
  customerId: string;
  projectId?: string;
  opportunityId?: string;
  variant?: ButtonProps['variant'];
}

/**
 * "Nueva actividad" desde una ficha (04 §E.11, F-31): abre el alta con el
 * cliente (y el proyecto u oportunidad) preseleccionados. Oculto sin
 * `actividades.crear`; el backend valida igualmente la preselección.
 */
export function NewActivityButton({ customerId, projectId, opportunityId, variant = 'outlined' }: NewActivityButtonProps) {
  const navigate = useNavigate();
  const canCreate = usePermission(ACTIVITY_PERMISSIONS.create);

  if (!canCreate) {
    return null;
  }

  return (
    <Button variant={variant} startIcon={<AddTaskOutlinedIcon />} onClick={() => navigate(newActivityPath({ customerId, projectId, opportunityId }))}>
      Nueva actividad
    </Button>
  );
}
