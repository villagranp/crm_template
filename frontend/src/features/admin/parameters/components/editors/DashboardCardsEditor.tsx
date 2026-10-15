import { Box, Stack, Typography } from '@mui/material';

import { AnnouncementRegion, DashboardCardsList } from '@/features/dashboard/components/DashboardCardsList';
import { useAnnouncement } from '@/features/dashboard/components/use-announcement';
import { BLOCK_LABELS, KPI_LABELS, LOCKED_BLOCK_KEYS } from '@/features/dashboard/dashboard-layout';
import { fontSizes } from '@/theme/tokens';

import {
  completeEntries,
  DASHBOARD_CARDS_DEFAULT_NOTE,
  parseDashboardComposition,
  readDashboardEditorLists,
} from './editor-metadata';
import type { StructuredEditorProps } from './editor-props';

export interface DashboardCardsEditorProps extends StructuredEditorProps {
  /** `editorOptions` de `GET /parameters`: claves vigentes y bloques que no se pueden ocultar. */
  editorOptions?: Readonly<Record<string, readonly string[]>> | null;
}

/** Nombre legible de una clave; una clave que la interfaz aún no conoce se muestra tal cual. */
function labelsFor(keys: readonly string[], known: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, known[key] ?? key]));
}

/**
 * `ui.inicio.tarjetas` (editor `dashboard-cards`): composición por defecto del panel de Inicio,
 * con todos los bloques e indicadores (sin filtrar por permiso). Reutiliza la lista reordenable de
 * «Personalizar panel». Las claves vigentes y los bloques bloqueados vienen de `editorOptions`: si
 * el valor sembrado no trae una clave nueva, se muestra al final y visible, y el valor emitido ya
 * la incluye. El servidor valida claves y repeticiones (`422 INVALID_PARAMETER_VALUE`).
 */
export function DashboardCardsEditor({ value, onChange, disabled, editorOptions }: DashboardCardsEditorProps) {
  const { message, announce } = useAnnouncement();
  const composition = parseDashboardComposition(value);
  if (!composition) {
    return null;
  }

  const lists = readDashboardEditorLists(editorOptions, LOCKED_BLOCK_KEYS);
  const blocks = completeEntries(composition.blocks, lists.blocks, lists.lockedVisibleBlocks);
  const kpis = completeEntries(composition.kpis, lists.kpis);
  const emit = (next: { blocks: typeof blocks; kpis: typeof kpis }) =>
    onChange(JSON.stringify({ ...composition, ...next }));

  return (
    <Stack spacing={2.5} sx={{ position: 'relative' }}>
      <Typography sx={{ fontSize: fontSizes.small, color: 'text.secondary' }}>
        {DASHBOARD_CARDS_DEFAULT_NOTE}.
      </Typography>
      <Box component="section" aria-labelledby="default-blocks">
        <Typography id="default-blocks" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
          Bloques
        </Typography>
        <DashboardCardsList
          label="Bloques por defecto"
          items={blocks}
          labels={labelsFor(
            blocks.map((entry) => entry.key),
            BLOCK_LABELS,
          )}
          lockedKeys={lists.lockedVisibleBlocks}
          lockedNote="Mensaje institucional: siempre visible"
          disabled={disabled}
          onAnnounce={announce}
          onChange={(next) => emit({ blocks: next, kpis })}
        />
      </Box>
      <Box component="section" aria-labelledby="default-kpis">
        <Typography id="default-kpis" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
          Indicadores
        </Typography>
        <DashboardCardsList
          label="Indicadores por defecto"
          items={kpis}
          labels={labelsFor(
            kpis.map((entry) => entry.key),
            KPI_LABELS,
          )}
          disabled={disabled}
          onAnnounce={announce}
          onChange={(next) => emit({ blocks, kpis: next })}
        />
      </Box>
      <AnnouncementRegion message={message} />
    </Stack>
  );
}
