import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Link,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { HOME_MODULE_KEY } from '@/components/layout/menu-navigation';
import type { MenuModule } from '@/services/access';
import type { ApiError } from '@/services/api';
import { fontSizes, layout, softTintsFor } from '@/theme/tokens';
import { sectionLabelSx } from '@/theme/typography';

import { menuEntries, quickAccessSelection, type MenuEntry } from '../quick-access';

/** Opciones agrupadas por módulo, en el orden del menú. */
function groupByModule(
  entries: readonly MenuEntry[],
): { module: MenuModule; entries: MenuEntry[] }[] {
  const groups = new Map<string, { module: MenuModule; entries: MenuEntry[] }>();
  for (const entry of entries) {
    const group = groups.get(entry.module.key) ?? { module: entry.module, entries: [] };
    group.entries.push(entry);
    groups.set(entry.module.key, group);
  }
  return [...groups.values()];
}

function QuickAccessCard({ option, module }: MenuEntry) {
  return (
    <Card>
      <CardActionArea
        component={RouterLink}
        to={option.path ?? '/'}
        sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1.5, p: 2, height: '100%' }}
      >
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            width: layout.statIconSize,
            height: layout.statIconSize,
            flexShrink: 0,
            borderRadius: `${layout.radiusIcon}px`,
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            bgcolor: softTintsFor(theme.palette.mode).brand,
          })}
        >
          <MaterialSymbol name={option.icon ?? 'chevron_right'} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600, fontSize: fontSizes.nav }}>
            {option.label}
          </Typography>
          {module.key === HOME_MODULE_KEY ? null : (
            <Typography noWrap sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}>
              {module.label}
            </Typography>
          )}
        </Box>
      </CardActionArea>
    </Card>
  );
}

const CARD_GRID_COLUMNS = {
  xs: '1fr',
  sm: 'repeat(2, minmax(0, 1fr))',
  lg: 'repeat(3, minmax(0, 1fr))',
  xl: 'repeat(4, minmax(0, 1fr))',
} as const;

/**
 * Accesos (01 §E.6, D-01.12): "Accesos rápidos" (hasta 8, CRM primero) y
 * "Todos mis accesos" agrupados por módulo. Todo sale de `GET /me/menu`
 * (ADR-018): el frontend no declara opciones.
 */
export function QuickAccess({ menu }: { menu: UseQueryResult<MenuModule[], ApiError> }) {
  let quick: ReactNode;
  let all: ReactNode = null;

  if (menu.isPending) {
    quick = Array.from({ length: 4 }).map((_, index) => (
      <Skeleton
        key={index}
        variant="rounded"
        sx={{ height: (theme) => theme.spacing(9.5), borderRadius: `${layout.radius}px` }}
      />
    ));
  } else if (menu.isError) {
    quick = (
      <Alert
        severity="error"
        sx={{ gridColumn: '1 / -1' }}
        action={
          <Button color="inherit" size="small" onClick={() => void menu.refetch()}>
            Reintentar
          </Button>
        }
      >
        No se pudo cargar tu menú. Inténtalo de nuevo.
      </Alert>
    );
  } else {
    const entries = menuEntries(menu.data);
    if (entries.length === 0) {
      quick = (
        <Typography color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
          Todavía no tienes opciones asignadas. Pide acceso al administrador del sistema.
        </Typography>
      );
    } else {
      quick = quickAccessSelection(entries).map((entry) => (
        <QuickAccessCard key={entry.option.id} {...entry} />
      ));
      all = (
        <Box component="section" aria-labelledby="home-all-access" sx={{ mt: 3 }}>
          <Typography
            id="home-all-access"
            component="h2"
            sx={{ ...sectionLabelSx, color: 'text.secondary', mb: 1.5 }}
          >
            Todos mis accesos
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: CARD_GRID_COLUMNS }}>
            {groupByModule(entries).map(({ module, entries: moduleEntries }) => (
              <Card
                key={module.key}
                component="section"
                aria-labelledby={`home-module-${module.key}`}
                sx={{ p: 2 }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Box aria-hidden="true" sx={{ color: 'primary.main', display: 'grid' }}>
                    <MaterialSymbol name={module.icon ?? 'chevron_right'} size={20} />
                  </Box>
                  <Typography
                    id={`home-module-${module.key}`}
                    component="h3"
                    sx={{ fontWeight: 600, fontSize: fontSizes.nav }}
                  >
                    {module.label}
                  </Typography>
                </Stack>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {moduleEntries.map(({ option }) => (
                    <Box component="li" key={option.id}>
                      <Link
                        component={RouterLink}
                        to={option.path ?? '/'}
                        underline="hover"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: layout.tap,
                          fontSize: fontSizes.subnav,
                        }}
                      >
                        {option.label}
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box>
      <Box component="section" aria-labelledby="home-quick-access">
        <Typography
          id="home-quick-access"
          component="h2"
          sx={{ ...sectionLabelSx, color: 'text.secondary', mb: 1.5 }}
        >
          Accesos rápidos
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: CARD_GRID_COLUMNS }}>{quick}</Box>
      </Box>
      {all}
    </Box>
  );
}
