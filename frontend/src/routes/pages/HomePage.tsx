import { Alert, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

import { PageHeader } from '@/components/layout/PageHeader';
import { env } from '@/config/env';
import { useHealth } from '@/hooks/use-health';
import { useProfile } from '@/hooks/use-profile';

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Página de inicio de la plantilla.
 *
 * Su único trabajo es demostrar el cableado de extremo a extremo: tema, shell,
 * enrutador, cliente HTTP, TanStack Query y los contratos de salud y de perfil.
 * No contiene nada de negocio y se espera que la sustituya la primera
 * funcionalidad real del proyecto.
 */
export function HomePage() {
  const health = useHealth();
  const profile = useProfile();

  return (
    <>
      <PageHeader
        title="Panel de control"
        subtitle="Esqueleto de la plantilla: gobernanza, estándares y gestión de accesos. Sin funcionalidad de negocio."
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Panel de control' }]}
        metrics={
          <>
            <MetricCard
              label="API"
              value={health.isPending ? '…' : health.data ? 'En línea' : 'Sin conexión'}
              hint={env.VITE_API_BASE_URL}
            />
            <MetricCard
              label="Sesión"
              value={profile.data ? profile.data.displayName : 'Anónima'}
              hint={profile.data ? profile.data.roles.join(', ') || 'Sin roles' : 'Inicia sesión para ver tu menú'}
            />
            <MetricCard
              label="Permisos efectivos"
              value={profile.data ? String(profile.data.permissions.length) : '0'}
              hint={profile.data ? `Alcance: ${profile.data.dataScope}` : 'Se resuelven en el servidor'}
            />
          </>
        }
      />

      <Stack spacing={3}>
        {health.isError ? (
          <Alert severity="warning">
            No se pudo contactar al backend: {health.error.message}
            {health.error.correlationId ? ` (ID de correlación ${health.error.correlationId})` : ''}
          </Alert>
        ) : null}

        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Siguiente paso
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Lee <code>CLAUDE.md</code> y sigue <code>.claude/skills/feature-development/SKILL.md</code>. El menú lateral
              se genera desde las opciones que el backend concede al usuario, así que una opción nueva empieza en la base
              de datos, no en el código del frontend.
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Configuración activa
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" label={`Autenticación: ${env.VITE_AUTH_PROVIDER}`} />
              <Chip size="small" variant="outlined" label={`API: ${env.VITE_API_BASE_URL}`} />
              {health.data ? <Chip size="small" color="success" label={`Salud: ${health.data.status}`} /> : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
