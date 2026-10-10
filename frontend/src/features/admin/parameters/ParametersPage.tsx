import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  describeApiError,
  EmptyState,
  recordsSubtitle,
  RefreshTool,
  subtleSurface,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { ParameterEditDialog } from './components/ParameterEditDialog';
import type { SystemParameter } from './parameters.api';
import { PARAMETER_PERMISSIONS } from './parameters.permissions';
import { parameterKeys, useParameters } from './parameters.queries';

const TITLE = 'Parámetros';
const DESCRIPTION = 'Valores de configuración que lee la aplicación.';
const SKELETON_ROWS = 4;

const GROUP_LABELS: Readonly<Record<string, string>> = {
  general: 'General',
  seguridad: 'Seguridad',
  auditoria: 'Auditoría',
  interfaz: 'Interfaz',
};

function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

function displayValue(parameter: SystemParameter): string {
  if (parameter.type === 'BOOLEAN') {
    return parameter.value === 'true' ? 'Sí' : 'No';
  }
  return parameter.value;
}

function ParameterRow({
  parameter,
  canEdit,
  lockedByConfigure,
  onEdit,
}: {
  parameter: SystemParameter;
  canEdit: boolean;
  lockedByConfigure: boolean;
  onEdit: () => void;
}) {
  return (
    <Stack
      component="li"
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 1, sm: 2 }}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{ py: 1.5, px: { xs: 2, md: 2.5 } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" component="h3" sx={{ fontWeight: 600 }}>
          {parameter.name}
        </Typography>
        {parameter.description ? (
          <Typography variant="body2" color="text.secondary">
            {parameter.description}
          </Typography>
        ) : null}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}
        >
          {parameter.key}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
        {parameter.isPublic ? <Chip size="small" label="Público" /> : null}
        <Typography
          variant="body2"
          sx={{
            fontFamily: parameter.type === 'JSON' ? 'monospace' : undefined,
            overflowWrap: 'anywhere',
            flex: 1,
            textAlign: { sm: 'right' },
          }}
          aria-label={`Valor de ${parameter.name}`}
        >
          {displayValue(parameter)}
        </Typography>
        {canEdit ? (
          <IconButton
            aria-label={`Editar ${parameter.name}`}
            onClick={onEdit}
            sx={{ color: 'text.secondary' }}
          >
            <EditOutlinedIcon />
          </IconButton>
        ) : null}
        {lockedByConfigure ? (
          <Tooltip title="Requiere el permiso de configuración de seguridad">
            <LockOutlinedIcon
              aria-label="Sólo lectura: requiere permiso de configuración"
              color="disabled"
            />
          </Tooltip>
        ) : null}
      </Stack>
    </Stack>
  );
}

/** Pantalla de administración «Parámetros». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function ParametersPage() {
  const can = useCan();
  const parameters = useParameters();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SystemParameter | null>(null);

  const canEditAny = can(PARAMETER_PERMISSIONS.edit);
  const canConfigure = can(PARAMETER_PERMISSIONS.configure);

  let content;
  if (parameters.isPending) {
    content = (
      <Stack role="status" aria-label="Cargando" spacing={1} sx={{ p: 2 }}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} variant="text" />
        ))}
      </Stack>
    );
  } else if (parameters.isError) {
    content = (
      <EmptyState
        role="alert"
        title="No se pudieron cargar los parámetros"
        description={describeApiError(parameters.error).message}
        action={
          <Button variant="outlined" onClick={() => void parameters.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (parameters.data.length === 0) {
    content = (
      <EmptyState
        icon={<TuneOutlinedIcon />}
        title="No hay parámetros"
        description="Los parámetros llegan con la semilla del sistema."
      />
    );
  } else {
    content = parameters.data.map((group) => (
      <Box
        key={group.group}
        component="section"
        aria-label={groupLabel(group.group)}
        sx={{ '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'divider' } }}
      >
        <Typography
          component="h3"
          aria-hidden
          sx={(theme) => ({
            ...theme.typography.overline,
            fontFamily: theme.typography.fontFamily,
            fontWeight: 700,
            color: theme.palette.text.secondary,
            bgcolor: subtleSurface(theme),
            px: { xs: 2, md: 2.5 },
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
          })}
        >
          {groupLabel(group.group)}
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {group.parameters.map((parameter, index) => {
            const lockedByConfigure =
              canEditAny && parameter.requiresConfigurePermission && !canConfigure;
            return (
              <Fragment key={parameter.key}>
                {index > 0 ? <Divider component="li" aria-hidden /> : null}
                <ParameterRow
                  parameter={parameter}
                  canEdit={canEditAny && !lockedByConfigure}
                  lockedByConfigure={lockedByConfigure}
                  onEdit={() => setEditing(parameter)}
                />
              </Fragment>
            );
          })}
        </Box>
      </Box>
    ));
  }

  const total = parameters.data?.reduce((sum, group) => sum + group.parameters.length, 0);

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />
      <AdminListCard
        icon={<TuneOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(total, DESCRIPTION, ['parámetro', 'parámetros'])}
        tools={
          <RefreshTool
            busy={parameters.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: parameterKeys.all })}
          />
        }
      >
        {content}
      </AdminListCard>
      <ParameterEditDialog parameter={editing} onClose={() => setEditing(null)} />
    </>
  );
}
