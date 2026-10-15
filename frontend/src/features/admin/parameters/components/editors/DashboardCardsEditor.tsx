import { Box, Stack, Typography } from '@mui/material';

import { DashboardCardsList } from '@/features/dashboard/components/DashboardCardsList';
import { BLOCK_LABELS, KPI_LABELS, LOCKED_BLOCK_KEYS } from '@/features/dashboard/dashboard-layout';
import type { DashboardComposition } from '@/services/ui-settings';
import { fontSizes } from '@/theme/tokens';

import { DASHBOARD_CARDS_DEFAULT_NOTE, parseDashboardComposition } from './editor-metadata';
import type { StructuredEditorProps } from './editor-props';

/**
 * `ui.inicio.tarjetas` (editor `dashboard-cards`): composición por defecto del panel de Inicio,
 * con todos los bloques e indicadores (sin filtrar por permiso). Reutiliza la lista reordenable de
 * «Personalizar panel». El servidor valida claves y repeticiones (`422 INVALID_PARAMETER_VALUE`).
 */
export function DashboardCardsEditor({ value, onChange, disabled }: StructuredEditorProps) {
  const composition = parseDashboardComposition(value);
  if (!composition) {
    return null;
  }

  const emit = (next: DashboardComposition) => onChange(JSON.stringify(next));

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontSize: fontSizes.small, color: 'text.secondary' }}>
        {DASHBOARD_CARDS_DEFAULT_NOTE}.
      </Typography>
      <Box component="section" aria-labelledby="default-blocks">
        <Typography id="default-blocks" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
          Bloques
        </Typography>
        <DashboardCardsList
          label="Bloques por defecto"
          items={composition.blocks}
          labels={BLOCK_LABELS}
          lockedKeys={LOCKED_BLOCK_KEYS}
          lockedNote="Mensaje institucional: siempre visible"
          disabled={disabled}
          onChange={(blocks) => emit({ ...composition, blocks })}
        />
      </Box>
      <Box component="section" aria-labelledby="default-kpis">
        <Typography id="default-kpis" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
          Indicadores
        </Typography>
        <DashboardCardsList
          label="Indicadores por defecto"
          items={composition.kpis}
          labels={KPI_LABELS}
          disabled={disabled}
          onChange={(kpis) => emit({ ...composition, kpis })}
        />
      </Box>
    </Stack>
  );
}
