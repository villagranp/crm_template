import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  FormGroup,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import {
  ADMIN_ONLY_NOTE,
  AdminDialog,
  describeApiError,
  DetailList,
  DetailSection,
} from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import {
  ACTION_HINT,
  ACTION_LABEL,
  DATA_SCOPE_DESCRIPTION,
  DATA_SCOPE_LABEL,
  moduleLabel,
  ROLE_ERRORS,
  buildPermissionMatrix,
} from '../roles-format';
import type { MenuOptionSummary, Role } from '../roles.api';
import { ROLE_PERMISSIONS } from '../roles.permissions';
import {
  useMenuOptions,
  usePermissions,
  useReplaceRoleMenuOptions,
  useReplaceRolePermissions,
  useRole,
} from '../roles.queries';

import type { RoleFormMode } from './RoleFormDialog';

export interface RoleDetailDialogProps {
  roleId: string | null;
  onClose: () => void;
  /** Abre el formulario de edición o duplicado. */
  onOpenForm: (mode: RoleFormMode) => void;
}

type TabKey = 'datos' | 'permisos' | 'opciones';

/**
 * Detalle de un rol: datos, matriz de permisos y opciones de menú. Los roles
 * de sistema se ven en solo lectura con la invitación a duplicarlos (D1).
 */
export function RoleDetailDialog({ roleId, onClose, onOpenForm }: RoleDetailDialogProps) {
  const [tab, setTab] = useState<TabKey>('datos');
  const role = useRole(roleId);
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  // ADR-020: duplicar un rol es sólo para el administrador (UX; el backend decide).
  const canDuplicate = can(ROLE_PERMISSIONS.create) && isAdministrador;

  useEffect(() => {
    if (roleId) {
      setTab('datos');
    }
  }, [roleId]);

  return (
    <AdminDialog
      open={roleId !== null}
      onClose={onClose}
      title={role.data?.name ?? 'Rol'}
      subtitle="Roles y permisos"
      fullScreenBelow="md"
    >
      {role.isPending ? (
        <Stack role="status" aria-label="Cargando" spacing={1}>
          <Skeleton variant="text" />
          <Skeleton variant="text" />
        </Stack>
      ) : role.isError ? (
        <Alert severity="error">{describeApiError(role.error, ROLE_ERRORS).message}</Alert>
      ) : (
        <Stack spacing={2}>
          {role.data.isSystem ? (
            <Alert
              severity="info"
              action={
                canDuplicate ? (
                  <Button
                    color="inherit"
                    size="small"
                    variant="text"
                    startIcon={<ContentCopyOutlinedIcon />}
                    onClick={() => onOpenForm({ kind: 'duplicate', role: role.data })}
                  >
                    Duplicar
                  </Button>
                ) : undefined
              }
            >
              Rol del sistema: es de solo lectura porque la semilla lo repone en cada despliegue.
              Duplícalo para crear una variante editable.
            </Alert>
          ) : null}
          <Tabs
            value={tab}
            onChange={(_, value: TabKey) => setTab(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            aria-label="Secciones del rol"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab value="datos" label="Datos" />
            <Tab value="permisos" label="Permisos" />
            <Tab value="opciones" label="Opciones de menú" />
          </Tabs>
          {tab === 'datos' ? (
            <RoleSummary
              role={role.data}
              onEdit={() => onOpenForm({ kind: 'edit', role: role.data })}
            />
          ) : null}
          {tab === 'permisos' ? <PermissionMatrix role={role.data} /> : null}
          {tab === 'opciones' ? <MenuOptionsAssignment role={role.data} /> : null}
        </Stack>
      )}
    </AdminDialog>
  );
}

function RoleSummary({ role, onEdit }: { role: Role; onEdit: () => void }) {
  const can = useCan();
  const fields = [
    {
      label: 'Estado',
      value: (
        <Chip
          size="small"
          color={role.isActive ? 'success' : 'default'}
          label={role.isActive ? 'Activo' : 'Inactivo'}
        />
      ),
    },
    {
      label: 'Tipo',
      value: <Chip size="small" variant="outlined" label={role.isSystem ? 'Sistema' : 'Propio'} />,
    },
    { label: 'Código', value: role.code },
    {
      label: 'Alcance de datos',
      value: `${DATA_SCOPE_LABEL[role.dataScope]}. ${DATA_SCOPE_DESCRIPTION[role.dataScope]}`,
    },
    { label: 'Usuarios asignados', value: String(role.userCount) },
    { label: 'Descripción', value: role.description ?? '—', wide: true },
  ];

  return (
    <Stack spacing={2}>
      <DetailSection number={1} title="Datos generales">
        <DetailList items={fields} />
      </DetailSection>
      {!role.isSystem && can(ROLE_PERMISSIONS.edit) ? (
        <Box>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit}>
            Editar
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}

function PermissionMatrix({ role }: { role: Role }) {
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  const canLoad = can(ROLE_PERMISSIONS.viewPermissions);
  const wouldEdit = !role.isSystem && can(ROLE_PERMISSIONS.edit) && canLoad;
  // ADR-020: cambiar lo que concede un rol es sólo para el administrador. El
  // backend lo vuelve a exigir (403 ADMIN_ONLY); esto sólo evita ofrecerlo.
  const editable = wouldEdit && isAdministrador;
  const permissions = usePermissions(canLoad);
  const mutation = useReplaceRolePermissions(role.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissionCodes));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(new Set(role.permissionCodes));
  }, [role.permissionCodes]);

  const matrix = useMemo(() => buildPermissionMatrix(permissions.data ?? []), [permissions.data]);

  if (!canLoad) {
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {role.permissionCodes.map((code) => (
          <Chip key={code} size="small" label={code} />
        ))}
      </Stack>
    );
  }
  if (permissions.isPending) {
    return <Skeleton variant="rectangular" role="status" aria-label="Cargando" />;
  }
  if (permissions.isError) {
    return <Alert severity="error">{describeApiError(permissions.error).message}</Alert>;
  }

  const dirty =
    selected.size !== role.permissionCodes.length ||
    role.permissionCodes.some((code) => !selected.has(code));
  const toggle = (code: string, checked: boolean) => {
    setSaved(false);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  };

  return (
    <Stack spacing={3}>
      {wouldEdit && !isAdministrador ? <Alert severity="info">{ADMIN_ONLY_NOTE}</Alert> : null}
      {matrix.map((module) => (
        <DetailSection key={module.moduleKey} title={moduleLabel(module.moduleKey)}>
          <TableContainer className="scroll-x">
            <Table size="small" aria-label={`Permisos del módulo ${moduleLabel(module.moduleKey)}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Recurso</TableCell>
                  {module.actions.map((action) => (
                    <TableCell key={action} align="center">
                      <ActionHeader action={action} />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {module.resources.map(({ resource, byAction }) => (
                  <TableRow key={resource}>
                    <TableCell component="th" scope="row">
                      {resource}
                    </TableCell>
                    {module.actions.map((action) => {
                      const permission = byAction[action];
                      return (
                        <TableCell key={action} align="center" padding="checkbox">
                          {/* Sin permiso en el catálogo: celda vacía, no "no concedido" (AC-07.12). */}
                          {permission ? (
                            <Checkbox
                              checked={selected.has(permission.code)}
                              disabled={!editable || mutation.isPending}
                              onChange={(event) => toggle(permission.code, event.target.checked)}
                              inputProps={{ 'aria-label': permission.code }}
                            />
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DetailSection>
      ))}
      {mutation.isError ? (
        <Alert severity="error">{describeApiError(mutation.error, ROLE_ERRORS).message}</Alert>
      ) : null}
      {saved ? <Alert severity="success">Permisos actualizados.</Alert> : null}
      {editable ? (
        <Box>
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              const ids = (permissions.data ?? [])
                .filter((permission) => selected.has(permission.code))
                .map((p) => p.id);
              mutation.mutate(ids, { onSuccess: () => setSaved(true) });
            }}
          >
            Guardar permisos
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}

/** Cabecera de una operación de la matriz; con ayuda emergente si la necesita (p. ej. Administrar). */
function ActionHeader({ action }: { action: string }) {
  const label = ACTION_LABEL[action] ?? action;
  const hint = ACTION_HINT[action];
  if (!hint) {
    return label;
  }
  return (
    <Tooltip title={hint} describeChild>
      <Box
        component="span"
        tabIndex={0}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}
      >
        {label}
        <InfoOutlinedIcon fontSize="inherit" aria-hidden />
      </Box>
    </Tooltip>
  );
}

function MenuOptionsAssignment({ role }: { role: Role }) {
  const can = useCan();
  const isAdministrador = useIsAdministrador();
  const canLoad = can(ROLE_PERMISSIONS.viewMenuOptions);
  const wouldEdit = !role.isSystem && can(ROLE_PERMISSIONS.assignMenuOptions) && canLoad;
  // ADR-020: igual que la matriz de permisos, sólo el administrador (el backend decide).
  const editable = wouldEdit && isAdministrador;
  const options = useMenuOptions(canLoad);
  const mutation = useReplaceRoleMenuOptions(role.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.menuOptionIds));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(new Set(role.menuOptionIds));
  }, [role.menuOptionIds]);

  const byModule = useMemo(() => {
    const groups = new Map<string, MenuOptionSummary[]>();
    for (const option of options.data ?? []) {
      groups.set(option.module.name, [...(groups.get(option.module.name) ?? []), option]);
    }
    return [...groups.entries()];
  }, [options.data]);

  if (!canLoad) {
    return (
      <Typography variant="body2">Concede {role.menuOptionIds.length} opciones de menú.</Typography>
    );
  }
  if (options.isPending) {
    return <Skeleton variant="rectangular" role="status" aria-label="Cargando" />;
  }
  if (options.isError) {
    return <Alert severity="error">{describeApiError(options.error).message}</Alert>;
  }

  const dirty =
    selected.size !== role.menuOptionIds.length ||
    role.menuOptionIds.some((id) => !selected.has(id));

  return (
    <Stack spacing={2}>
      {wouldEdit && !isAdministrador ? <Alert severity="info">{ADMIN_ONLY_NOTE}</Alert> : null}
      <Typography variant="body2" color="text.secondary">
        Una opción sólo aparece en el menú si además se tiene el permiso que exige.
      </Typography>
      {byModule.map(([moduleName, moduleOptions]) => (
        <FormGroup key={moduleName} aria-label={`Opciones del módulo ${moduleName}`}>
          <Typography variant="subtitle2" component="h3">
            {moduleName}
          </Typography>
          {moduleOptions.map((option) => (
            <FormControlLabel
              key={option.id}
              sx={{ pl: option.parentId ? 3 : 0 }}
              label={option.isActive ? option.label : `${option.label} (inactiva)`}
              control={
                <Checkbox
                  checked={selected.has(option.id)}
                  disabled={!editable || mutation.isPending}
                  onChange={(event) => {
                    setSaved(false);
                    setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) {
                        next.add(option.id);
                      } else {
                        next.delete(option.id);
                      }
                      return next;
                    });
                  }}
                />
              }
            />
          ))}
        </FormGroup>
      ))}
      {mutation.isError ? (
        <Alert severity="error">{describeApiError(mutation.error, ROLE_ERRORS).message}</Alert>
      ) : null}
      {saved ? <Alert severity="success">Opciones actualizadas.</Alert> : null}
      {editable ? (
        <Box>
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate([...selected], { onSuccess: () => setSaved(true) })}
          >
            Guardar opciones
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}
