import { Alert, Box, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { AccessSummary } from '@/features/dashboard/components/AccessSummary';
import { AlertsPanel } from '@/features/dashboard/components/AlertsPanel';
import { HeroCard } from '@/features/dashboard/components/HeroCard';
import { KpiGrid } from '@/features/dashboard/components/KpiGrid';
import { QuickAccess } from '@/features/dashboard/components/QuickAccess';
import { RecentActivityPanel } from '@/features/dashboard/components/RecentActivityPanel';
import { UpcomingVisitsList } from '@/features/dashboard/components/UpcomingVisitsList';
import { useDashboardAccess } from '@/features/dashboard/dashboard.queries';
import { menuEntries } from '@/features/dashboard/quick-access';
import { useAuth } from '@/hooks/use-auth';
import { useHealth } from '@/hooks/use-health';
import { useMenu } from '@/hooks/use-menu';
import { useProfile } from '@/hooks/use-profile';

type Area = 'hero' | 'mine' | 'kpis' | 'alerts' | 'activity' | 'access';

/** Orden en una columna (`xs`): Hero, Alertas, Indicadores, Actividad, Accesos, Mi acceso (01 §E.1). */
const MOBILE_ORDER: readonly Area[] = ['hero', 'alerts', 'kpis', 'activity', 'access', 'mine'];

/**
 * `grid-template-areas` de la disposición de 01 §E.1 con sólo los bloques
 * presentes (un bloque sin permiso no deja hueco).
 */
function gridAreas(present: ReadonlySet<Area>) {
  const rows = (lines: (Area | Area[])[]) =>
    lines
      .map((line) =>
        Array.isArray(line)
          ? line.filter((area) => present.has(area))
          : present.has(line)
            ? [line]
            : [],
      )
      .filter((line) => line.length > 0)
      .map((line) => `"${line.length === 1 ? `${line[0]} ${line[0]}` : line.join(' ')}"`)
      .join(' ');

  return {
    xs: MOBILE_ORDER.filter((area) => present.has(area))
      .map((area) => `"${area}"`)
      .join(' '),
    lg: rows([['hero', 'mine'], 'kpis', ['alerts', 'activity'], 'access']),
  };
}

function GridArea({ area, children }: { area: Area; children: ReactNode }) {
  return <Box sx={{ gridArea: area, minWidth: 0 }}>{children}</Box>;
}

/**
 * Panel de control (01 §E, F-01…F-04): saludo con hora en vivo, "Mi acceso",
 * indicadores K1–K9, alertas y pendientes, próximas visitas, actividad
 * reciente y accesos, todo con datos reales.
 *
 * Cada bloque se pinta y se consulta sólo con el permiso de su fuente
 * (RN-01.4) y falla por su cuenta (RN-01.8). Sin ningún permiso de fuente
 * comercial: Hero, "Mi acceso", accesos y el aviso de RN-01.7, sin peticiones
 * a `/dashboard/*`. Ocultar es experiencia de usuario: el backend vuelve a
 * exigir cada permiso y filtra por ámbito.
 */
export function HomePage() {
  const { user } = useAuth();
  const health = useHealth();
  const profile = useProfile();
  const menu = useMenu();
  const access = useDashboardAccess();

  const entries = menu.data ? menuEntries(menu.data) : undefined;
  const moduleCount = entries ? new Set(entries.map((entry) => entry.module.key)).size : undefined;
  const showActivity = access.visits || access.recentActivity;

  const present = new Set<Area>(['hero', 'mine', 'kpis', 'access']);
  if (access.alerts) {
    present.add('alerts');
  }
  if (showActivity) {
    present.add('activity');
  }
  const areas = gridAreas(present);

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
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gridTemplateAreas: areas,
        }}
      >
        <GridArea area="hero">
          <HeroCard
            profile={profile}
            sessionDisplayName={user?.displayName}
            optionCount={entries?.length}
            moduleCount={moduleCount}
          />
        </GridArea>

        <GridArea area="mine">
          <AccessSummary profile={profile} />
        </GridArea>

        <GridArea area="kpis">
          <KpiGrid access={access} />
        </GridArea>

        {access.alerts ? (
          <GridArea area="alerts">
            <AlertsPanel />
          </GridArea>
        ) : null}

        {showActivity ? (
          <GridArea area="activity">
            <Stack spacing={2}>
              {access.visits ? <UpcomingVisitsList /> : null}
              {access.recentActivity ? <RecentActivityPanel access={access} /> : null}
            </Stack>
          </GridArea>
        ) : null}

        <GridArea area="access">
          <QuickAccess menu={menu} />
        </GridArea>
      </Box>
    </>
  );
}
