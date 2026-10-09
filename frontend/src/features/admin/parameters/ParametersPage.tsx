import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fragment, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, describeApiError, EmptyState } from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { ParameterEditDialog } from './components/ParameterEditDialog';
import type { SystemParameter } from './parameters.api';
import { PARAMETER_PERMISSIONS } from './parameters.permissions';
import { useParameters } from './parameters.queries';

const TITLE = 'Parámetros';
const SKELETON_GROUPS = 2;

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
      sx={{ py: 1.5 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" component="h3">
          {parameter.name}
        </Typography>
        {parameter.description ? (
          <Typography variant="body2" color="text.secondary">
            {parameter.description}
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
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
          <IconButton aria-label={`Editar ${parameter.name}`} onClick={onEdit}>
            <EditOutlinedIcon />
          </IconButton>
        ) : null}
        {lockedByConfigure ? (
          <Tooltip title="Requiere el permiso de configuración de seguridad">
            <LockOutlinedIcon aria-label="Sólo lectura: requiere permiso de configuración" color="disabled" />
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
  const [editing, setEditing] = useState<SystemParameter | null>(null);

  const canEditAny = can(PARAMETER_PERMISSIONS.edit);
  const canConfigure = can(PARAMETER_PERMISSIONS.configure);

  let content;
  if (parameters.isPending) {
    content = (
      <Stack role="status" aria-label="Cargando" spacing={2}>
        {Array.from({ length: SKELETON_GROUPS }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(20) }} />
        ))}
      </Stack>
    );
  } else if (parameters.isError) {
    content = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" variant="text" onClick={() => void parameters.refetch()}>
            Reintentar
          </Button>
        }
      >
        {describeApiError(parameters.error).message}
      </Alert>
    );
  } else if (parameters.data.length === 0) {
    content = (
      <Card>
        <EmptyState title="No hay parámetros" description="Los parámetros llegan con la semilla del sistema." />
      </Card>
    );
  } else {
    content = (
      <Stack spacing={2}>
        {parameters.data.map((group) => (
          <Card key={group.group} component="section" aria-label={groupLabel(group.group)}>
            <CardHeader title={groupLabel(group.group)} titleTypographyProps={{ variant: 'h6', component: 'h2' }} />
            <CardContent sx={{ pt: 0 }}>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {group.parameters.map((parameter, index) => {
                  const lockedByConfigure = canEditAny && parameter.requiresConfigurePermission && !canConfigure;
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
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <>
      <PageHeader title={TITLE} subtitle="Valores de configuración que lee la aplicación." breadcrumbs={adminBreadcrumbs(TITLE)} />
      {content}
      <ParameterEditDialog parameter={editing} onClose={() => setEditing(null)} />
    </>
  );
}
