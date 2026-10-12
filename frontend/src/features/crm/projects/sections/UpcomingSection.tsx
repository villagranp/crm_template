import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { Box, Stack, Typography } from '@mui/material';

import { EmptyState } from '@/components/data';

import { SectionCard } from './SectionCard';

export interface UpcomingFigure {
  label: string;
  value: number;
}

export interface UpcomingSectionProps {
  title: string;
  description: string;
  /** Conteos que ya trae la ficha (`summary`), sin peticiones propias. */
  figures?: readonly UpcomingFigure[];
}

/**
 * Sección de la ficha cuyo contenido llega con la etapa siguiente del Módulo 3
 * (oportunidades, resultados y forecast, E3b). Muestra un estado informativo y,
 * si los hay, los conteos del resumen de la ficha; no llama a ningún endpoint.
 */
export function UpcomingSection({ title, description, figures = [] }: UpcomingSectionProps) {
  return (
    <SectionCard title={title}>
      <Stack spacing={2}>
        {figures.length > 0 ? (
          <Box component="dl" aria-label={`Resumen de ${title.toLowerCase()}`} sx={{ m: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {figures.map((figure) => (
              <Box key={figure.label}>
                <Typography component="dt" variant="caption" color="text.secondary">
                  {figure.label}
                </Typography>
                <Typography component="dd" variant="h6" sx={{ m: 0 }}>
                  {figure.value}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
        <EmptyState icon={<HourglassEmptyOutlinedIcon />} title="Disponible próximamente" description={description} />
      </Stack>
    </SectionCard>
  );
}
