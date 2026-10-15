import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { Alert, Box, Button, Skeleton, Stack, type Theme } from '@mui/material';
import { useState, type ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { AccessSummary } from '@/features/dashboard/components/AccessSummary';
import { AlertsPanel } from '@/features/dashboard/components/AlertsPanel';
import { DashboardCustomizeDialog } from '@/features/dashboard/components/DashboardCustomizeDialog';
import { HeroCard } from '@/features/dashboard/components/HeroCard';
import { KpiGrid } from '@/features/dashboard/components/KpiGrid';
import { QuickAccess } from '@/features/dashboard/components/QuickAccess';
import { RecentActivityPanel } from '@/features/dashboard/components/RecentActivityPanel';
import { SafetyMinuteCard } from '@/features/dashboard/components/SafetyMinuteCard';
import { UpcomingVisitsList } from '@/features/dashboard/components/UpcomingVisitsList';
import {
  buildGridAreas,
  visibleBlockKeys,
  visibleKpiKeys,
  type BlockAvailability,
} from '@/features/dashboard/dashboard-layout';
import { useDashboardAccess, useSafetyMinute } from '@/features/dashboard/dashboard.queries';
import { useAuth } from '@/hooks/use-auth';
import { useHealth } from '@/hooks/use-health';
import { useMenu } from '@/hooks/use-menu';
import { useProfile } from '@/hooks/use-profile';
import {
  useResetDashboardComposition,
  useUiSettings,
  type DashboardBlockKey,
} from '@/services/ui-settings';

const skeletonSx = { height: (theme: Theme) => theme.spacing(20) };

function GridArea({ area, children }: { area: DashboardBlockKey; children: ReactNode }) {
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
  const { settings, isLoaded, isError, isLoading } = useUiSettings();
  // Sólo la primera carga muestra el marcador: si falla, un observador nuevo (p. ej. `KpiGrid`) la
  // reintenta y volvería a ponerla en «cargando», desmontando y montando los bloques en bucle.
  const [settingsSettled, setSettingsSettled] = useState(false);
  if (!settingsSettled && (isLoaded || isError)) {
    setSettingsSettled(true);
  }
  const settingsLoading = !settingsSettled && isLoading;
  const safetyMinute = useSafetyMinute();
  const resetComposition = useResetDashboardComposition();
  const [customizing, setCustomizing] = useState(false);

  const showActivity = access.visits || access.recentActivity;

  // Qué bloques tienen algo que pintar: el permiso y, para el minuto de seguridad, el mensaje de
  // hoy (sin mensaje no se reserva hueco, D-AJ1.3). Indicadores: o el aviso de RN-01.7 o alguno
  // visible y permitido.
  const available: BlockAvailability = {
    'safety-minute': Boolean(safetyMinute.data?.safetyMinute),
    hero: true,
    mine: true,
    kpis:
      !access.anyCommercialSource || visibleKpiKeys(settings.dashboard.kpis, access).length > 0,
    alerts: access.alerts,
    activity: showActivity,
    access: true,
  };
  const order = visibleBlockKeys(settings.dashboard.blocks, available);
  const areas = buildGridAreas(order);

  const blocks: Record<DashboardBlockKey, ReactNode> = {
    'safety-minute': <SafetyMinuteCard />,
    hero: (
      <HeroCard
        profile={profile}
        sessionDisplayName={user?.displayName}
      />
    ),
    mine: <AccessSummary profile={profile} />,
    kpis: <KpiGrid access={access} />,
    alerts: <AlertsPanel />,
    activity: (
      <Stack spacing={2}>
        {access.visits ? <UpcomingVisitsList /> : null}
        {access.recentActivity ? <RecentActivityPanel access={access} /> : null}
      </Stack>
    ),
    access: <QuickAccess menu={menu} />,
  };

  return (
    <>
      <PageHeader
        title="Panel de control"
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Panel de control' }]}
        actions={
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<TuneOutlinedIcon />}
            onClick={() => setCustomizing(true)}
            sx={{ borderColor: 'divider' }}
          >
            Personalizar panel
          </Button>
        }
      />

      {health.isError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No se pudo contactar al servidor. Algunos datos pueden no estar disponibles.
          {health.error.correlationId ? ` (ID de correlación ${health.error.correlationId})` : ''}
        </Alert>
      ) : null}

      {settingsLoading ? (
        // Hasta conocer la composición no se monta ningún bloque: así no se piden datos de lo que el
        // usuario tiene oculto ni la pantalla se recompone al llegar su preferencia.
        <Box
          role="status"
          aria-busy="true"
          aria-label="Cargando tu panel"
          sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}
        >
          <Skeleton variant="rounded" sx={skeletonSx} />
          <Skeleton variant="rounded" sx={skeletonSx} />
          <Skeleton variant="rounded" sx={{ ...skeletonSx, gridColumn: { md: '1 / -1' } }} />
        </Box>
      ) : order.length === 0 ? (
        <Alert
          severity="info"
          action={
            settings.dashboard.isCustomized ? (
              <Button
                color="inherit"
                size="small"
                disabled={resetComposition.isPending}
                onClick={() => resetComposition.mutate()}
              >
                Restablecer
              </Button>
            ) : undefined
          }
        >
          Tu panel no tiene bloques visibles
        </Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 2, md: 3 },
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
            gridTemplateAreas: areas,
          }}
        >
          {order.map((key) => (
            <GridArea key={key} area={key}>
              {blocks[key]}
            </GridArea>
          ))}
        </Box>
      )}

      {resetComposition.isError ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          No se pudo restablecer el panel. Inténtalo de nuevo.
        </Alert>
      ) : null}

      <DashboardCustomizeDialog
        open={customizing}
        onClose={() => setCustomizing(false)}
        access={access}
      />
    </>
  );
}
