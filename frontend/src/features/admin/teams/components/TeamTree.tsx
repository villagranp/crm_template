import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import { Box, Button, Chip, List, ListItem, Skeleton, Stack } from '@mui/material';
import type { ReactNode } from 'react';

import { describeApiError, EmptyState, RowIdentity } from '@/features/admin/common';

import { buildTeamTree } from '../team-tree';
import type { Team } from '../teams.api';
import { useTeamHierarchy } from '../teams.queries';

export interface TeamTreeProps {
  rowActions: (team: Team) => ReactNode;
}

/** Sangría por nivel, en unidades de espaciado del tema. */
const INDENT_PER_LEVEL = 3;

/**
 * Vista jerárquica: lista sangrada por profundidad (padres antes que hijos).
 * Va a sangre dentro de la tarjeta de listado de la pantalla.
 */
export function TeamTree({ rowActions }: TeamTreeProps) {
  const hierarchy = useTeamHierarchy();

  if (hierarchy.isError) {
    return (
      <EmptyState
        role="alert"
        title="No se pudo cargar la jerarquía"
        description={describeApiError(hierarchy.error).message}
        action={
          <Button variant="outlined" onClick={() => void hierarchy.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (hierarchy.isPending) {
    return (
      <Stack role="status" aria-label="Cargando" spacing={1} sx={{ p: 2 }}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </Stack>
    );
  }

  const rows = buildTeamTree(hierarchy.data);
  if (rows.length === 0) {
    return <EmptyState icon={<AccountTreeOutlinedIcon />} title="Todavía no hay equipos" />;
  }

  return (
    <List aria-label="Jerarquía de equipos" disablePadding>
      {rows.map(({ team, depth }) => (
        <ListItem
          key={team.id}
          divider
          sx={{
            pl: { xs: 2 + depth * INDENT_PER_LEVEL, md: 2.5 + depth * INDENT_PER_LEVEL },
            py: 1.25,
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ flex: '1 1 14rem', minWidth: 0, alignItems: 'center' }}
          >
            {depth > 0 ? (
              <SubdirectoryArrowRightIcon aria-hidden fontSize="small" color="action" />
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              <RowIdentity
                name={team.name}
                secondary={[
                  team.code,
                  `${team.memberCount} miembro${team.memberCount === 1 ? '' : 's'}`,
                  team.manager ? `Responsable: ${team.manager.displayName}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Box>
            {team.isActive ? null : <Chip size="small" label="Inactivo" />}
          </Stack>
          <Stack direction="row" spacing={0.25} sx={{ color: 'text.secondary', ml: 'auto' }}>
            {rowActions(team)}
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}
