import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { pageTitleSx } from '@/theme/typography';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Acciones de la página (botones primarios); van a la derecha en ≥md. */
  actions?: ReactNode;
  /** Tira de indicadores; en móvil scrollea en horizontal con snap. */
  metrics?: ReactNode;
}

/**
 * Encabezado de página del spec: título en mayúsculas, subtítulo, migas y
 * tira de métricas.
 *
 * La tira de métricas es el único elemento que scrollea en X, y lo hace dentro
 * de su propio contenedor: la página nunca scrollea en horizontal.
 */
export function PageHeader({ title, subtitle, breadcrumbs, actions, metrics }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumbs aria-label="Ruta de navegación" sx={{ mb: 0.5 }}>
              {breadcrumbs.map((item, index) =>
                item.to && index < breadcrumbs.length - 1 ? (
                  <Link key={item.label} component={RouterLink} to={item.to} variant="caption" color="text.secondary">
                    {item.label}
                  </Link>
                ) : (
                  <Typography key={item.label} variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                ),
              )}
            </Breadcrumbs>
          ) : null}

          <Typography variant="h1" sx={pageTitleSx}>
            {title}
          </Typography>

          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>

        {actions ? <Stack direction="row" spacing={1}>{actions}</Stack> : null}
      </Stack>

      {metrics ? (
        <Box
          className="scroll-x"
          sx={{
            mt: 2,
            pb: 1,
            display: 'flex',
            gap: 2,
            scrollSnapType: { xs: 'x mandatory', md: 'none' },
            '& > *': { scrollSnapAlign: 'start', flex: { xs: '0 0 80%', sm: '0 0 45%', lg: '1 1 0' } },
          }}
        >
          {metrics}
        </Box>
      ) : null}
    </Box>
  );
}
