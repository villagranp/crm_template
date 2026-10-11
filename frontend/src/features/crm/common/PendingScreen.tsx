import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import { Card } from '@mui/material';

import { EmptyState } from '@/components/data';

export interface PendingScreenProps {
  description?: string;
}

/** Marcador temporal de una pantalla del CRM que todavía no se ha construido. */
export function PendingScreen({ description = 'Esta pantalla está en desarrollo.' }: PendingScreenProps) {
  return (
    <Card>
      <EmptyState icon={<ConstructionOutlinedIcon fontSize="large" />} title="En construcción" description={description} />
    </Card>
  );
}
