import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Alert, Box, Card, CardActionArea, Skeleton, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { HOME_MODULE_KEY } from '@/components/layout/menu-navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/use-auth';
import { useHealth } from '@/hooks/use-health';
import { useMenu } from '@/hooks/use-menu';
import { useProfile } from '@/hooks/use-profile';
import type { MenuModule, MenuOptionNode, Profile } from '@/services/access';
import {
  breakpoints,
  duration,
  easing,
  fonts,
  fontSizes,
  gradients,
  layout,
  onBrand,
  shadows,
  soft,
  softDark,
  statHover,
} from '@/theme/tokens';
import { sectionLabelSx } from '@/theme/typography';

const DATA_SCOPE_LABELS: Record<Profile['dataScope'], string> = {
  OWN: 'Propios',
  TEAM: 'Equipo',
  COUNTRY: 'País',
  ORGANIZATION: 'Organización',
};

const MORNING_END_HOUR = 12;
const AFTERNOON_END_HOUR = 19;

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < MORNING_END_HOUR) {
    return 'Buenos días';
  }
  return hour < AFTERNOON_END_HOUR ? 'Buenas tardes' : 'Buenas noches';
}

function formatToday(date: Date): string {
  const text = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface QuickAccessEntry {
  option: MenuOptionNode;
  module: MenuModule;
}

/** Opciones navegables del menú del usuario, sin el propio panel. */
function quickAccessEntries(modules: readonly MenuModule[]): QuickAccessEntry[] {
  const collect = (module: MenuModule, options: readonly MenuOptionNode[]): QuickAccessEntry[] =>
    options.flatMap((option) => [
      ...(option.path && option.path !== '/' ? [{ option, module }] : []),
      ...collect(module, option.children),
    ]);
  return modules.flatMap((module) => collect(module, module.options));
}

type StatTone = 'brand' | 'brandSoft' | 'plain';

interface StatCardProps {
  tone: StatTone;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  foot: ReactNode;
}

/** Sólo con ratón y sin movimiento reducido: el `@media (hover: hover)` del prototipo. */
const HOVER_MOTION = '@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/**
 * `.stat-card` del prototipo: ficha de icono, etiqueta en versalitas, valor grande y pie.
 *
 * Al pasar el ratón, igual que allí: un reflejo diagonal barre la tarjeta, el
 * icono crece y gira un poco, el valor se compacta y, desde `lg`, la tarjeta se
 * eleva con más sombra. Con movimiento reducido o en táctil no hay nada de eso.
 */
function StatCard({ tone, icon, label, value, foot }: StatCardProps) {
  const onGradient = tone !== 'plain';

  return (
    <Card
      component="section"
      aria-label={label}
      sx={(theme) => ({
        p: 2.25,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: `transform ${duration.hover}ms ease, box-shadow ${duration.hover}ms ease`,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage: gradients.statSheen,
          transform: 'translateX(-130%)',
          transition: `transform ${duration.statSheen}ms ${easing.out}`,
          pointerEvents: 'none',
        },
        '& [data-stat-icon]': {
          transition: `transform ${duration.statReact}ms ${easing.out}, box-shadow ${duration.statReact}ms ease`,
        },
        '& [data-stat-value]': { transition: `letter-spacing ${duration.statReact}ms ${easing.out}` },
        [HOVER_MOTION]: {
          '&:hover::after': { transform: 'translateX(130%)' },
          '&:hover [data-stat-icon]': { transform: statHover.iconTransform },
          '&:hover [data-stat-value]': { letterSpacing: statHover.valueLetterSpacing },
          [`@media (min-width: ${breakpoints.lg}px)`]: {
            '&:hover': {
              transform: `translateY(-${statHover.lift}px)`,
              boxShadow: shadows[theme.palette.mode].md,
            },
          },
        },
        ...(onGradient
          ? {
              border: 0,
              color: 'common.white',
              backgroundImage: tone === 'brand' ? gradients.brand : gradients.brandSoft,
            }
          : {}),
      })}
    >
      <Box
        aria-hidden="true"
        data-stat-icon=""
        sx={(theme) => ({
          width: layout.statIconSize,
          height: layout.statIconSize,
          borderRadius: `${layout.radiusIcon}px`,
          display: 'grid',
          placeItems: 'center',
          mb: 1.5,
          color: onGradient ? 'common.white' : 'primary.main',
          bgcolor: onGradient
            ? onBrand.iconTile
            : theme.palette.mode === 'dark'
              ? softDark.brand
              : soft.brand,
        })}
      >
        {icon}
      </Box>
      <Typography
        sx={{ ...sectionLabelSx, color: onGradient ? onBrand.textMuted : 'text.secondary' }}
      >
        {label}
      </Typography>
      <Typography
        data-stat-value=""
        sx={{
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: fontSizes.statValue,
          lineHeight: 1.2,
          my: 0.5,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
      <Typography
        sx={{ fontSize: fontSizes.small, color: onGradient ? onBrand.textMuted : 'text.secondary' }}
      >
        {foot}
      </Typography>
    </Card>
  );
}

function HeroCard({
  firstName,
  optionCount,
  moduleCount,
}: {
  firstName: string;
  optionCount?: number;
  moduleCount?: number;
}) {
  const now = new Date();

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
        <time dateTime={now.toISOString().slice(0, 10)}>{formatToday(now)}</time>
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
        {firstName ? `${greetingFor(now)}, ${firstName}.` : `${greetingFor(now)}.`}
      </Typography>

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

function StatsGrid({ profile }: { profile: ReturnType<typeof useProfile> }) {
  if (profile.isError) {
    return (
      <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
        No se pudo cargar tu perfil. Recarga la página para intentarlo de nuevo.
      </Alert>
    );
  }

  if (profile.isPending) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rounded"
            sx={{
              height: '100%',
              minHeight: (theme) => theme.spacing(20),
              borderRadius: `${layout.radius}px`,
            }}
          />
        ))}
      </>
    );
  }

  const { roles, permissions, teams, dataScope } = profile.data;

  return (
    <>
      <StatCard
        tone="brand"
        icon={<BadgeOutlinedIcon />}
        label="Roles asignados"
        value={roles.length}
        foot={roles.length > 0 ? roles.join(', ') : 'Sin roles asignados'}
      />
      <StatCard
        tone="brandSoft"
        icon={<VerifiedUserOutlinedIcon />}
        label="Permisos efectivos"
        value={permissions.length}
        foot="Resueltos en el servidor a partir de tus roles"
      />
      <StatCard
        tone="plain"
        icon={<PublicOutlinedIcon />}
        label="Alcance de datos"
        value={DATA_SCOPE_LABELS[dataScope]}
        foot="El más amplio entre tus roles"
      />
      <StatCard
        tone="plain"
        icon={<GroupsOutlinedIcon />}
        label="Equipos"
        value={teams.length}
        foot={
          teams.length > 0
            ? teams.map((team) => team.name).join(', ')
            : 'No perteneces a ningún equipo'
        }
      />
    </>
  );
}

function QuickAccess({ menu }: { menu: ReturnType<typeof useMenu> }) {
  let content: ReactNode;

  if (menu.isPending) {
    content = Array.from({ length: 4 }).map((_, index) => (
      <Skeleton
        key={index}
        variant="rounded"
        sx={{ height: (theme) => theme.spacing(9.5), borderRadius: `${layout.radius}px` }}
      />
    ));
  } else if (menu.isError) {
    content = (
      <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
        No se pudo cargar tu menú. Recarga la página para intentarlo de nuevo.
      </Alert>
    );
  } else {
    const entries = quickAccessEntries(menu.data);
    content =
      entries.length === 0 ? (
        <Typography color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
          Todavía no tienes opciones asignadas. Pide acceso al administrador del sistema.
        </Typography>
      ) : (
        entries.map(({ option, module }) => (
          <Card key={option.id}>
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
                  bgcolor: theme.palette.mode === 'dark' ? softDark.brand : soft.brand,
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
        ))
      );
  }

  return (
    <Box component="section" aria-labelledby="home-quick-access" sx={{ mt: 3 }}>
      <Typography
        id="home-quick-access"
        component="h2"
        sx={{ ...sectionLabelSx, color: 'text.secondary', mb: 1.5 }}
      >
        Accesos rápidos
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
            xl: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        {content}
      </Box>
    </Box>
  );
}

/**
 * Panel de control: estilo del prototipo (saludo con fecha, tarjetas de
 * indicador y accesos) con datos reales únicamente: la sesión, el perfil
 * (`GET /me`) y el menú concedido (`GET /me/menu`). No hay KPIs de negocio
 * inventados (decisión del responsable, 2026-10-09).
 */
export function HomePage() {
  const { user } = useAuth();
  const health = useHealth();
  const profile = useProfile();
  const menu = useMenu();

  const firstName =
    (profile.data?.displayName ?? user?.displayName ?? '').trim().split(' ')[0] ?? '';
  const entries = menu.data ? quickAccessEntries(menu.data) : undefined;
  const moduleCount = entries ? new Set(entries.map((entry) => entry.module.key)).size : undefined;

  return (
    <>
      <PageHeader
        title="Panel de control"
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Panel de control' }]}
      />

      {health.isError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No se pudo contactar al servidor. Algunos datos pueden no estar disponibles.
          {health.error.correlationId ? ` (ID de correlación ${health.error.correlationId})` : ''}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: '1.45fr 1fr 1fr' },
          gridAutoRows: 'minmax(min-content, auto)',
          '& > :first-of-type': {
            gridColumn: { sm: '1 / -1', lg: 'auto' },
            gridRow: { lg: 'span 2' },
          },
        }}
      >
        <HeroCard firstName={firstName} optionCount={entries?.length} moduleCount={moduleCount} />
        <StatsGrid profile={profile} />
      </Box>

      <QuickAccess menu={menu} />
    </>
  );
}
