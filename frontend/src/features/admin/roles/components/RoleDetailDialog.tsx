import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useMemo, useState } from 'react';

import { ADMIN_ONLY_NOTE, describeApiError } from '@/features/admin/common';
import { useCan, useIsAdministrador } from '@/hooks/use-permission';

import { ACTION_LABEL, DATA_SCOPE_LABEL, ROLE_ERRORS, buildPermissionMatrix } from '../roles-format';
import type { MenuOptionSummary, Role } from '../roles.api';
import { ROLE_PERMISSIONS } from '../roles.permissions';
import { useMenuOptions, usePermissions, useReplaceRoleMenuOptions, useReplaceRolePermissions, useRole } from '../roles.queries';

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
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
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
    <Dialog open={roleId !== null} onClose={onClose} aria-labelledby={titleId} fullScreen={fullScreen} fullWidth maxWidth="md">
      <DialogTitle id={titleId}>{role.data?.name ?? 'Rol'}</DialogTitle>
      <DialogContent dividers>
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
                Rol del sistema: es de solo lectura porque la semilla lo repone en cada despliegue. Duplícalo para crear una
                variante editable.
              </Alert>
            ) : null}
            <Tabs
              value={tab}
              onChange={(_, value: TabKey) => setTab(value)}
              variant="scrollable"
              allowScrollButtonsMobile
              aria-label="Secciones del rol"
            >
              <Tab value="datos" label="Datos" />
              <Tab value="permisos" label="Permisos" />
              <Tab value="opciones" label="Opciones de menú" />
            </Tabs>
            {tab === 'datos' ? <RoleSummary role={role.data} onEdit={() => onOpenForm({ kind: 'edit', role: role.data })} /> : null}
            {tab === 'permisos' ? <PermissionMatrix role={role.data} /> : null}
            {tab === 'opciones' ? <MenuOptionsAssignment role={role.data} /> : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RoleSummary({ role, onEdit }: { role: Role; onEdit: () => void }) {
  const can = useCan();
  const fields: [string, string][] = [
    ['Código', role.code],
    ['Descripción', role.description ?? '—'],
    ['Alcance de datos', DATA_SCOPE_LABEL[role.dataScope]],
    ['Usuarios asignados', String(role.userCount)],
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <Chip size="small" color={role.isActive ? 'success' : 'default'} label={role.isActive ? 'Activo' : 'Inactivo'} />
        <Chip size="small" variant="outlined" label={role.isSystem ? 'Sistema' : 'Propio'} />
      </Stack>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
        {fields.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
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
    selected.size !== role.permissionCodes.length || role.permissionCodes.some((code) => !selected.has(code));
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
        <Box key={module.moduleKey} component="section">
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1, textTransform: 'capitalize' }}>
            {module.moduleKey}
          </Typography>
          <TableContainer className="scroll-x">
            <Table size="small" aria-label={`Permisos del módulo ${module.moduleKey}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Recurso</TableCell>
                  {module.actions.map((action) => (
                    <TableCell key={action} align="center">
                      {ACTION_LABEL[action] ?? action}
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
        </Box>
      ))}
      {mutation.isError ? <Alert severity="error">{describeApiError(mutation.error, ROLE_ERRORS).message}</Alert> : null}
      {saved ? <Alert severity="success">Permisos actualizados.</Alert> : null}
      {editable ? (
        <Box>
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              const ids = (permissions.data ?? []).filter((permission) => selected.has(permission.code)).map((p) => p.id);
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
    return <Typography variant="body2">Concede {role.menuOptionIds.length} opciones de menú.</Typography>;
  }
  if (options.isPending) {
    return <Skeleton variant="rectangular" role="status" aria-label="Cargando" />;
  }
  if (options.isError) {
    return <Alert severity="error">{describeApiError(options.error).message}</Alert>;
  }

  const dirty = selected.size !== role.menuOptionIds.length || role.menuOptionIds.some((id) => !selected.has(id));

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
      {mutation.isError ? <Alert severity="error">{describeApiError(mutation.error, ROLE_ERRORS).message}</Alert> : null}
      {saved ? <Alert severity="success">Opciones actualizadas.</Alert> : null}
      {editable ? (
        <Box>
          <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate([...selected], { onSuccess: () => setSaved(true) })}>
            Guardar opciones
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}
