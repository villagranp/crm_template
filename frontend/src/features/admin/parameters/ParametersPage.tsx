import CurrencyExchangeOutlinedIcon from '@mui/icons-material/CurrencyExchangeOutlined';
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
import { Fragment, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

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
import { ROUTE_PATHS } from '@/routes/route-paths';

import { AuthenticationSettingsCard } from './components/AuthenticationSettingsCard';
import { ParameterEditDialog } from './components/ParameterEditDialog';
import { parseDashboardComposition } from './components/editors/editor-metadata';
import { toSections, type ParameterSection } from './parameter-sections';
import type { SystemParameter } from './parameters.api';
import { PARAMETER_PERMISSIONS } from './parameters.permissions';
import { parameterKeys, useParameters } from './parameters.queries';

const TITLE = 'Parámetros';
const DESCRIPTION = 'Valores de configuración que lee la aplicación.';
const SKELETON_ROWS = 4;

const ACCESS_SECTION_ID = 'acceso';
const FORECAST_SECTION_ID = 'crm-forecast';
const CONFIGURE_NOTE = 'Requiere el permiso de configuración (parametros.configurar).';

function displayValue(parameter: SystemParameter): string {
  if (parameter.type === 'BOOLEAN') {
    return parameter.value === 'true' ? 'Sí' : 'No';
  }
  if (parameter.editor === 'dashboard-cards') {
    const composition = parseDashboardComposition(parameter.value);
    if (composition) {
      const hidden = [...composition.blocks, ...composition.kpis].filter((entry) => !entry.visible).length;
      return `${composition.blocks.length} bloques y ${composition.kpis.length} indicadores (${hidden} ocultos)`;
    }
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
          sx={{ display: 'block', fontFamily: 'monospace', overflowWrap: 'anywhere' }}
        >
          {parameter.key}
        </Typography>
        {lockedByConfigure ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {CONFIGURE_NOTE}
          </Typography>
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
        {parameter.isPublic ? <Chip size="small" label="Público" /> : null}
        {parameter.readOnly ? <Chip size="small" variant="outlined" label="Sólo lectura" /> : null}
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
          <Tooltip title={CONFIGURE_NOTE}>
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

/** La sección Acceso siempre está: lleva el proveedor de autenticación aunque no haya parámetros `seguridad.*`. */
function withAccessSection(sections: ParameterSection[]): ParameterSection[] {
  if (sections.length === 0 || sections.some((section) => section.id === ACCESS_SECTION_ID)) {
    return sections;
  }
  return [{ id: ACCESS_SECTION_ID, label: 'Acceso', parameters: [] }, ...sections];
}

function isLockedByConfigure(parameter: SystemParameter, canEditAny: boolean, canConfigure: boolean): boolean {
  const requiresConfigure = parameter.requiresConfigure ?? parameter.requiresConfigurePermission;
  return canEditAny && !parameter.readOnly && requiresConfigure && !canConfigure;
}

function ParameterRows({
  parameters,
  canEditAny,
  canConfigure,
  onEdit,
}: {
  parameters: SystemParameter[];
  canEditAny: boolean;
  canConfigure: boolean;
  onEdit: (parameter: SystemParameter) => void;
}) {
  if (parameters.length === 0) {
    return null;
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
      {parameters.map((parameter, index) => {
        const lockedByConfigure = isLockedByConfigure(parameter, canEditAny, canConfigure);
        return (
          <Fragment key={parameter.key}>
            {index > 0 ? <Divider component="li" aria-hidden /> : null}
            <ParameterRow
              parameter={parameter}
              canEdit={canEditAny && !parameter.readOnly && !lockedByConfigure}
              lockedByConfigure={lockedByConfigure}
              onEdit={() => onEdit(parameter)}
            />
          </Fragment>
        );
      })}
    </Box>
  );
}

function SectionBlock({
  section,
  action,
  children,
}: {
  section: ParameterSection;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-label={section.label}
      sx={{ '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'divider' } }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={(theme) => ({
          bgcolor: subtleSurface(theme),
          px: { xs: 2, md: 2.5 },
          py: action ? 0.5 : 1,
          borderBottom: 1,
          borderColor: 'divider',
        })}
      >
        <Typography
          component="h3"
          aria-hidden
          sx={(theme) => ({
            ...theme.typography.overline,
            fontFamily: theme.typography.fontFamily,
            fontWeight: 700,
            color: theme.palette.text.secondary,
          })}
        >
          {section.label}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
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
  const sections = withAccessSection(parameters.data ? toSections(parameters.data) : []);

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
  } else if (sections.length === 0) {
    content = (
      <EmptyState
        icon={<TuneOutlinedIcon />}
        title="No hay parámetros"
        description="Los parámetros llegan con la semilla del sistema."
      />
    );
  } else {
    content = sections.map((section) => {
      const rows = (
        <ParameterRows
          parameters={section.parameters}
          canEditAny={canEditAny}
          canConfigure={canConfigure}
          onEdit={setEditing}
        />
      );
      return (
        <SectionBlock
          key={section.id}
          section={section}
          action={
            section.id === FORECAST_SECTION_ID ? (
              <Button
                component={RouterLink}
                to={ROUTE_PATHS.admin.exchangeRates}
                size="small"
                startIcon={<CurrencyExchangeOutlinedIcon />}
              >
                Tipos de cambio
              </Button>
            ) : null
          }
        >
          {section.id === ACCESS_SECTION_ID ? <AuthenticationSettingsCard>{rows}</AuthenticationSettingsCard> : rows}
        </SectionBlock>
      );
    });
  }

  const total = parameters.data ? sections.reduce((sum, section) => sum + section.parameters.length, 0) : undefined;

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
