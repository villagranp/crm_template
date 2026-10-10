import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { fontSizes, layout } from '@/theme/tokens';
import { pageHeaderTitleSx } from '@/theme/typography';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  /**
   * Contexto que acompaña al título en gris y sin mayúsculas
   * (`TÍTULO — contexto`). Opcional.
   */
  context?: string;
  /** Descripción breve; va bajo las migas, en texto secundario. */
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Acciones de la página (botones primarios); van a la derecha desde `md`. */
  actions?: ReactNode;
  /** Tira de indicadores; en móvil scrollea en horizontal con snap. */
  metrics?: ReactNode;
}

/**
 * Margen lateral del shell (`--app-gutter`, lo define `AppShell`). Fuera del
 * shell, como en las pruebas, la variable no existe y el margen es cero.
 */
const gutter = 'var(--app-gutter, 0px)';
const negativeGutter = `calc(${gutter} * -1)`;

/**
 * Encabezado de página (`.page-header` del prototipo): banda blanca bajo el
 * topbar que ocupa todo el ancho del área de contenido, con el título en
 * mayúsculas, el contexto opcional en gris, las migas DEBAJO del título y las
 * acciones a la derecha.
 *
 * La tira de métricas es el único elemento que scrollea en X, y lo hace dentro
 * de su propio contenedor: la página nunca scrollea en horizontal.
 */
export function PageHeader({
  title,
  context,
  subtitle,
  breadcrumbs,
  actions,
  metrics,
}: PageHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        mx: negativeGutter,
        mt: negativeGutter,
        mb: `var(--app-gutter, ${layout.gutterBySize.md}px)`,
        px: gutter,
        py: { xs: 1.75, md: 2 },
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 1.5, md: 3 }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" sx={pageHeaderTitleSx}>
            {title}
            {context ? (
              <Box
                component="span"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 400,
                  textTransform: 'none',
                  letterSpacing: 0,
                }}
              >
                {` — ${context}`}
              </Box>
            ) : null}
          </Typography>

          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumbs
              aria-label="Ruta de navegación"
              sx={{
                mt: 0.25,
                fontSize: fontSizes.small,
                color: 'text.secondary',
                '& .MuiBreadcrumbs-separator': { mx: 0.75, opacity: 0.5 },
              }}
            >
              {breadcrumbs.map((item, index) =>
                item.to && index < breadcrumbs.length - 1 ? (
                  <Link
                    key={item.label}
                    component={RouterLink}
                    to={item.to}
                    color="primary"
                    sx={{ fontSize: 'inherit' }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <Typography
                    key={item.label}
                    component="span"
                    sx={{ fontSize: 'inherit', color: 'text.secondary' }}
                    aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                  >
                    {item.label}
                  </Typography>
                ),
              )}
            </Breadcrumbs>
          ) : null}

          {subtitle ? (
            <Typography sx={{ mt: 0.5, fontSize: fontSizes.small, color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>

        {actions ? (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap' }} useFlexGap>
            {actions}
          </Stack>
        ) : null}
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
            '& > *': {
              scrollSnapAlign: 'start',
              flex: { xs: '0 0 80%', sm: '0 0 45%', lg: '1 1 0' },
            },
          }}
        >
          {metrics}
        </Box>
      ) : null}
    </Box>
  );
}
