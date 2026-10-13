import { Box } from '@mui/material';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';

import type { ActivityTypeRef } from '../activities.api';
import { activityTypeIconName } from '../activity-format';

/** Icono (decorativo, del tamaño del texto) + etiqueta del tipo de actividad. */
export function ActivityTypeLabel({ type }: { type: Pick<ActivityTypeRef, 'code' | 'label'> }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.primary', '& svg': { fontSize: 'inherit', color: 'text.secondary' } }}>
      <MaterialSymbol name={activityTypeIconName(type)} />
      {type.label}
    </Box>
  );
}
