import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import { Alert, Box, Button, Card, Chip, List, ListItem, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { describeApiError, EmptyState } from '@/features/admin/common';

import { buildTeamTree } from '../team-tree';
import type { Team } from '../teams.api';
import { useTeamHierarchy } from '../teams.queries';

export interface TeamTreeProps {
  rowActions: (team: Team) => ReactNode;
}

/** Vista jerárquica: lista sangrada por profundidad (padres antes que hijos). */
export function TeamTree({ rowActions }: TeamTreeProps) {
  const hierarchy = useTeamHierarchy();

  if (hierarchy.isError) {
    return (
      <Card sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" variant="text" onClick={() => void hierarchy.refetch()}>
              Reintentar
            </Button>
          }
        >
          {describeApiError(hierarchy.error).message}
        </Alert>
      </Card>
    );
  }

  if (hierarchy.isPending) {
    return (
      <Card sx={{ p: 2 }}>
        <Stack role="status" aria-label="Cargando" spacing={1}>
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="text" />
        </Stack>
      </Card>
    );
  }

  const rows = buildTeamTree(hierarchy.data);
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="Todavía no hay equipos" />
      </Card>
    );
  }

  return (
    <Card>
      <List aria-label="Jerarquía de equipos">
        {rows.map(({ team, depth }) => (
          <ListItem key={team.id} divider sx={{ pl: 2 + depth * 3, alignItems: 'flex-start' }}>
            <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: 'center', flexWrap: 'wrap' }}>
              {depth > 0 ? <SubdirectoryArrowRightIcon aria-hidden fontSize="small" color="action" /> : null}
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" sx={{ overflowWrap: 'anywhere' }}>
                  {team.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {`${team.code} · ${team.memberCount} miembro${team.memberCount === 1 ? '' : 's'}`}
                  {team.manager ? ` · Responsable: ${team.manager.displayName}` : ''}
                </Typography>
              </Box>
              {team.isActive ? null : <Chip size="small" label="Inactivo" />}
            </Stack>
            <Stack direction="row" spacing={0.5}>
              {rowActions(team)}
            </Stack>
          </ListItem>
        ))}
      </List>
    </Card>
  );
}
