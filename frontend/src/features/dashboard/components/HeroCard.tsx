import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { Profile } from '@/services/access';
import type { ApiError } from '@/services/api';
import { fonts, fontSizes, gradients, layout, onBrand } from '@/theme/tokens';

import {
  DATA_SCOPE_LABELS,
  firstNameOf,
  formatClock,
  formatLongDate,
  greetingFor,
} from '../dashboard-format';

/** Refresco del reloj (RN-01.3). */
export const CLOCK_REFRESH_MS = 60_000;

/**
 * Hora actual que se actualiza al cambiar de minuto y después cada 60 s, sin
 * recargar la página (AC-01.1).
 */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const untilNextMinute = CLOCK_REFRESH_MS - (Date.now() % CLOCK_REFRESH_MS);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS);
    }, untilNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  return now;
}

export interface HeroCardProps {
  profile: UseQueryResult<Profile, ApiError>;
  /** Nombre de la sesión, mientras `/me` carga. */
  sessionDisplayName?: string | null;
  /** Opciones y módulos navegables de `/me/menu`; `undefined` mientras carga. */
  optionCount?: number;
  moduleCount?: number;
}

/**
 * Tarjeta de saludo (01 §E.2): fecha larga y hora en vivo, saludo según la
 * hora local, nombre completo, roles y ámbito de `/me`, y el resumen de accesos
 * del menú (texto de siempre).
 */
export function HeroCard({ profile, sessionDisplayName, optionCount, moduleCount }: HeroCardProps) {
  const now = useMinuteClock();
  const displayName = profile.data?.displayName ?? sessionDisplayName ?? '';
  const firstName = firstNameOf(displayName);
  const greeting = greetingFor(now);

  return (
    <Box
      component="section"
      aria-labelledby="home-greeting"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        borderRadius: `${layout.radius}px`,
        p: { xs: 2.75, sm: 4 },
        pr: { xl: 22 },
        color: 'common.white',
        backgroundImage: gradients.hero,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 0.75,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage: onBrand.glow,
          pointerEvents: 'none',
        },
        '& > *': { position: 'relative', zIndex: 1 },
      }}
    >
      <Box
        sx={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.75,
          px: 1.25,
          py: 0.5,
          borderRadius: `${layout.radiusPill}px`,
          bgcolor: onBrand.chip,
          fontSize: fontSizes.small,
          fontWeight: 500,
        }}
      >
        <BoltOutlinedIcon aria-hidden="true" fontSize="small" />
        <time dateTime={now.toISOString()}>
          {formatLongDate(now)} · <span data-testid="home-clock">{formatClock(now)}</span>
        </time>
      </Box>

      <Typography
        id="home-greeting"
        component="h2"
        sx={{
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: fontSizes.heroTitle,
          lineHeight: 1.2,
          my: 0.5,
        }}
      >
        {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
      </Typography>

      {/* Con error de `/me` el aviso lo da "Mi acceso" (un solo mensaje para el mismo fallo). */}
      {profile.isError ? null : profile.isPending ? (
        <Skeleton variant="text" width="60%" sx={{ bgcolor: onBrand.iconTile }} />
      ) : (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
          <Typography sx={{ fontWeight: 600, fontSize: fontSizes.nav, mr: 0.5 }}>
            {profile.data.displayName}
          </Typography>
          {profile.data.roles.map((role) => (
            <Chip
              key={role}
              label={role}
              size="small"
              sx={{ bgcolor: onBrand.chip, color: 'common.white' }}
            />
          ))}
          <Chip
            label={`Ámbito: ${DATA_SCOPE_LABELS[profile.data.dataScope]}`}
            size="small"
            sx={{ bgcolor: onBrand.chip, color: 'common.white' }}
          />
        </Stack>
      )}

      <Typography sx={{ color: onBrand.text, fontSize: fontSizes.nav, maxWidth: '46ch' }}>
        {optionCount === undefined || moduleCount === undefined ? (
          'Estamos cargando tus accesos.'
        ) : (
          <>
            Tienes acceso a <strong>{optionCount}</strong>{' '}
            {optionCount === 1 ? 'opción' : 'opciones'} en <strong>{moduleCount}</strong>{' '}
            {moduleCount === 1 ? 'módulo' : 'módulos'}, según los roles asignados a tu cuenta.
          </>
        )}
      </Typography>

      <InsightsOutlinedIcon
        aria-hidden="true"
        sx={{
          display: { xs: 'none', xl: 'block' },
          position: 'absolute !important',
          right: (theme) => theme.spacing(3),
          bottom: (theme) => theme.spacing(2),
          zIndex: 0,
          fontSize: layout.heroIllustrationSize,
          opacity: 0.35,
        }}
      />
    </Box>
  );
}
