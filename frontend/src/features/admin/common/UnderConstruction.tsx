import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import { Card } from '@mui/material';

import { EmptyState } from './EmptyState';

/** Marcador temporal de un área cuya pantalla todavía no se ha construido. */
export function UnderConstruction() {
  return (
    <Card>
      <EmptyState
        icon={<ConstructionOutlinedIcon fontSize="large" />}
        title="En construcción"
        description="Esta pantalla de administración está en desarrollo."
      />
    </Card>
  );
}
