import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Alert, Box, Skeleton, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Profile } from '@/services/access';
import type { ApiError } from '@/services/api';
import { layout } from '@/theme/tokens';
import { sectionLabelSx } from '@/theme/typography';

import { DATA_SCOPE_LABELS } from '../dashboard-format';
import { KpiCard } from './KpiCard';

const PROFILE_CARD_COUNT = 4;

/**
 * "Mi acceso" (01 §E.2, RN-01.6): las cuatro tarjetas que ya mostraba el panel
 * (roles, permisos efectivos, alcance de datos y equipos), de `GET /me`.
 */
export function AccessSummary({ profile }: { profile: UseQueryResult<Profile, ApiError> }) {
  let content;

  if (profile.isError) {
    content = (
      <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
        No se pudo cargar tu perfil. Recarga la página para intentarlo de nuevo.
      </Alert>
    );
  } else if (profile.isPending) {
    content = Array.from({ length: PROFILE_CARD_COUNT }).map((_, index) => (
      <Skeleton
        key={index}
        variant="rounded"
        sx={{
          height: '100%',
          minHeight: (theme) => theme.spacing(20),
          borderRadius: `${layout.radius}px`,
        }}
      />
    ));
  } else {
    const { roles, permissions, teams, dataScope } = profile.data;
    content = (
      <>
        <KpiCard
          tone="brand"
          icon={<BadgeOutlinedIcon />}
          label="Roles asignados"
          value={roles.length}
          foot={roles.length > 0 ? roles.join(', ') : 'Sin roles asignados'}
        />
        <KpiCard
          tone="brandSoft"
          icon={<VerifiedUserOutlinedIcon />}
          label="Permisos efectivos"
          value={permissions.length}
          foot="Resueltos en el servidor a partir de tus roles"
        />
        <KpiCard
          icon={<PublicOutlinedIcon />}
          label="Alcance de datos"
          value={DATA_SCOPE_LABELS[dataScope]}
          foot="El más amplio entre tus roles"
        />
        <KpiCard
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

  return (
    <Box component="section" aria-labelledby="home-my-access">
      <Typography
        id="home-my-access"
        component="h2"
        sx={{ ...sectionLabelSx, color: 'text.secondary', mb: 1.5 }}
      >
        Mi acceso
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          gridAutoRows: 'minmax(min-content, auto)',
        }}
      >
        {content}
      </Box>
    </Box>
  );
}
